import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Camada de leitura do FUNIL. Etapas e visual seguem a spec de pixel aprovada
 * (Product_Management/Design/kanban.html — Croqui, 16/07).
 *
 * Contrato de leitura esperado (Trilha B / migrations 0009+):
 *  - core.config  linha  nome='funil_vendas'  (versionada) → payload.etapas: EtapaFunil[]
 *  - core.v_estado_lead  (view) → CardLead[]  (um por lead, com etapa + timer + PII achatada)
 *
 * Enquanto a 0009 não sobe, ambos caem num MOCK alinhado ao contrato (fonte='mock'), pra o board
 * já renderizar e ser demonstrável. O mapeamento real vem primeiro — trocar é só o Agent 2 subir
 * config+view. TODO(spec): remover MOCK quando 0009 estiver aplicada.
 */

export type Origem = "wa" | "ig" | "meta" | "ind";
export type TipoResp = "dm" | "sara" | "fono";
export type AgenteProp = "clara" | "lev";

export interface EtapaFunil {
  id: string;
  nome: string;
  cor: string; // hex do dot/stripe (spec Croqui)
  ordem: number;
}

export interface PropostaPendente {
  agente: AgenteProp; // clara | levindo — quem propôs
  texto: string; // resumo curto (pode conter <b>)
}

export interface CardLead {
  lead_id: string;
  nome: string;
  idade: number | null;
  telefone: string | null;
  etapa: string;
  entrou_etapa_em: string | null; // timestamptz — base do timer tempo-na-etapa
  valor: number | null;
  origem: Origem | null;
  responsavel: { tipo: TipoResp; nome: string } | null;
  proposta: PropostaPendente | null;
}

export interface DadosFunil {
  etapas: EtapaFunil[];
  cards: CardLead[];
  fonte: "real" | "mock";
}

// ─────────────────────────────── etapas (spec Croqui) ───────────────────────────────

export const ETAPAS_PADRAO: EtapaFunil[] = [
  { id: "novo", nome: "Novo lead", cor: "#a3a0a8", ordem: 1 },
  { id: "qualif", nome: "Qualificação", cor: "#EC662E", ordem: 2 },
  { id: "agend", nome: "Teleconsulta agendada", cor: "#143691", ordem: 3 },
  { id: "consulta", nome: "Consulta realizada", cor: "#7A4CA0", ordem: 4 },
  { id: "proposta", nome: "Proposta enviada", cor: "#B8860B", ordem: 5 },
  { id: "credito", nome: "Análise de crédito", cor: "#2E8B62", ordem: 6 },
  { id: "fechado", nome: "Venda fechada", cor: "#2E8B62", ordem: 7 },
];

// ─────────────────────────────── MOCK (contrato-alinhado, spec Croqui) ───────────────────────────────

function diasAtras(d: number): string {
  return new Date(Date.now() - d * 86400_000).toISOString();
}

const CARDS_MOCK: CardLead[] = [
  // novo
  { lead_id: "m1", nome: "Maria Aparecida Souza", idade: 68, telefone: "(31) 98812-4471", etapa: "novo", entrou_etapa_em: diasAtras(0), valor: null, origem: "wa", responsavel: { tipo: "sara", nome: "Sara" }, proposta: null },
  { lead_id: "m2", nome: "João Batista Neves", idade: 72, telefone: "(21) 99145-0087", etapa: "novo", entrou_etapa_em: diasAtras(1), valor: null, origem: "meta", responsavel: { tipo: "sara", nome: "Sara" }, proposta: null },
  { lead_id: "m3", nome: "Célia Ramos", idade: 64, telefone: "(31) 98330-7712", etapa: "novo", entrou_etapa_em: diasAtras(0), valor: null, origem: "ig", responsavel: { tipo: "sara", nome: "Sara" }, proposta: null },
  { lead_id: "m4", nome: "Antônio Carlos Lima", idade: 70, telefone: "(11) 97701-3390", etapa: "novo", entrou_etapa_em: diasAtras(2), valor: null, origem: "wa", responsavel: { tipo: "sara", nome: "Sara" }, proposta: null },
  // qualif (Clara propõe)
  { lead_id: "m5", nome: "Terezinha de Jesus", idade: 75, telefone: "(31) 99622-1180", etapa: "qualif", entrou_etapa_em: diasAtras(1), valor: 8900, origem: "wa", responsavel: { tipo: "sara", nome: "Clara → Sara" }, proposta: { agente: "clara", texto: "avançar p/ <b>agendar teleconsulta</b> — lead qualificado" } },
  { lead_id: "m6", nome: "Sebastião Ferreira", idade: 69, telefone: "(31) 98014-5567", etapa: "qualif", entrou_etapa_em: diasAtras(3), valor: 6400, origem: "ind", responsavel: { tipo: "sara", nome: "Sara" }, proposta: null },
  { lead_id: "m7", nome: "Neusa Martins", idade: 66, telefone: "(48) 99187-2245", etapa: "qualif", entrou_etapa_em: diasAtras(5), valor: 9800, origem: "wa", responsavel: { tipo: "sara", nome: "Sara" }, proposta: null },
  { lead_id: "m8", nome: "Raimundo Nonato", idade: 71, telefone: "(85) 98450-1123", etapa: "qualif", entrou_etapa_em: diasAtras(1), valor: 7200, origem: "meta", responsavel: { tipo: "sara", nome: "Sara" }, proposta: null },
  // agend
  { lead_id: "m9", nome: "Vera Lúcia Andrade", idade: 63, telefone: "(31) 99771-6690", etapa: "agend", entrou_etapa_em: diasAtras(1), valor: 8900, origem: "wa", responsavel: { tipo: "fono", nome: "Fono Ana" }, proposta: null },
  { lead_id: "m10", nome: "Geraldo Magela", idade: 74, telefone: "(31) 98220-4418", etapa: "agend", entrou_etapa_em: diasAtras(2), valor: 11400, origem: "ind", responsavel: { tipo: "fono", nome: "Fono Ana" }, proposta: null },
  { lead_id: "m11", nome: "Marlene Costa", idade: 67, telefone: "(62) 99630-8871", etapa: "agend", entrou_etapa_em: diasAtras(4), valor: 8900, origem: "wa", responsavel: { tipo: "fono", nome: "Fono Léo" }, proposta: null },
  // consulta
  { lead_id: "m12", nome: "Osvaldo Pereira", idade: 70, telefone: "(31) 98115-2203", etapa: "consulta", entrou_etapa_em: diasAtras(1), valor: 12800, origem: "wa", responsavel: { tipo: "fono", nome: "Fono Ana" }, proposta: null },
  { lead_id: "m13", nome: "Iracema Nunes", idade: 65, telefone: "(11) 97330-9902", etapa: "consulta", entrou_etapa_em: diasAtras(2), valor: 9800, origem: "meta", responsavel: { tipo: "fono", nome: "Fono Léo" }, proposta: null },
  // proposta
  { lead_id: "m14", nome: "Djalma Rodrigues", idade: 73, telefone: "(31) 99440-1187", etapa: "proposta", entrou_etapa_em: diasAtras(2), valor: 11400, origem: "wa", responsavel: { tipo: "dm", nome: "Diogo ME" }, proposta: null },
  { lead_id: "m15", nome: "Conceição Alves", idade: 68, telefone: "(71) 98620-4410", etapa: "proposta", entrou_etapa_em: diasAtras(6), valor: 8900, origem: "ind", responsavel: { tipo: "dm", nome: "Diogo ME" }, proposta: null },
  { lead_id: "m16", nome: "Waldir Santos", idade: 69, telefone: "(31) 98770-3325", etapa: "proposta", entrou_etapa_em: diasAtras(3), valor: 13600, origem: "wa", responsavel: { tipo: "dm", nome: "Diogo ME" }, proposta: null },
  // credito (Levindo propõe)
  { lead_id: "m17", nome: "Aparecida Gomes", idade: 66, telefone: "(31) 99012-7788", etapa: "credito", entrou_etapa_em: diasAtras(1), valor: 9800, origem: "wa", responsavel: { tipo: "dm", nome: "Diogo ME" }, proposta: { agente: "lev", texto: "faixa <b>B</b> — aprovar <b>boleto 12×</b> com entrada" } },
  { lead_id: "m18", nome: "Benedito Farias", idade: 72, telefone: "(27) 98330-5561", etapa: "credito", entrou_etapa_em: diasAtras(2), valor: 11400, origem: "meta", responsavel: { tipo: "dm", nome: "Diogo ME" }, proposta: { agente: "lev", texto: "faixa <b>D</b> — recomenda <b>Pix à vista</b> (risco alto)" } },
  // fechado
  { lead_id: "m19", nome: "Lourdes Bittencourt", idade: 70, telefone: "(31) 99880-2214", etapa: "fechado", entrou_etapa_em: diasAtras(0), valor: 12800, origem: "wa", responsavel: { tipo: "dm", nome: "Diogo ME" }, proposta: null },
  { lead_id: "m20", nome: "Hélio Vasconcelos", idade: 67, telefone: "(85) 98110-6643", etapa: "fechado", entrou_etapa_em: diasAtras(1), valor: 9800, origem: "ind", responsavel: { tipo: "dm", nome: "Diogo ME" }, proposta: null },
];

const DADOS_MOCK: DadosFunil = { etapas: ETAPAS_PADRAO, cards: CARDS_MOCK, fonte: "mock" };

// ─────────────────────────────── leitura real + fallback ───────────────────────────────

const MAPA_ORIGEM: Record<string, Origem> = {
  whatsapp: "wa",
  wa: "wa",
  instagram: "ig",
  ig: "ig",
  meta: "meta",
  facebook: "meta",
  indicacao: "ind",
  ind: "ind",
};

async function lerEtapasReais(): Promise<EtapaFunil[] | null> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .schema("core")
    .from("config")
    .select("payload")
    .eq("nome", "funil_vendas")
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const etapas = (data.payload as any)?.etapas;
  if (!Array.isArray(etapas) || etapas.length === 0) return null;
  return etapas
    .map((e: any, i: number) => ({
      id: String(e.id ?? e.slug ?? i),
      nome: String(e.nome ?? e.titulo ?? e.id),
      cor: String(e.cor ?? ETAPAS_PADRAO[i]?.cor ?? "#a3a0a8"),
      ordem: Number(e.ordem ?? i + 1),
    }))
    .sort((a, b) => a.ordem - b.ordem);
}

async function lerCardsReais(): Promise<CardLead[] | null> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase.schema("core").from("v_estado_lead").select("*").limit(500);
  if (error || !data) return null; // view ainda não existe (0009 pendente) → fallback
  return data.map((r: any) => {
    const canal = r.canal ?? r.origem ?? null;
    return {
      lead_id: String(r.lead_id ?? r.id),
      nome: String(r.nome ?? r.nome_lead ?? r.contato ?? "Lead sem nome"),
      idade: r.idade ?? null,
      telefone: r.telefone ?? r.fone ?? null,
      etapa: String(r.etapa ?? "novo"),
      entrou_etapa_em: r.entrou_etapa_em ?? r.atualizado_em ?? null,
      valor: r.valor ?? null,
      origem: canal ? (MAPA_ORIGEM[String(canal).toLowerCase()] ?? null) : null,
      responsavel: r.responsavel_nome
        ? { tipo: (r.responsavel_tipo ?? "dm") as TipoResp, nome: String(r.responsavel_nome) }
        : null,
      proposta: null, // proposta pendente vem da fila (não da view) — enriquecer depois
    };
  });
}

/**
 * Fonte única do board. Tenta real; se etapas OU cards não vierem, usa o MOCK inteiro
 * (não misturar real+mock). fonte='mock' aciona o aviso na UI.
 */
export async function lerFunil(): Promise<DadosFunil> {
  try {
    const [etapas, cards] = await Promise.all([lerEtapasReais(), lerCardsReais()]);
    if (etapas && cards) return { etapas, cards, fonte: "real" };
  } catch {
    // qualquer falha de leitura → mock
  }
  return DADOS_MOCK;
}
