import { criarClienteServidor } from "@/lib/supabase/server";
import {
  COLUNAS_CARD,
  COLUNAS_CARD_BASE,
  montarUltimaMensagem,
  MINIMO_BUSCA,
  TETO_BUSCA,
  TETO_CARDS,
  chavesDoBoard,
  etapasDoBoard,
  houveCorte,
  planoBusca,
  recortarBusca,
} from "./funil-calculos";
import { parseTags } from "./ficha-calculos";
import { SLA_PADRAO_DECLARADO, interpretarSlaEtapas, type SlaEtapas } from "./funil-ordenacao";

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
/**
 * R23: `arquivado` é um tipo real da config vigente — não uma etapa do funil. Deixá-lo fora do
 * union era o que fazia o TypeScript concordar com um board que a produção já contradizia.
 */
export type TipoEtapa = "aberto" | "ganho" | "perdido" | "arquivado";

export interface EtapaFunil {
  chave: string; // 'novo', 'qualificando', … (contrato: chave, não id)
  nome: string;
  cor: string; // hex
  tipo: TipoEtapa;
  ordem: number;
  /**
   * R23 · a config marca com `no_board: true` a etapa que EXISTE no funil mas não é coluna de
   * trabalho (hoje: `arquivado`, com 582 dos 679 leads). O campo estava na config e o código não
   * o lia — ver o comentário de `chavesDoBoard`.
   */
  no_board: boolean;
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
  /**
   * R20: o lead tem tarefa PENDENTE? `null` = não foi possível saber (leitura falhou ou bateu no
   * teto). Três estados, não dois — e o null é o que impede o filtro "sem próxima ação" de acusar
   * lead saudável por causa de uma consulta que não voltou.
   */
  tem_tarefa_pendente: boolean | null;
  /**
   * "A primeira coisa que ela quer saber é que dia foi que ele mandou isso" (workshop 12/08).
   *
   * ── R23/W2 · o que estava errado até 22/08 ────────────────────────────────────────────────
   * Este campo existia, o componente sabia desenhá-lo, e `montarCard` NUNCA o preenchia — a
   * `v_lead_card` tinha 17 colunas e nenhuma de mensagem. A consequência não era só a linha
   * faltando: a ordem "Sem resposta há mais tempo" comparava `undefined` com `undefined`, caía
   * no desempate e entregava ORDEM ALFABÉTICA DE UUID. Um menu que promete uma coisa e faz outra.
   * Agora vem das três colunas do contrato (`ultima_mensagem_corpo/_em/_direcao`), e 71 dos 97
   * cards do board têm mensagem no banco (medido em 22/08).
   *
   * Segue OPCIONAL: se a migration da view não tiver descido, a leitura cai no degrau sem as três
   * colunas e o campo volta `undefined` — o card não desenha a linha em vez de inventar uma.
   * `de`: quem falou por último — é o que separa "ele não respondeu" de "eu não respondi".
   */
  ultima_mensagem?: { texto: string; em: string; de: "cliente" | "nos" } | null;
  /**
   * Compromisso marcado com o lead no futuro — o que PAUSA o relógio da prioridade (D55 item 4).
   * Hoje é derivado da tarefa pendente com `prazo` no futuro, que é o único compromisso datado que
   * o schema guarda. Medido em 22/08: `core.tarefa` tem 0 linhas, então nada pausa hoje — a
   * mecânica está pronta e inerte, e é assim que ela deve ficar até haver compromisso de verdade.
   */
  compromisso_em?: string | null;
}

export interface DadosFunil {
  /** Só as etapas de COLUNA (config vigente menos `no_board`) — é o que o board desenha. */
  etapas: EtapaFunil[];
  /**
   * R23 · a config inteira, incluindo as `no_board`. A busca no servidor acha lead em etapa que
   * não é coluna (hoje `arquivado`), e o resultado precisa saber dizer o NOME dessa etapa —
   * mostrar a chave crua ("arquivado") no lugar do nome seria a UI confessando que não sabe.
   */
  todasEtapas: EtapaFunil[];
  cards: CardLead[];
  /** Leitura bateu no TETO_CARDS — a UI avisa que o board mostra os mais recentes, nunca finge completude. */
  corte: boolean;
  /**
   * Prazo por etapa + limiares da cor (D56). Vem de `core.config` chave `sla_etapas`; quando ela
   * não existe, vem o `SLA_PADRAO_DECLARADO` com `daConfig: false` — e a legenda do board DIZ que
   * está no padrão. Padrão silencioso faria o rótulo do card mentir.
   */
  sla: SlaEtapas;
}

// ─────────────── etapas padrão (espelho do funil_vendas v2 real) ───────────────

export const ETAPAS_PADRAO: EtapaFunil[] = [
  { chave: "novo", nome: "Novo lead", cor: "#94a3b8", tipo: "aberto", ordem: 1, no_board: false },
  { chave: "qualificando", nome: "Qualificando", cor: "#38bdf8", tipo: "aberto", ordem: 2, no_board: false },
  { chave: "avaliacao", nome: "Avaliação auditiva", cor: "#a78bfa", tipo: "aberto", ordem: 3, no_board: false },
  { chave: "proposta", nome: "Proposta enviada", cor: "#fbbf24", tipo: "aberto", ordem: 4, no_board: false },
  { chave: "negociacao", nome: "Negociação", cor: "#fb923c", tipo: "aberto", ordem: 5, no_board: false },
  { chave: "ganho", nome: "Ganho", cor: "#34d399", tipo: "ganho", ordem: 90, no_board: false },
  { chave: "perdido", nome: "Perdido", cor: "#f87171", tipo: "perdido", ordem: 91, no_board: false },
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

/** Cliente injetável — mesma razão de spec que em conversas.ts (portões do F24a/F25). */
type Supabase = ReturnType<typeof criarClienteServidor>;

export async function lerEtapasReais(cliente?: Supabase): Promise<EtapaFunil[] | null> {
  const supabase = cliente ?? criarClienteServidor();
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
      // `no_board` explícito OU tipo 'arquivado': as duas marcas dizem a mesma coisa, e ler as
      // duas evita que uma config futura que use só uma delas volte a encher o board.
      no_board: e.no_board === true || e.tipo === "arquivado",
    }))
    .sort((a, b) => a.ordem - b.ordem);
}

/** Teto da leitura de tarefas pendentes. Hoje `core.tarefa` tem 0 linhas — folga larga. */
const TETO_TAREFAS_PENDENTES = 5000;

/**
 * R20 · quais leads têm tarefa PENDENTE. Uma leitura estreita (`lead_id` das pendentes), no molde
 * F24a: teto+1 como detector. Devolve `null` quando não dá para saber — e aí todo card fica com
 * `tem_tarefa_pendente = null`, o que faz o filtro "sem próxima ação" não acusar ninguém.
 *
 * Por que não `count` por lead: a pergunta é binária ("tem próxima ação?"), e contar convidaria a
 * mostrar "3 tarefas" no card — que é justamente o cemitério de 755 itens do Kommo que o comentário
 * da sidebar manda não repetir.
 */
interface TarefasDoBoard {
  /** leads com ao menos uma tarefa pendente */
  pendente: Set<string>;
  /** lead → prazo futuro mais PRÓXIMO (o compromisso que pausa o relógio, D55 item 4) */
  compromisso: Map<string, string>;
}

async function lerLeadsComTarefaPendente(
  supabase: Supabase,
  agora: number,
): Promise<TarefasDoBoard | null> {
  const { data, error } = await supabase
    .schema("core")
    .from("tarefa")
    .select("lead_id,prazo")
    .eq("status", "pendente")
    .not("lead_id", "is", null)
    .limit(TETO_TAREFAS_PENDENTES + 1);
  if (error || !data || data.length > TETO_TAREFAS_PENDENTES) return null;

  const pendente = new Set<string>();
  const compromisso = new Map<string, string>();
  for (const r of data as any[]) {
    const id = String(r.lead_id);
    pendente.add(id);
    // "compromisso marcado" = tarefa aberta com data no FUTURO. É a leitura que o benchmark §3.2
    // já dá como equivalente ("audiometria/consulta agendada com data, ou tarefa aberta com prazo
    // futuro"); prazo VENCIDO não pausa nada — vencido é justamente o oposto de agendado.
    const t = r.prazo ? new Date(String(r.prazo)).getTime() : NaN;
    if (!Number.isNaN(t) && t > agora) {
      const atual = compromisso.get(id);
      // o mais PRÓXIMO manda: é a data em que o relógio volta a correr
      if (!atual || t < new Date(atual).getTime()) compromisso.set(id, String(r.prazo));
    }
  }
  return { pendente, compromisso };
}

/**
 * `core.config` nome='sla_etapas' (D56) — o prazo por etapa e os limiares da cor.
 *
 * Molde do `motivo_perda`/`atribuicao_responsavel`: config é DADO versionado, relido a cada
 * passada, e mudar prazo não exige deploy nem restart (Constituição Art. IV). O degrau é
 * DECLARADO: sem a config, volta o `SLA_PADRAO_DECLARADO` com `daConfig: false`, e o board mostra
 * o aviso. Cair num padrão calado faria o rótulo do card afirmar uma urgência que ninguém definiu.
 */
export async function lerSlaEtapas(cliente?: Supabase): Promise<SlaEtapas> {
  try {
    const supabase = cliente ?? criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("v_config_vigente")
      .select("payload")
      .eq("nome", "sla_etapas")
      .maybeSingle();
    if (error || !data) return SLA_PADRAO_DECLARADO;
    return interpretarSlaEtapas((data as any).payload) ?? SLA_PADRAO_DECLARADO;
  } catch {
    return SLA_PADRAO_DECLARADO;
  }
}

/**
 * ⚠️ EXPORTADA e com `cliente?` desde 22/08 — e o motivo não é simetria com as vizinhas.
 *
 * O DEGRAU desta função (COLUNAS_CARD → COLUNAS_CARD_BASE, logo abaixo) é a única coisa que
 * separa "board sem a linha de última mensagem" de "board VAZIO" no dia em que a migration da
 * `v_lead_card` não tiver descido: pedir coluna inexistente ao PostgREST derruba a consulta
 * INTEIRA, não só a coluna. Até aqui esse degrau era intestável — a função criava o cliente por
 * dentro, e nenhum teste podia forçar o erro da primeira chamada. Degrau silencioso que ninguém
 * exercita é degrau que ninguém sabe se ainda existe.
 *
 * `lerEtapasReais`, `lerSlaEtapas` e `buscarLeads` já aceitavam cliente injetado pela mesma razão
 * (portões do F24a/F25). Esta era a que faltava. Ver tests/funil-degrau-colunas.test.ts.
 */
export async function lerCardsReais(
  chavesEtapas: string[],
  cliente?: Supabase,
): Promise<{ cards: CardLead[]; corte: boolean }> {
  const supabase = cliente ?? criarClienteServidor();
  // Só etapas do board (config vigente) — 'arquivado' etc. NUNCA entram nem roubam vaga do
  // teto. Order determinístico (mais recentes primeiro + lead_id de desempate): se o volume
  // passar do teto, o corte é estável entre reloads e a UI avisa (flag `corte`).
  // As duas leituras são independentes e disparam juntas — a de tarefas nunca atrasa o board, e
  // se ela falhar o board aparece igual (com `tem_tarefa_pendente = null`).
  const consulta = (colunas: string) =>
    supabase
      .schema("core")
      .from("v_lead_card")
      .select(colunas)
      .in("etapa", chavesEtapas)
      .order("entrou_etapa_em", { ascending: false, nullsFirst: false })
      .order("lead_id", { ascending: true })
      .limit(TETO_CARDS);

  const agora = Date.now();
  // COLUNAS_CARD primeiro; sem as três de última mensagem (migration da view ainda não aplicada)
  // volta pro shape sem elas. O degrau é o que separa "board sem a linha de mensagem" de "board
  // VAZIO": pedir coluna inexistente ao PostgREST derruba a consulta inteira.
  let [{ data, error }, comTarefa] = await Promise.all([
    consulta(COLUNAS_CARD),
    lerLeadsComTarefaPendente(supabase, agora),
  ]);
  if (error) ({ data, error } = await consulta(COLUNAS_CARD_BASE));
  if (error || !data) return { cards: [], corte: false }; // leitura indisponível → board vazio honesto
  const cards = (data as any[]).map((r: any) =>
    // `tem_tarefa_pendente` só é conhecido quando a leitura de tarefas voltou; a busca (que não a
    // faz) passa `null` e o filtro "sem próxima ação" corretamente não acusa ninguém por ela.
    montarCard(
      r,
      comTarefa == null ? null : comTarefa.pendente.has(String(r.lead_id)),
      comTarefa?.compromisso.get(String(r.lead_id)) ?? null,
    ),
  );
  return { cards, corte: houveCorte(cards.length, TETO_CARDS) };
}

/**
 * Linha de `core.v_lead_card` → `CardLead`. Fonte ÚNICA da montagem: o board e a busca leem as
 * mesmas colunas e precisam produzir o mesmo card — se a derivação do chip de responsável ou do
 * mapa de origem divergisse entre os dois, o mesmo lead teria duas caras conforme o caminho.
 */
function montarCard(
  r: any,
  temTarefaPendente: boolean | null = null,
  compromissoEm: string | null = null,
): CardLead {
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
    tem_tarefa_pendente: temTarefaPendente,
    ultima_mensagem: montarUltimaMensagem(r),
    compromisso_em: compromissoEm,
  };
}


/** Fonte única do board. Etapas reais (senão padrão estrutural); cards só reais — vazio é vazio. */
export async function lerFunil(cliente?: Supabase): Promise<DadosFunil> {
  try {
    // etapas e SLA são independentes e disparam juntos — o SLA nunca atrasa o board, e se ele
    // falhar o board aparece igual, no padrão declarado e com o aviso na legenda.
    const [etapasLidas, sla] = await Promise.all([lerEtapasReais(cliente), lerSlaEtapas(cliente)]);
    const todasEtapas = etapasLidas ?? ETAPAS_PADRAO; // cards filtram pelas chaves da config
    const { cards, corte } = await lerCardsReais(chavesDoBoard(todasEtapas), cliente);
    return { etapas: etapasDoBoard(todasEtapas), todasEtapas, cards, corte, sla };
  } catch {
    return {
      etapas: ETAPAS_PADRAO,
      todasEtapas: ETAPAS_PADRAO,
      cards: [],
      corte: false,
      sla: SLA_PADRAO_DECLARADO,
    };
  }
}

/*
 * ── R23 · Trilha E — A BUSCA VAI AO BANCO ───────────────────────────────────────────────────
 *
 * O que havia: `filtrarCards` (lib/dados/funil-filtros.ts) roda no navegador, sobre o array que o
 * board já carregou. Ela continua existindo e continua certa — é o filtro do que está na tela.
 * O que ela nunca pôde ser é BUSCA, porque busca é a pergunta "existe em algum lugar?", e o que
 * está na tela não é o universo.
 *
 * Três recortes tiram lead do alcance do filtro do cliente, e os três são reais hoje:
 *   1. etapa `no_board` — 582 dos 679 leads estão em `arquivado`, que deixou de ser coluna;
 *   2. TETO_CARDS (2.000) — o board lê os mais recentes e corta o resto (o Kommo já tem 690 e
 *      cresce; o dia em que passar de 2.000, o corte é silencioso para quem digita um nome);
 *   3. o filtro de etapa/responsável/período que o operador já tenha ligado.
 *
 * Esta função responde a pergunta certa no lugar certo: um `ilike` sobre `core.v_lead_card`
 * INTEIRA, sem filtro de etapa, com teto próprio e ordenação determinística. Custa uma ida ao
 * servidor por busca — medida em 17/08/2026 entre 232 e 251 ms, contra 292 ms que o board gastava
 * carregando os 582 arquivados em TODA visita, achando ou não.
 */

export interface ResultadoBusca {
  termo: string;
  cards: CardLead[];
  /** Havia mais que o teto — a UI diz "refine", nunca deixa o operador achar que viu tudo. */
  truncado: boolean;
  /** A leitura falhou. Diferente de "achou zero" — e a UI precisa dizer coisas diferentes. */
  erro: boolean;
}

const VAZIO: Omit<ResultadoBusca, "termo"> = { cards: [], truncado: false, erro: false };

/**
 * Busca por nome OU telefone em TODO o `core.v_lead_card`, ignorando etapa e teto do board.
 *
 * Telefone: a coluna guarda só dígitos ("5527998316220" — verificado nas 628 linhas com telefone),
 * então uma busca digitada com máscara precisa ser reduzida a dígitos antes de comparar. É a mesma
 * regra de `buscaCasa`, e as duas continuam tendo que concordar — o teste compara as duas.
 */
export async function buscarLeads(termo: string, cliente?: Supabase): Promise<ResultadoBusca> {
  const plano = planoBusca(termo); // puro e testado em funil-calculos.ts
  if (plano == null) return { termo, ...VAZIO };
  const supabase = cliente ?? criarClienteServidor();

  // Repare no que NÃO está aqui: nenhum `.in("etapa", …)`. É a ausência que faz a busca alcançar
  // os 582 leads em `arquivado` — a etapa que deixou de ser coluna do board.
  const consulta = (colunas: string) =>
    supabase
      .schema("core")
      .from("v_lead_card")
      .select(colunas)
      .or(plano.or)
      .order("entrou_etapa_em", { ascending: false, nullsFirst: false })
      .order("lead_id", { ascending: true })
      .limit(plano.limite);

  // mesmo degrau do board: sem as três colunas de última mensagem, a busca acha do mesmo jeito e
  // o resultado sai sem a linha — em vez de a busca inteira responder "erro".
  let { data, error } = await consulta(plano.colunas);
  if (error) ({ data, error } = await consulta(planoBusca(termo, false)!.colunas));

  if (error || !data) return { termo, cards: [], truncado: false, erro: true };
  const { cards, truncado } = recortarBusca(data as any[]);
  // arrow explícita: `.map(montarCard)` passaria o ÍNDICE no lugar de `temTarefaPendente`
  return { termo, cards: cards.map((r) => montarCard(r)), truncado, erro: false };
}
