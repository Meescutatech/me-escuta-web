import { criarClienteServidor } from "@/lib/supabase/server";
import { TETO_CARDS, chavesDoBoard, houveCorte } from "./funil-calculos";
import { parseTags } from "./ficha-calculos";

/**
 * Camada de leitura do FUNIL. Casada com o schema real (Agent 2, migrations 0009+0010) —
 * "Contrato de leitura do board" no CONTRATO-EVENTOS-MVP:
 *  - ETAPAS: core.v_config_vigente (nome='funil_vendas', versão vigente) → payload.etapas
 *            [{chave, nome, ordem, cor, tipo}]  (chave, NÃO id; cor hex; tipo aberto/ganho/perdido)
 *  - CARDS:  core.v_lead_card → {lead_id, nome, telefone, etapa, entrou_etapa_em, valor, origem,
 *            dono, tags, kommo_lead_id}  (dono = um campo; nome/telefone/valor podem ser NULL;
 *            idade/paciente entram na 0011 — não contar com eles ainda)
 *
 * Só dado real (Rodada 7, D3): sem cards, o board mostra o estado vazio honesto. As ETAPAS_PADRAO
 * são estrutura de config (espelho do funil_vendas), não dado de lead — valem só como fallback
 * estrutural se a config não puder ser lida.
 */

export type Origem = "wa" | "ig" | "meta" | "ind";
export type TipoResp = "dm" | "sara" | "fono";
export type AgenteProp = "clara" | "lev";
export type TipoEtapa = "aberto" | "ganho" | "perdido";

export interface EtapaFunil {
  chave: string; // 'novo', 'qualificando', … (contrato: chave, não id)
  nome: string;
  cor: string; // hex
  tipo: TipoEtapa;
  ordem: number;
}

export interface PropostaPendente {
  agente: AgenteProp;
  texto: string; // resumo curto (pode conter <b>)
}

export interface CardLead {
  lead_id: string;
  nome: string | null;
  idade: number | null; // vem só na 0011 — hoje null pra cards reais
  telefone: string | null;
  etapa: string; // = chave da etapa
  entrou_etapa_em: string | null;
  valor: number | null;
  origem: Origem | null;
  responsavel: { tipo: TipoResp; nome: string } | null; // dono_nome (vínculo uuid) > derivado de `dono` legado
  dono_id: string | null; // uuid de core.usuario (0060) — base do "meus leads"
  dono_nome: string | null; // resolvido pela view em core.usuario
  tags: string[]; // core.lead.tags (jsonb) — a view já retorna; base do filtro por tag
  proposta: PropostaPendente | null; // não vem da view ainda — null até o laço de sugestões chegar no card
  kommo_lead_id?: string | null;
}

export interface DadosFunil {
  etapas: EtapaFunil[];
  cards: CardLead[];
  /** Leitura bateu no TETO_CARDS — a UI avisa que o board mostra os mais recentes, nunca finge completude. */
  corte: boolean;
}

// ─────────────── etapas padrão (espelho do funil_vendas v2 real) ───────────────

export const ETAPAS_PADRAO: EtapaFunil[] = [
  { chave: "novo", nome: "Novo lead", cor: "#94a3b8", tipo: "aberto", ordem: 1 },
  { chave: "qualificando", nome: "Qualificando", cor: "#38bdf8", tipo: "aberto", ordem: 2 },
  { chave: "avaliacao", nome: "Avaliação auditiva", cor: "#a78bfa", tipo: "aberto", ordem: 3 },
  { chave: "proposta", nome: "Proposta enviada", cor: "#fbbf24", tipo: "aberto", ordem: 4 },
  { chave: "negociacao", nome: "Negociação", cor: "#fb923c", tipo: "aberto", ordem: 5 },
  { chave: "ganho", nome: "Ganho", cor: "#34d399", tipo: "ganho", ordem: 90 },
  { chave: "perdido", nome: "Perdido", cor: "#f87171", tipo: "perdido", ordem: 91 },
];

// ─────────────── leitura real ───────────────

const MAPA_ORIGEM: Record<string, Origem> = {
  whatsapp: "wa", wa: "wa", instagram: "ig", ig: "ig",
  meta: "meta", "meta ads": "meta", facebook: "meta", ind: "ind", indicacao: "ind", "indicação": "ind",
};

/**
 * Deriva um responsável exibível do campo `dono`. Regra do spec (legenda de chips): o chip é um
 * ATOR REAL atribuído (IA=Clara | humano nomeado). Artefato de import (`kommo:<id>`), `humano:<uid>`
 * sem nome legível, ou null → SEM chip (não inventar ator — feedback 19/07).
 */
function donoParaResponsavel(dono: string | null): { tipo: TipoResp; nome: string } | null {
  if (!dono) return null;
  const d = dono.trim();
  if (/^kommo:/i.test(d) || /^humano:/i.test(d) || /^sistema$/i.test(d) || /^bot$/i.test(d)) return null;
  if (/clara|jarvis|\bia\b/i.test(d)) return { tipo: "dm", nome: "Clara" }; // cor decidida por respEhIA
  const tipo: TipoResp = /sara/i.test(d) ? "sara" : /fono/i.test(d) ? "fono" : "dm";
  return { tipo, nome: d };
}

export async function lerEtapasReais(): Promise<EtapaFunil[] | null> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .schema("core")
    .from("v_config_vigente")
    .select("payload")
    .eq("nome", "funil_vendas")
    .maybeSingle();
  if (error || !data) return null;
  const etapas = (data.payload as any)?.etapas;
  if (!Array.isArray(etapas) || etapas.length === 0) return null;
  return etapas
    .map((e: any, i: number) => ({
      chave: String(e.chave ?? e.id ?? i),
      nome: String(e.nome ?? e.chave),
      cor: String(e.cor ?? ETAPAS_PADRAO[i]?.cor ?? "#94a3b8"),
      tipo: (e.tipo ?? "aberto") as TipoEtapa,
      ordem: Number(e.ordem ?? i + 1),
    }))
    .sort((a, b) => a.ordem - b.ordem);
}

async function lerCardsReais(chavesEtapas: string[]): Promise<{ cards: CardLead[]; corte: boolean }> {
  const supabase = criarClienteServidor();
  // Só etapas do board (config vigente) — 'arquivado' etc. NUNCA entram nem roubam vaga do
  // teto. Order determinístico (mais recentes primeiro + lead_id de desempate): se o volume
  // passar do teto, o corte é estável entre reloads e a UI avisa (flag `corte`).
  const { data, error } = await supabase
    .schema("core")
    .from("v_lead_card")
    .select("lead_id,nome,telefone,etapa,entrou_etapa_em,valor,origem,dono,dono_id,dono_nome,tags,kommo_lead_id")
    .in("etapa", chavesEtapas)
    .order("entrou_etapa_em", { ascending: false, nullsFirst: false })
    .order("lead_id", { ascending: true })
    .limit(TETO_CARDS);
  if (error || !data) return { cards: [], corte: false }; // leitura indisponível → board vazio honesto
  const cards = data.map((r: any) => {
    const origemRaw = r.origem ? String(r.origem).toLowerCase() : null;
    // vínculo por uuid (0060) tem precedência sobre o texto legado na hora do chip
    const donoNome = r.dono_nome ? String(r.dono_nome) : null;
    return {
      lead_id: String(r.lead_id),
      nome: r.nome ?? null,
      idade: null, // 0011
      telefone: r.telefone ?? null,
      etapa: String(r.etapa ?? "novo"),
      entrou_etapa_em: r.entrou_etapa_em ?? null,
      valor: r.valor != null ? Number(r.valor) : null,
      origem: origemRaw ? (MAPA_ORIGEM[origemRaw] ?? null) : null,
      responsavel: donoNome
        ? { tipo: (/sara/i.test(donoNome) ? "sara" : /fono/i.test(donoNome) ? "fono" : "dm") as TipoResp, nome: donoNome }
        : donoParaResponsavel(r.dono ?? null),
      dono_id: r.dono_id ?? null,
      dono_nome: donoNome,
      tags: parseTags(r.tags),
      proposta: null,
      kommo_lead_id: r.kommo_lead_id ?? null,
    } as CardLead;
  });
  return { cards, corte: houveCorte(cards.length, TETO_CARDS) };
}

/** Fonte única do board. Etapas reais (senão padrão estrutural); cards só reais — vazio é vazio. */
export async function lerFunil(): Promise<DadosFunil> {
  try {
    const etapas = (await lerEtapasReais()) ?? ETAPAS_PADRAO; // cards filtram pelas chaves da config
    const { cards, corte } = await lerCardsReais(chavesDoBoard(etapas));
    return { etapas, cards, corte };
  } catch {
    return { etapas: ETAPAS_PADRAO, cards: [], corte: false };
  }
}
