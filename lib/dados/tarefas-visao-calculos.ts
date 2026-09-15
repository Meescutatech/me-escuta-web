import type { ResumoJarvis } from "@/lib/tarefas/resumo";

/**
 * Lógica pura da VISÃO DE TAREFAS (`/tarefas`, Rodada 14) — filtros, buckets de prazo e
 * agrupamento estilo funil. Paridade com a tela de tarefas do Kommo, corrigindo o que os
 * números provaram que ele faz mal: lá 755 de 771 abertas estavam vencidas (97,9%) e o
 * vermelho não significava nada. Aqui a fila vermelha é UMA coluna, não a tela inteira.
 *
 * `vencida` chega DERIVADA DO BANCO (`core.v_tarefa`) — este módulo não recalcula o
 * predicado, só o usa. A exceção é o fallback sem a view (lib/dados/tarefas-visao.ts).
 */

export interface TarefaVisao {
  id: string;
  lead_id: string | null;
  /** resolvido em lote via core.v_lead_card; null = lead fora do board ou sem nome. */
  lead_nome: string | null;
  titulo: string;
  descricao: string | null;
  tipo: string | null;
  /** legado texto livre (e-mail) — só tarefas antigas. */
  responsavel: string | null;
  responsavel_id: string | null;
  prazo: string | null;
  status: string; // 'pendente' | 'concluida' | 'arquivada'
  resultado: string | null;
  /** payload.motivo do tarefa_arquivada — sair da fila deixa rastro (spec §10.1). */
  motivo_arquivo: string | null;
  criado_em: string;
  concluida_em: string | null;
  /** derivada em core.v_tarefa (status='pendente' and prazo < now()). */
  vencida: boolean;
  /** F2 / D62 (0298): POR QUE, FAZER, TRECHO e origem da tarefa criada pelo Jarvis; null nas demais. */
  por_que: string | null;
  fazer: string | null;
  trecho: string | null;
  origem: string | null;
  /**
   * W-D5 (10/09) · `alta | media | baixa`. AINDA NÃO EXISTE NO BANCO — é o [M] do benchmark de
   * 10/09 (§4 item 4: coluna + projetor no molde da 0298). A leitura real não preenche e o campo
   * fica `undefined`; a fixture de ensaio preenche. Sem ela a ordem é só prazo, e basta.
   */
  prioridade?: "alta" | "media" | "baixa" | null;
  /**
   * v3 (23:20) · `core.tarefa.conversa_id` (0037 §1, a ancoragem). Quando vem, o clique na linha
   * abre `/conversas?c=<id>`; sem ele cai em `?lead=`.
   *
   * ⚠️ 14/09 · a leitura real PASSOU a selecioná-lo (`lib/dados/tarefas-visao.ts`). Enquanto não
   * selecionava, o modo foco — que descarta tarefa sem âncora — ficava vazio em produção com as
   * tarefas certas no banco. Opcional no tipo, obrigatório na consulta: ver `COLS_*` lá.
   */
  conversa_id?: string | null;
  /**
   * v3 · o que aconteceu com a tarefa, em ordem (criada por · adiada · reatribuída · iniciada …).
   * É o ledger dela lido de trás para a frente; a leitura real ainda não monta — a fixture e as
   * escritas do ensaio montam. Ausente = a tela mostra só "criada em".
   */
  historico?: EventoTarefa[];
  /**
   * W-T (10/09, noite) · o RESUMO DO JARVIS — situação do lead, o que ele viu no fio, o que fazer
   * e por quê (lib/tarefas/resumo.ts). Gravado pelo worker (`tarefa_resumida`), nunca recalculado
   * ao abrir. A leitura real ainda não o traz (fica `undefined` → a tela deriva a situação da
   * view do lead quando tem, ou mostra só o porquê); a fixture de ensaio preenche.
   */
  resumo?: ResumoJarvis | null;
}

export interface EventoTarefa {
  quando: string;
  tipo: "criada" | "adiada" | "reatribuida" | "iniciada" | "reaberta" | "concluida" | "arquivada";
  texto: string;
}

export type StatusFiltro = "abertas" | "concluidas" | "arquivadas";
export type PrazoFiltro = "todos" | "hoje" | "amanha" | "semana" | "sem_prazo";
/** `lead` (W-D5): colunas por paciente — "tudo que devo a esta pessoa" numa coluna só. */
export type Agrupamento = "prazo" | "responsavel" | "tipo" | "lead";
/**
 * `hoje` (W-D5) é a VIEW DO DIA: vencidas ∪ hoje, minhas, numeradas, com foco que anda
 * (lib/tarefas/dia.ts). Vive em `exibicao` porque é uma FORMA de ver, como funil e lista —
 * mas impõe `minhas` e ignora `prazo`/`vencidas` (a view é o recorte).
 */
export type Exibicao = "funil" | "lista" | "hoje";

export interface FiltrosTarefas {
  exibicao: Exibicao;
  agrupamento: Agrupamento;
  minhas: boolean;
  responsavelId: string | null;
  status: StatusFiltro;
  vencidas: boolean;
  prazo: PrazoFiltro;
  tipo: string | null;
  /**
   * Busca por texto sobre título, descrição e nome do lead (22/08). Vazio = sem busca.
   * Existia filtro para SEIS recortes e nenhum campo de texto: a Sarah que lembra o nome do
   * paciente não tinha como chegar na tarefa dele. Com teto de 500 abertas e as 697 atrasadas
   * do Kommo por vir, rolar a coluna deixa de ser caminho.
   */
  busca: string;
  /**
   * W-T v2 (11/09, 00:15 — "eu melhoraria MUITO os filtros") · QUEM CRIOU.
   * `jarvis` = `origem = 'jarvis_conversa'` (D62: o Jarvis cria direto, e a pergunta "o que ele
   * criou hoje?" é de quem confere o agente); `pessoa` = todo o resto. Não é sinônimo de
   * "proposta pendente" — proposta ainda não é tarefa e vive noutro bloco da tela.
   */
  origem: OrigemFiltro;
  /** um paciente, pelo nome exato como ele aparece na lista (o lead não tem id em toda leitura) */
  leadNome: string | null;
  /** prazo numa FAIXA escolhida no calendário (YYYY-MM-DD em SP). Vence o `prazo` de preset. */
  de: string | null;
  ate: string | null;
}

export type OrigemFiltro = "todas" | "jarvis" | "pessoa";

export const FILTROS_PADRAO: FiltrosTarefas = {
  exibicao: "funil",
  agrupamento: "prazo",
  minhas: false,
  responsavelId: null,
  status: "abertas",
  vencidas: false,
  prazo: "todos",
  tipo: null,
  busca: "",
  origem: "todas",
  leadNome: null,
  de: null,
  ate: null,
};

// ─────────────── URL ⇄ filtros (visão compartilhável por link) ───────────────

export function parseFiltros(params: Record<string, string | string[] | undefined>): FiltrosTarefas {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const exibicao = um(params.ver);
  const agrupamento = um(params.agrupar);
  const status = um(params.status);
  const prazo = um(params.prazo);
  return {
    exibicao: exibicao === "lista" ? "lista" : exibicao === "hoje" ? "hoje" : "funil",
    agrupamento:
      agrupamento === "responsavel" || agrupamento === "tipo" || agrupamento === "lead" ? agrupamento : "prazo",
    minhas: um(params.minhas) === "1",
    responsavelId: um(params.resp),
    status: status === "concluidas" || status === "arquivadas" ? status : "abertas",
    vencidas: um(params.vencidas) === "1",
    prazo: prazo === "hoje" || prazo === "amanha" || prazo === "semana" || prazo === "sem_prazo" ? prazo : "todos",
    tipo: um(params.tipo),
    busca: (um(params.q) ?? "").trim(),
    origem: um(params.origem) === "jarvis" ? "jarvis" : um(params.origem) === "pessoa" ? "pessoa" : "todas",
    leadNome: um(params.lead),
    de: ehYmd(um(params.de)) ? um(params.de) : null,
    ate: ehYmd(um(params.ate)) ? um(params.ate) : null,
  };
}

function ehYmd(v: string | null): boolean {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Só o que difere do padrão entra na URL — link limpo é link legível. */
export function serializarFiltros(f: FiltrosTarefas): string {
  const p = new URLSearchParams();
  if (f.exibicao !== FILTROS_PADRAO.exibicao) p.set("ver", f.exibicao);
  if (f.agrupamento !== FILTROS_PADRAO.agrupamento) p.set("agrupar", f.agrupamento);
  if (f.minhas) p.set("minhas", "1");
  if (f.responsavelId) p.set("resp", f.responsavelId);
  if (f.status !== FILTROS_PADRAO.status) p.set("status", f.status);
  if (f.vencidas) p.set("vencidas", "1");
  if (f.prazo !== FILTROS_PADRAO.prazo) p.set("prazo", f.prazo);
  if (f.tipo) p.set("tipo", f.tipo);
  if (f.busca.trim()) p.set("q", f.busca.trim());
  if (f.origem !== FILTROS_PADRAO.origem) p.set("origem", f.origem);
  if (f.leadNome) p.set("lead", f.leadNome);
  if (f.de) p.set("de", f.de);
  if (f.ate) p.set("ate", f.ate);
  return p.toString();
}

export function temFiltroAtivo(f: FiltrosTarefas): boolean {
  return (
    f.minhas ||
    f.responsavelId != null ||
    f.status !== FILTROS_PADRAO.status ||
    f.vencidas ||
    f.prazo !== FILTROS_PADRAO.prazo ||
    f.tipo != null ||
    f.busca.trim() !== "" ||
    f.origem !== FILTROS_PADRAO.origem ||
    f.leadNome != null ||
    f.de != null ||
    f.ate != null
  );
}

// ─────────────── busca por texto ───────────────

/**
 * Caixa e ACENTO fora: "audiometria" tem que achar "Audiometria", e "jose" tem que achar "José".
 * Metade dos nomes de paciente carrega acento; exigir o acento certo transformaria a busca em
 * adivinhação de digitação.
 */
export function normalizarBusca(s: string): string {
  // \u0300-\u036f = marcas combinantes que o NFD separa da letra
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Todos os termos precisam casar (E, não OU), cada um em QUALQUER dos três campos. "sara audio"
 * acha a tarefa de audiometria do lead Sara sem exigir que as duas palavras estejam juntas.
 */
export function casaBusca(t: TarefaVisao, busca: string): boolean {
  const termos = normalizarBusca(busca).split(/\s+/).filter(Boolean);
  if (termos.length === 0) return true;
  const alvo = normalizarBusca([t.titulo, t.descricao ?? "", t.lead_nome ?? ""].join("  "));
  return termos.every((termo) => alvo.includes(termo));
}

// ─────────────── dias em São Paulo (prazo é compromisso local, não UTC) ───────────────

const FMT_DIA_SP = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function diaSP(ms: number): string {
  return FMT_DIA_SP.format(new Date(ms)); // "2026-07-25"
}

/** Dias de calendário (SP) entre agora e o prazo; 0 = hoje, 1 = amanhã, negativo = passou. */
export function diffDiasSP(prazoIso: string, agoraMs: number): number | null {
  const prazoMs = new Date(prazoIso).getTime();
  if (!Number.isFinite(prazoMs)) return null;
  const [pa, pm, pd] = diaSP(prazoMs).split("-").map(Number);
  const [aa, am, ad] = diaSP(agoraMs).split("-").map(Number);
  return Math.round((Date.UTC(pa, pm - 1, pd) - Date.UTC(aa, am - 1, ad)) / 86_400_000);
}

/** Dias até o domingo desta semana em SP (domingo → 0). Fecha o bucket "esta semana". */
export function diasAteDomingoSP(agoraMs: number): number {
  const dow = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Sao_Paulo" })
    .format(new Date(agoraMs));
  const ordem: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return (7 - (ordem[dow] ?? 0)) % 7;
}

// ─────────────── buckets de prazo (o eixo do funil é o tempo) ───────────────

export type BucketPrazo = "vencidas" | "hoje" | "amanha" | "semana" | "depois" | "sem_prazo";

export const ROTULO_BUCKET: Record<BucketPrazo, string> = {
  vencidas: "Vencidas",
  hoje: "Hoje",
  amanha: "Amanhã",
  semana: "Esta semana",
  depois: "Depois",
  sem_prazo: "Sem prazo",
};

const ORDEM_BUCKETS: BucketPrazo[] = ["vencidas", "hoje", "amanha", "semana", "depois", "sem_prazo"];

export function bucketPrazo(t: TarefaVisao, agoraMs: number): BucketPrazo {
  if (t.vencida) return "vencidas";
  if (!t.prazo) return "sem_prazo";
  const d = diffDiasSP(t.prazo, agoraMs);
  if (d == null) return "sem_prazo";
  if (d <= 0) return "hoje"; // prazo é hoje e ainda não passou da hora
  if (d === 1) return "amanha";
  if (d <= diasAteDomingoSP(agoraMs)) return "semana";
  return "depois";
}

// ─────────────── filtros ───────────────

export function aplicarFiltros(
  tarefas: TarefaVisao[],
  f: FiltrosTarefas,
  meuId: string | null,
  agoraMs: number,
): TarefaVisao[] {
  const statusAlvo = f.status === "abertas" ? "pendente" : f.status === "concluidas" ? "concluida" : "arquivada";
  return tarefas.filter((t) => {
    if (t.status !== statusAlvo) return false;
    if (f.minhas && (!meuId || t.responsavel_id !== meuId)) return false;
    if (f.responsavelId && t.responsavel_id !== f.responsavelId) return false;
    if (f.vencidas && !t.vencida) return false;
    if (f.tipo && t.tipo !== f.tipo) return false;
    if (f.busca.trim() && !casaBusca(t, f.busca)) return false;
    if (f.origem !== "todas") {
      const doJarvis = t.origem === "jarvis_conversa";
      if (f.origem === "jarvis" ? !doJarvis : doJarvis) return false;
    }
    if (f.leadNome && (t.lead_nome ?? "") !== f.leadNome) return false;
    // a FAIXA do calendário vence o preset: quem abriu o calendário escolheu dias, não "amanhã"
    if (f.de || f.ate) {
      if (!t.prazo) return false;
      const dia = diaSP(new Date(t.prazo).getTime());
      if (f.de && dia < f.de) return false;
      if (f.ate && dia > f.ate) return false;
    } else if (f.prazo !== "todos") {
      if (f.prazo === "sem_prazo") return !t.prazo;
      if (!t.prazo) return false;
      const d = diffDiasSP(t.prazo, agoraMs);
      if (d == null) return false;
      // recortes CUMULATIVOS: "hoje" inclui o que já venceu; "amanhã" inclui hoje; etc.
      if (f.prazo === "hoje" && d > 0) return false;
      if (f.prazo === "amanha" && d > 1) return false;
      if (f.prazo === "semana" && d > diasAteDomingoSP(agoraMs)) return false;
    }
    return true;
  });
}

// ─────────────── ordenação e agrupamento ───────────────

const SEM_PRAZO_MS = Number.MAX_SAFE_INTEGER;

function prazoMs(t: TarefaVisao): number {
  const ms = t.prazo ? new Date(t.prazo).getTime() : NaN;
  return Number.isFinite(ms) ? ms : SEM_PRAZO_MS;
}

/** alta → 0, média/ausente → 1, baixa → 2 (espelho de lib/tarefas/dia.ts, sem importar de lá). */
function pesoPrio(t: TarefaVisao): number {
  return t.prioridade === "alta" ? 0 : t.prioridade === "baixa" ? 2 : 1;
}

/**
 * Lista plana: abertas por prazo (mais atrasada primeiro, sem prazo por último), prioridade
 * desempatando prazos iguais (W-D5); concluídas/arquivadas pelo desfecho mais recente primeiro.
 */
export function ordenarLista(tarefas: TarefaVisao[], status: StatusFiltro): TarefaVisao[] {
  const copia = [...tarefas];
  if (status === "abertas") {
    copia.sort(
      (a, b) => prazoMs(a) - prazoMs(b) || pesoPrio(a) - pesoPrio(b) || a.criado_em.localeCompare(b.criado_em),
    );
  } else {
    const quando = (t: TarefaVisao) => t.concluida_em ?? t.criado_em;
    copia.sort((a, b) => quando(b).localeCompare(quando(a)));
  }
  return copia;
}

export interface GrupoTarefas {
  chave: string;
  rotulo: string;
  tarefas: TarefaVisao[];
  /** true só no grupo Vencidas — a única cor semântica da tela. */
  vermelho: boolean;
}

/**
 * Agrupamento estilo funil. Por PRAZO as colunas são fixas (o vazio também informa);
 * por responsável/tipo só grupos com tarefa, maiores primeiro, "sem …" no fim.
 */
export function agrupar(
  tarefas: TarefaVisao[],
  f: FiltrosTarefas,
  agoraMs: number,
  nomes: { membros: Map<string, string>; tipos: Map<string, string> },
): GrupoTarefas[] {
  const ordenadas = ordenarLista(tarefas, f.status);

  if (f.agrupamento === "prazo") {
    const porBucket = new Map<BucketPrazo, TarefaVisao[]>(ORDEM_BUCKETS.map((b) => [b, []]));
    for (const t of ordenadas) porBucket.get(bucketPrazo(t, agoraMs))!.push(t);
    return ORDEM_BUCKETS.map((b) => ({
      chave: b,
      rotulo: ROTULO_BUCKET[b],
      tarefas: porBucket.get(b)!,
      vermelho: b === "vencidas",
    }));
  }

  const chaveDe =
    f.agrupamento === "responsavel"
      ? (t: TarefaVisao) => t.responsavel_id ?? ""
      : f.agrupamento === "lead"
        ? (t: TarefaVisao) => t.lead_id ?? ""
        : (t: TarefaVisao) => t.tipo ?? "";
  const nomeLead = new Map<string, string>();
  if (f.agrupamento === "lead") for (const t of ordenadas) if (t.lead_id && t.lead_nome) nomeLead.set(t.lead_id, t.lead_nome);
  const rotuloDe = (chave: string) => {
    if (!chave) {
      return f.agrupamento === "responsavel" ? "Sem responsável" : f.agrupamento === "lead" ? "Sem lead (internas)" : "Sem tipo";
    }
    if (f.agrupamento === "responsavel") return nomes.membros.get(chave) ?? "Outro membro";
    if (f.agrupamento === "lead") return nomeLead.get(chave) ?? "Lead sem nome";
    return nomes.tipos.get(chave) ?? chave;
  };

  const porChave = new Map<string, TarefaVisao[]>();
  for (const t of ordenadas) {
    const c = chaveDe(t);
    if (!porChave.has(c)) porChave.set(c, []);
    porChave.get(c)!.push(t);
  }
  return [...porChave.entries()]
    .sort(([ca, a], [cb, b]) => (ca === "") !== (cb === "") ? (ca === "" ? 1 : -1) : b.length - a.length)
    .map(([chave, ts]) => ({ chave: chave || "sem", rotulo: rotuloDe(chave), tarefas: ts, vermelho: false }));
}

// ─────────────── contadores honestos da barra ───────────────

export interface ContadoresTarefas {
  abertas: number;
  vencidas: number;
  concluidas: number;
  arquivadas: number;
}

export function contadores(tarefas: TarefaVisao[]): ContadoresTarefas {
  const c: ContadoresTarefas = { abertas: 0, vencidas: 0, concluidas: 0, arquivadas: 0 };
  for (const t of tarefas) {
    if (t.status === "pendente") {
      c.abertas++;
      if (t.vencida) c.vencidas++;
    } else if (t.status === "concluida") c.concluidas++;
    else if (t.status === "arquivada") c.arquivadas++;
  }
  return c;
}
