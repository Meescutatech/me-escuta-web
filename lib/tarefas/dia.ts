import {
  bucketPrazo,
  diffDiasSP,
  diasAteDomingoSP,
  ROTULO_BUCKET,
  type BucketPrazo,
  type FiltrosTarefas,
  type TarefaVisao,
} from "@/lib/dados/tarefas-visao-calculos";

/**
 * O DIA DA SDR (W-D5, 10/09) — a lógica pura da view "Hoje" e das abas de /tarefas.
 *
 * Benchmark de 10/09 §4 itens 7 e 8: o Close junta "hoje + atrasadas" numa caixa só porque a
 * pergunta de quem abre a tela às 8h é *"o que eu faço agora?"*, e não "o que venceu" × "o que
 * é de hoje" em dois filtros. O HubSpot vai um passo além com "Start [x] tasks": percorre a fila
 * uma a uma. Aqui as duas ideias viram uma view: a fila do dia, numerada, com um foco que anda.
 *
 * PRIORIDADE (benchmark item 4): três níveis, `alta / media / baixa`. No banco ela ainda não
 * existe — é o [M] do benchmark — então `TarefaVisao.prioridade` é opcional e a leitura real
 * devolve `undefined`. Sem prioridade a ordem é só prazo, que é o que o Attio faz e basta.
 */

export type Prioridade = "alta" | "media" | "baixa";

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  alta: "alta",
  media: "média",
  baixa: "baixa",
};

/** alta primeiro. Sem prioridade conta como média — o meio, nunca o fim da fila. */
export function pesoPrioridade(p: Prioridade | null | undefined): number {
  if (p === "alta") return 0;
  if (p === "baixa") return 2;
  return 1;
}

export function ehPrioridade(v: unknown): v is Prioridade {
  return v === "alta" || v === "media" || v === "baixa";
}

// ─────────────── a fila do dia ───────────────

/**
 * Vencidas ∪ hoje — pendentes com prazo até o fim de HOJE (São Paulo). Sem prazo fica de fora:
 * não vence, não é "de hoje", e entrar aqui só encheria a fila do que não tem compromisso.
 */
export function ehDoDia(t: TarefaVisao, agoraMs: number): boolean {
  if (t.status !== "pendente") return false;
  if (t.vencida) return true;
  if (!t.prazo) return false;
  const d = diffDiasSP(t.prazo, agoraMs);
  return d != null && d <= 0;
}

function prazoMs(t: TarefaVisao): number {
  const ms = t.prazo ? new Date(t.prazo).getTime() : NaN;
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

/**
 * Ordem da fila: o que já VENCEU primeiro, depois o que vence hoje; dentro de cada bloco a
 * prioridade manda e o prazo desempata. "Vencida" pesa mais que a hora porque o atraso é dívida
 * com o paciente, e a hora de hoje é só agenda.
 */
export function ordenarDia(tarefas: TarefaVisao[]): TarefaVisao[] {
  return [...tarefas].sort(
    (a, b) =>
      Number(b.vencida) - Number(a.vencida) ||
      pesoPrioridade(a.prioridade) - pesoPrioridade(b.prioridade) ||
      prazoMs(a) - prazoMs(b) ||
      a.criado_em.localeCompare(b.criado_em),
  );
}

export function filaDoDia(tarefas: TarefaVisao[], agoraMs: number): TarefaVisao[] {
  return ordenarDia(tarefas.filter((t) => ehDoDia(t, agoraMs)));
}

export interface ResumoDia {
  total: number;
  vencidas: number;
  hoje: number;
}

export function resumoDoDia(fila: TarefaVisao[]): ResumoDia {
  const vencidas = fila.filter((t) => t.vencida).length;
  return { total: fila.length, vencidas, hoje: fila.length - vencidas };
}

/**
 * O próximo id da fila depois de `atual` — ou o primeiro, quando `atual` não está mais nela
 * (foi concluída, adiada, saiu do dia). `null` quando a fila acabou.
 */
export function proximaNaFila(ids: readonly string[], atual: string | null): string | null {
  if (ids.length === 0) return null;
  if (!atual) return ids[0];
  const i = ids.indexOf(atual);
  if (i < 0) return ids[0];
  return ids[i + 1] ?? null;
}

/** "quarta, 10 de setembro" — o dia em São Paulo, como se diz. */
export function rotuloDoDia(agoraMs: number): string {
  const s = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(agoraMs));
  // "quarta-feira, 10 de setembro" → "Quarta, 10 de setembro": a tela é curta, o dia da semana também
  const curto = s.replace("-feira", "");
  return curto.charAt(0).toUpperCase() + curto.slice(1);
}

// ─────────────── abas: Hoje · Semana · Todas · Do time ───────────────

export type Aba = "hoje" | "semana" | "todas" | "time";

export const ORDEM_ABAS: Aba[] = ["hoje", "semana", "todas", "time"];

export const ROTULO_ABA: Record<Aba, string> = {
  hoje: "Hoje",
  semana: "Semana",
  todas: "Todas",
  time: "Do time",
};

/**
 * A aba ativa é DERIVADA dos filtros, não guardada à parte: assim a URL continua tendo uma fonte
 * só (`serializarFiltros`) e um link `?minhas=1&prazo=semana` acende "Semana" sozinho. Quando a
 * combinação de filtros não é nenhuma das quatro, nenhuma aba acende — é o estado honesto de
 * "recorte próprio", e o botão "Limpar filtros" continua sendo o caminho de volta.
 */
export function abaAtiva(f: FiltrosTarefas): Aba | null {
  if (f.exibicao === "hoje") return "hoje";
  // status (abertas/concluídas) NÃO tira a aba: "Todas · Concluídas" continua sendo Todas
  if (f.vencidas || f.responsavelId) return null;
  if (f.minhas && f.prazo === "semana") return "semana";
  if (f.minhas && f.prazo === "todos") return "todas";
  if (!f.minhas && f.prazo === "todos") return "time";
  return null;
}

/** Os filtros que a aba impõe. `exibicao` só muda ao ENTRAR ou SAIR de Hoje. */
export function filtrosDaAba(aba: Aba, atual: FiltrosTarefas): FiltrosTarefas {
  const base: FiltrosTarefas = {
    ...atual,
    status: "abertas",
    vencidas: false,
    responsavelId: null,
    exibicao: atual.exibicao === "hoje" ? "funil" : atual.exibicao,
  };
  switch (aba) {
    case "hoje":
      return { ...base, exibicao: "hoje", minhas: true, prazo: "todos" };
    case "semana":
      return { ...base, minhas: true, prazo: "semana" };
    case "todas":
      return { ...base, minhas: true, prazo: "todos" };
    case "time":
      return { ...base, minhas: false, prazo: "todos" };
  }
}

/** Contagens das abas — só pendentes; "minhas" exige `meuId`. */
export function contagemAbas(
  tarefas: TarefaVisao[],
  meuId: string | null,
  agoraMs: number,
): Record<Aba, number> {
  const abertas = tarefas.filter((t) => t.status === "pendente");
  const minhas = meuId ? abertas.filter((t) => t.responsavel_id === meuId) : [];
  const ateDomingo = diasAteDomingoSP(agoraMs);
  const semana = minhas.filter((t) => {
    if (t.vencida) return true;
    if (!t.prazo) return false;
    const d = diffDiasSP(t.prazo, agoraMs);
    return d != null && d <= ateDomingo;
  });
  return {
    hoje: minhas.filter((t) => ehDoDia(t, agoraMs)).length,
    semana: semana.length,
    todas: minhas.length,
    time: abertas.length,
  };
}

// ─────────────── a lista agrupada por dia (v2, 10/09 22:40 — depois da reprovação) ───────────────

export interface GrupoDia {
  chave: BucketPrazo | "concluidas" | "arquivadas";
  rotulo: string;
  tarefas: TarefaVisao[];
  /** só Vencidas — o único grupo com cor, e só no texto do cabeçalho */
  vermelho: boolean;
}

const ORDEM_DIA: BucketPrazo[] = ["vencidas", "hoje", "amanha", "semana", "depois", "sem_prazo"];

/**
 * Uma lista só, cortada por dia: Vencidas · Hoje · Amanhã · Esta semana · Depois · Sem prazo.
 * Grupo vazio não aparece (o vazio informa numa coluna; numa lista só ocupa). Dentro de
 * Vencidas e Hoje a PRIORIDADE manda e o prazo desempata — é a fila de "agora"; nos demais o
 * prazo manda, senão uma "baixa" de amanhã ficaria depois de uma "alta" do mês que vem.
 */
export function agruparPorDia(pendentes: TarefaVisao[], agoraMs: number): GrupoDia[] {
  const porBucket = new Map<BucketPrazo, TarefaVisao[]>(ORDEM_DIA.map((b) => [b, []]));
  for (const t of pendentes) porBucket.get(bucketPrazo(t, agoraMs))!.push(t);
  const grupos: GrupoDia[] = [];
  for (const b of ORDEM_DIA) {
    const ts = porBucket.get(b)!;
    if (ts.length === 0) continue;
    const ordenadas =
      b === "vencidas" || b === "hoje"
        ? ordenarDia(ts)
        : [...ts].sort((x, y) => prazoMs(x) - prazoMs(y) || pesoPrioridade(x.prioridade) - pesoPrioridade(y.prioridade) || x.criado_em.localeCompare(y.criado_em));
    grupos.push({ chave: b, rotulo: ROTULO_BUCKET[b], tarefas: ordenadas, vermelho: b === "vencidas" });
  }
  return grupos;
}

const FMT_HORA_SP = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const FMT_DIA_CURTO_SP = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/**
 * O prazo como se fala: "venceu ontem · 16:23", "vence hoje · 22:53", "vence amanhã · 09:00",
 * "vence sex 12/09 · 09:00", "sem prazo". Sem data crua para o que é perto — a Sara não
 * converte "10/09" em "hoje" de cabeça o dia inteiro.
 */
export function textoPrazoHumano(t: Pick<TarefaVisao, "prazo" | "vencida" | "status" | "concluida_em">, agoraMs: number): string {
  if (t.status === "concluida") return t.concluida_em ? `concluída ${quandoHumano(t.concluida_em, agoraMs)}` : "concluída";
  if (!t.prazo) return "sem prazo";
  return `${t.vencida ? "venceu" : "vence"} ${quandoHumano(t.prazo, agoraMs)}`;
}

export function quandoHumano(iso: string, agoraMs: number): string {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const d = diffDiasSP(iso, agoraMs);
  const hora = FMT_HORA_SP.format(new Date(ms));
  if (d === 0) return `hoje · ${hora}`;
  if (d === -1) return `ontem · ${hora}`;
  if (d === 1) return `amanhã · ${hora}`;
  return `${FMT_DIA_CURTO_SP.format(new Date(ms)).replace(".", "")} · ${hora}`;
}
