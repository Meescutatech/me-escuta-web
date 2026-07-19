import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Camada de leitura do FUNIL. Casada com o schema real (Agent 2, migrations 0009+0010) —
 * "Contrato de leitura do board" no CONTRATO-EVENTOS-MVP:
 *  - ETAPAS: core.v_config_vigente (nome='funil_vendas', versão vigente) → payload.etapas
 *            [{chave, nome, ordem, cor, tipo}]  (chave, NÃO id; cor hex; tipo aberto/ganho/perdido)
 *  - CARDS:  core.v_lead_card → {lead_id, nome, telefone, etapa, entrou_etapa_em, valor, origem,
 *            dono, tags, kommo_lead_id}  (dono = um campo; nome/telefone/valor podem ser NULL;
 *            idade/paciente entram na 0011 — não contar com eles ainda)
 *
 * Prefere o real. Se a leitura real falhar OU não houver cards, cai num MOCK rico
 * (fonte='mock' → aviso) pra o board nunca ficar vazio na demo. As etapas do mock usam as
 * MESMAS chaves reais. Visual segue Design/kanban.html (Croqui).
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
  responsavel: { tipo: TipoResp; nome: string } | null; // derivado de `dono`
  proposta: PropostaPendente | null; // não vem da view (só mock por ora)
  kommo_lead_id?: string | null;
}

export interface DadosFunil {
  etapas: EtapaFunil[];
  cards: CardLead[];
  fonte: "real" | "mock";
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

// ─────────────── MOCK rico (fallback; chaves = reais) ───────────────

function diasAtras(d: number): string {
  return new Date(Date.now() - d * 86400_000).toISOString();
}
const R_SARA = { tipo: "sara" as TipoResp, nome: "Sara" };
const R_DM = { tipo: "dm" as TipoResp, nome: "Diogo ME" };
const R_FONO_A = { tipo: "fono" as TipoResp, nome: "Fono Ana" };
const R_FONO_L = { tipo: "fono" as TipoResp, nome: "Fono Léo" };

const CARDS_MOCK: CardLead[] = [
  { lead_id: "m1", nome: "Maria Aparecida Souza", idade: 68, telefone: "(31) 98812-4471", etapa: "novo", entrou_etapa_em: diasAtras(0), valor: null, origem: "wa", responsavel: R_SARA, proposta: null },
  { lead_id: "m2", nome: "João Batista Neves", idade: 72, telefone: "(21) 99145-0087", etapa: "novo", entrou_etapa_em: diasAtras(1), valor: null, origem: "meta", responsavel: R_SARA, proposta: null },
  { lead_id: "m3", nome: "Célia Ramos", idade: 64, telefone: "(31) 98330-7712", etapa: "novo", entrou_etapa_em: diasAtras(0), valor: null, origem: "ig", responsavel: R_SARA, proposta: null },
  { lead_id: "m5", nome: "Terezinha de Jesus", idade: 75, telefone: "(31) 99622-1180", etapa: "qualificando", entrou_etapa_em: diasAtras(1), valor: 8900, origem: "wa", responsavel: { tipo: "sara", nome: "Clara → Sara" }, proposta: { agente: "clara", texto: "avançar p/ <b>avaliação auditiva</b> — lead qualificado" } },
  { lead_id: "m6", nome: "Sebastião Ferreira", idade: 69, telefone: "(31) 98014-5567", etapa: "qualificando", entrou_etapa_em: diasAtras(3), valor: 6400, origem: "ind", responsavel: R_SARA, proposta: null },
  { lead_id: "m8", nome: "Raimundo Nonato", idade: 71, telefone: "(85) 98450-1123", etapa: "qualificando", entrou_etapa_em: diasAtras(5), valor: 7200, origem: "meta", responsavel: R_SARA, proposta: null },
  { lead_id: "m9", nome: "Vera Lúcia Andrade", idade: 63, telefone: "(31) 99771-6690", etapa: "avaliacao", entrou_etapa_em: diasAtras(1), valor: 8900, origem: "wa", responsavel: R_FONO_A, proposta: null },
  { lead_id: "m10", nome: "Geraldo Magela", idade: 74, telefone: "(31) 98220-4418", etapa: "avaliacao", entrou_etapa_em: diasAtras(2), valor: 11400, origem: "ind", responsavel: R_FONO_A, proposta: null },
  { lead_id: "m12", nome: "Osvaldo Pereira", idade: 70, telefone: "(31) 98115-2203", etapa: "proposta", entrou_etapa_em: diasAtras(1), valor: 12800, origem: "wa", responsavel: R_DM, proposta: null },
  { lead_id: "m14", nome: "Djalma Rodrigues", idade: 73, telefone: "(31) 99440-1187", etapa: "proposta", entrou_etapa_em: diasAtras(2), valor: 11400, origem: "wa", responsavel: R_DM, proposta: null },
  { lead_id: "m15", nome: "Conceição Alves", idade: 68, telefone: "(71) 98620-4410", etapa: "proposta", entrou_etapa_em: diasAtras(6), valor: 8900, origem: "ind", responsavel: R_DM, proposta: null },
  { lead_id: "m17", nome: "Aparecida Gomes", idade: 66, telefone: "(31) 99012-7788", etapa: "negociacao", entrou_etapa_em: diasAtras(1), valor: 9800, origem: "wa", responsavel: R_DM, proposta: { agente: "lev", texto: "faixa <b>B</b> — aprovar <b>boleto 12×</b> com entrada" } },
  { lead_id: "m18", nome: "Benedito Farias", idade: 72, telefone: "(27) 98330-5561", etapa: "negociacao", entrou_etapa_em: diasAtras(2), valor: 11400, origem: "meta", responsavel: R_DM, proposta: { agente: "lev", texto: "faixa <b>D</b> — recomenda <b>Pix à vista</b> (risco alto)" } },
  { lead_id: "m19", nome: "Lourdes Bittencourt", idade: 70, telefone: "(31) 99880-2214", etapa: "ganho", entrou_etapa_em: diasAtras(0), valor: 12800, origem: "wa", responsavel: R_DM, proposta: null },
  { lead_id: "m20", nome: "Hélio Vasconcelos", idade: 67, telefone: "(85) 98110-6643", etapa: "ganho", entrou_etapa_em: diasAtras(1), valor: 9800, origem: "ind", responsavel: R_DM, proposta: null },
  { lead_id: "m11", nome: "Marlene Costa", idade: 67, telefone: "(62) 99630-8871", etapa: "avaliacao", entrou_etapa_em: diasAtras(4), valor: 8900, origem: "wa", responsavel: R_FONO_L, proposta: null },
];

// ─────────────── leitura real + fallback ───────────────

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

async function lerEtapasReais(): Promise<EtapaFunil[] | null> {
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

async function lerCardsReais(): Promise<CardLead[] | null> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .schema("core")
    .from("v_lead_card")
    .select("lead_id,nome,telefone,etapa,entrou_etapa_em,valor,origem,dono,tags,kommo_lead_id")
    .limit(500);
  if (error || !data) return null; // view/coluna ausente → fallback
  return data.map((r: any) => {
    const origemRaw = r.origem ? String(r.origem).toLowerCase() : null;
    return {
      lead_id: String(r.lead_id),
      nome: r.nome ?? null,
      idade: null, // 0011
      telefone: r.telefone ?? null,
      etapa: String(r.etapa ?? "novo"),
      entrou_etapa_em: r.entrou_etapa_em ?? null,
      valor: r.valor != null ? Number(r.valor) : null,
      origem: origemRaw ? (MAPA_ORIGEM[origemRaw] ?? null) : null,
      responsavel: donoParaResponsavel(r.dono ?? null),
      proposta: null,
      kommo_lead_id: r.kommo_lead_id ?? null,
    } as CardLead;
  });
}

/**
 * Fonte única do board. Etapas reais (senão padrão). Cards reais quando houver ≥1;
 * senão MOCK rico (fonte='mock' aciona o aviso "dados de exemplo").
 */
export async function lerFunil(): Promise<DadosFunil> {
  try {
    const [etapasReais, cardsReais] = await Promise.all([lerEtapasReais(), lerCardsReais()]);
    const etapas = etapasReais ?? ETAPAS_PADRAO;
    if (cardsReais && cardsReais.length > 0) return { etapas, cards: cardsReais, fonte: "real" };
    return { etapas, cards: CARDS_MOCK, fonte: "mock" };
  } catch {
    return { etapas: ETAPAS_PADRAO, cards: CARDS_MOCK, fonte: "mock" };
  }
}
