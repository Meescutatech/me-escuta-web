import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";

/*
 * A TERCEIRA VISÃO: O CALENDÁRIO (W-T v4, 11/09).
 *
 * Lista responde "o que eu faço agora"; quadro responde "onde cada coisa está"; calendário responde
 * a pergunta que as duas não respondem: **"a semana que vem cabe?"**. É a única forma que mostra o
 * VAZIO — a terça sem nada e a quinta com nove — e é o vazio que permite replanejar antes de a fila
 * estourar. Por isso arrastar aqui não é enfeite: mudar o dia É o trabalho desta tela.
 *
 * Tudo em SÃO PAULO, sem exceção. Prazo é compromisso local: uma tarefa às 21h de quinta em SP é
 * 00h de sexta em UTC, e um calendário que a desenha na sexta está mentindo para quem trabalha. SP
 * não tem horário de verão desde 2019 — UTC-3 fixo — e é por isso que a conta abaixo pode ser
 * aritmética simples em vez de uma biblioteca de fuso.
 */

const FMT_DIA_SP = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Sao_Paulo" });
const FMT_HORA_SP = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" });
const FMT_MES = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const FMT_MES_CURTO = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

const UTC_DE_SP = 3; // SP = UTC-3, fixo desde 2019

export interface DiaCalendario {
  /** "2026-09-11" */
  ymd: string;
  dia: number;
  /** pertence ao mês em foco (no modo mês as bordas trazem dias vizinhos) */
  doMes: boolean;
  hoje: boolean;
  passado: boolean;
  fimDeSemana: boolean;
}

export function ymdSP(ms: number): string {
  return FMT_DIA_SP.format(new Date(ms));
}

export function horaSPde(iso: string): { hora: number; minuto: number } {
  const [h, m] = FMT_HORA_SP.format(new Date(iso)).split(":").map(Number);
  return { hora: Number.isFinite(h) ? h : 9, minuto: Number.isFinite(m) ? m : 0 };
}

function partes(ymd: string): [number, number, number] {
  const [a, m, d] = ymd.split("-").map(Number);
  return [a, m, d];
}

function deDias(ymd: string, delta: number): string {
  const [a, m, d] = partes(ymd);
  const x = new Date(Date.UTC(a, m - 1, d + delta));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

/** Dia da semana com SEGUNDA = 0 — a semana de trabalho começa na segunda, não no domingo. */
export function diaDaSemana(ymd: string): number {
  const [a, m, d] = partes(ymd);
  return (new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7;
}

function montar(ymd: string, hojeYmd: string, mesFoco: number): DiaCalendario {
  const [, m, d] = partes(ymd);
  const dow = diaDaSemana(ymd);
  return {
    ymd,
    dia: d,
    doMes: m === mesFoco,
    hoje: ymd === hojeYmd,
    passado: ymd < hojeYmd,
    fimDeSemana: dow >= 5,
  };
}

/** A grade do mês: sempre 6 linhas de 7 — altura estável quando se troca de mês (zero pulo). */
export function gradeDoMes(ancora: string, agoraMs: number): DiaCalendario[] {
  const [a, m] = partes(ancora);
  const primeiro = `${a}-${String(m).padStart(2, "0")}-01`;
  const inicio = deDias(primeiro, -diaDaSemana(primeiro));
  const hoje = ymdSP(agoraMs);
  return Array.from({ length: 42 }, (_, i) => montar(deDias(inicio, i), hoje, m));
}

export function gradeDaSemana(ancora: string, agoraMs: number): DiaCalendario[] {
  const inicio = deDias(ancora, -diaDaSemana(ancora));
  const hoje = ymdSP(agoraMs);
  const [, m] = partes(ancora);
  return Array.from({ length: 7 }, (_, i) => montar(deDias(inicio, i), hoje, m));
}

export function deslocarMes(ancora: string, delta: number): string {
  const [a, m] = partes(ancora);
  const x = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function deslocarSemana(ancora: string, delta: number): string {
  return deDias(ancora, delta * 7);
}

export function rotuloMes(ancora: string): string {
  const [a, m] = partes(ancora);
  const s = FMT_MES.format(new Date(Date.UTC(a, m - 1, 1)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "7 – 13 de setembro" · cruzando mês: "28 de setembro – 4 de outubro" */
export function rotuloSemana(dias: DiaCalendario[]): string {
  if (dias.length === 0) return "";
  const [pa, pm, pd] = partes(dias[0].ymd);
  const [ua, um, ud] = partes(dias[dias.length - 1].ymd);
  const mesP = FMT_MES_CURTO.format(new Date(Date.UTC(pa, pm - 1, 1)));
  const mesU = FMT_MES_CURTO.format(new Date(Date.UTC(ua, um - 1, 1)));
  if (pm === um && pa === ua) return `${pd} – ${ud} de ${mesU}`;
  return `${pd} de ${mesP} – ${ud} de ${mesU}`;
}

export const NOMES_DOS_DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/** Tarefas por dia (SP). Sem prazo não entra — ela não tem lugar num calendário, tem uma gaveta. */
export function porDia(tarefas: TarefaVisao[]): Map<string, TarefaVisao[]> {
  const mapa = new Map<string, TarefaVisao[]>();
  for (const t of tarefas) {
    if (!t.prazo) continue;
    const ms = new Date(t.prazo).getTime();
    if (!Number.isFinite(ms)) continue;
    const ymd = ymdSP(ms);
    const lista = mapa.get(ymd);
    if (lista) lista.push(t);
    else mapa.set(ymd, [t]);
  }
  for (const lista of mapa.values()) {
    lista.sort((a, b) => (a.prazo ?? "").localeCompare(b.prazo ?? ""));
  }
  return mapa;
}

export function semPrazo(tarefas: TarefaVisao[]): TarefaVisao[] {
  return tarefas.filter((t) => !t.prazo);
}

/**
 * O novo prazo ao soltar num dia: MANTÉM a hora que a tarefa já tinha. Arrastar de quinta 14h para
 * sexta é "a mesma coisa, um dia depois" — reescrever para 09:00 apagaria a hora que alguém
 * combinou com o paciente. Sem prazo anterior (veio da gaveta), cai às 09:00, o começo do dia.
 */
export function prazoNoDia(ymd: string, prazoAtual: string | null): string {
  const [a, m, d] = partes(ymd);
  const { hora, minuto } = prazoAtual ? horaSPde(prazoAtual) : { hora: 9, minuto: 0 };
  return new Date(Date.UTC(a, m - 1, d, hora + UTC_DE_SP, minuto, 0)).toISOString();
}

/** "movida para 12/09" — o motivo obrigatório do `tarefa_prazo_repactuado` (0037), sem digitação. */
export function motivoDoReplanejamento(ymd: string): string {
  const [, m, d] = partes(ymd);
  return `replanejada no calendário para ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
