/**
 * Logica PURA do dashboard do CEO (R27 · F6) — sem I/O, client-safe, testavel com node --test.
 *
 * As views `api.v_dashboard_*` (0300/0301) devolvem GRANULARIDADE DE DIA nos ultimos 190 dias.
 * Tudo que e "periodo de 7/30/90 dias, comparado ao anterior" e conta feita AQUI, sobre essas
 * linhas. Mediana de 1a resposta e calculada sobre `v_dashboard_primeira_resposta` (uma linha por
 * conversa) — mediana nao se agrega de dias.
 *
 * Conversas por ator tambem NAO se somam de dias: `v_dashboard_ator_dia.conversas_atendidas` e
 * distinta POR DIA (a mesma conversa tocada em 3 dias conta 3). "Conversas atendidas por ator no
 * periodo" sai de `v_dashboard_conversa_ator` (0302, uma linha por conversa x ator): conta-se a
 * conversa cujo `primeiro_dia` do ator cai na janela — distinta por construcao, como o KPI do topo.
 *
 * Fuso: os `dia` das views ja vem em America/Sao_Paulo como 'YYYY-MM-DD'; comparacao de janela e
 * comparacao de string, sem Date no meio.
 */

import { ymdEmSaoPaulo } from "./dashboard-calculos.ts";
import {
  FAIXAS_ESCALA,
  TETO_AGORA,
  prioridadeCard,
  type FaixaPrioridade,
  type SlaEtapas,
} from "./funil-ordenacao.ts";
import type { CardLead } from "./funil";

export type PeriodoDias = 7 | 30 | 90;
export const PERIODOS: PeriodoDias[] = [7, 30, 90];
export const PERIODO_PADRAO: PeriodoDias = 30;

export function interpretarPeriodo(v: unknown): PeriodoDias {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (PERIODOS as number[]).includes(n) ? (n as PeriodoDias) : PERIODO_PADRAO;
}

/** Chave de ator como as views usam: `agente:<id>` | `humano:<uuid>` | `sistema`. */
export function interpretarAtor(v: unknown): string | null {
  const s = String(Array.isArray(v) ? v[0] : (v ?? "")).trim();
  return /^(agente|humano):[A-Za-z0-9_.:-]+$/.test(s) ? s : null;
}

// ─────────────── janela ───────────────

export interface Janela {
  /** [inicio, fim] inclusivos, 'YYYY-MM-DD' */
  inicio: string;
  fim: string;
  inicioAnterior: string;
  fimAnterior: string;
  /** 7 | 30 | 90 nos presets; qualquer inteiro >= 1 numa janela livre (`?de=&ate=`) */
  dias: number;
}

function somarDias(ymd: string, n: number): string {
  const [a, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(a, m - 1, d) + n * 86400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Janela atual = os ultimos `dias` dias incluindo hoje; anterior = os `dias` dias antes dela. */
export function janelaDoPeriodo(dias: PeriodoDias, agora: Date): Janela {
  const hoje = ymdEmSaoPaulo(agora);
  const inicio = somarDias(hoje, -(dias - 1));
  return {
    dias,
    inicio,
    fim: hoje,
    inicioAnterior: somarDias(inicio, -dias),
    fimAnterior: somarDias(inicio, -1),
  };
}

/**
 * Janela LIVRE (`?de=YYYY-MM-DD&ate=YYYY-MM-DD`, inclusivos). Anterior = o mesmo numero de dias
 * imediatamente antes. Devolve null se as datas nao formam um intervalo (a UI cai no preset).
 */
export function janelaCustom(de: unknown, ate: unknown, agora: Date, maxDias = 190): Janela | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const a = String(Array.isArray(de) ? de[0] : (de ?? "")).trim();
  const b = String(Array.isArray(ate) ? ate[0] : (ate ?? "")).trim();
  if (!re.test(a) || !re.test(b) || a > b) return null;
  const hoje = ymdEmSaoPaulo(agora);
  const fim = b > hoje ? hoje : b;
  if (a > fim) return null;
  const dias = Math.round((Date.UTC(+fim.slice(0, 4), +fim.slice(5, 7) - 1, +fim.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400_000) + 1;
  if (dias < 1 || dias > maxDias) return null;
  return { dias, inicio: a, fim, inicioAnterior: somarDias(a, -dias), fimAnterior: somarDias(a, -1) };
}

export function noAtual(dia: string, j: Janela): boolean {
  return dia >= j.inicio && dia <= j.fim;
}
export function noAnterior(dia: string, j: Janela): boolean {
  return dia >= j.inicioAnterior && dia <= j.fimAnterior;
}

/** Lista dos dias da janela atual, do mais antigo ao mais novo. */
export function diasDaJanela(j: Janela): string[] {
  const out: string[] = [];
  for (let d = j.inicio; d <= j.fim; d = somarDias(d, 1)) out.push(d);
  return out;
}

// ─────────────── comparado ───────────────

/** Um numero do periodo e o mesmo numero do periodo anterior. `null` = leitura indisponivel. */
export interface Comparado {
  atual: number | null;
  anterior: number | null;
}

export const COMPARADO_VAZIO: Comparado = { atual: 0, anterior: 0 };

/** Variacao relativa (fracao) do atual sobre o anterior. null quando nao da para comparar. */
export function variacao(c: Comparado): number | null {
  if (c.atual == null || c.anterior == null) return null;
  if (c.anterior === 0) return c.atual === 0 ? 0 : null; // de zero para algo nao e "%": a UI escreve o numero
  return (c.atual - c.anterior) / c.anterior;
}

/** "+12%" / "−8%" / "—". `invertido` = menor e melhor (tempo de resposta). */
export function textoVariacao(c: Comparado): string {
  const v = variacao(c);
  if (v == null) {
    if (c.atual != null && c.anterior === 0 && c.atual > 0) return `+${c.atual}`;
    return "—";
  }
  const pct = Math.round(v * 100);
  if (pct === 0) return "=";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

export type Tendencia = "melhor" | "pior" | "igual" | "sem";
export function tendencia(c: Comparado, menorEhMelhor = false): Tendencia {
  const v = variacao(c);
  if (v == null) {
    if (c.atual != null && c.anterior === 0 && c.atual > 0) return menorEhMelhor ? "pior" : "melhor";
    return "sem";
  }
  if (Math.round(v * 100) === 0) return "igual";
  const subiu = v > 0;
  return subiu !== menorEhMelhor ? "melhor" : "pior";
}

// ─────────────── linhas das views ───────────────

export interface LinhaAtorDia {
  dia: string;
  ator: string;
  mensagens_enviadas: number;
  conversas_atendidas: number;
  transbordos_recebidos: number;
  devolucoes: number;
  tarefas_criadas: number;
  tarefas_concluidas: number;
  leads_movidos: number;
}

/** 0302 · uma linha por (conversa, ator): primeiro/ultimo dia em que o ator mandou saida efetivada. */
export interface LinhaConversaAtor {
  conversa_id: string;
  ator: string;
  ator_tipo: "agente" | "humano" | "sistema" | string;
  ator_id: string | null;
  primeiro_dia: string;
  ultimo_dia: string;
  mensagens: number;
}

export interface LinhaPrimeiraResposta {
  conversa_id: string;
  dia: string;
  respondida_por: string | null;
  minutos: number | null;
}

export interface LinhaDia {
  dia: string;
  leads_novos: number;
  mensagens_recebidas: number;
  mensagens_enviadas: number;
  conversas_com_entrada: number;
  conversas_novas: number;
}

export interface LinhaEtapaDia {
  dia: string;
  etapa: string;
  ator: string;
  entradas: number;
  leads_distintos: number;
}

export interface LinhaFunil {
  etapa: string;
  nome: string;
  tipo: "aberto" | "ganho" | "perdido" | "arquivado" | string;
  ordem: number;
  fora_do_board: boolean;
  leads: number;
  leads_com_valor: number;
  valor: number;
}

export interface Ator {
  ator: string;
  tipo: "agente" | "humano";
  nome: string;
  ativo: boolean;
}

export function tipoDoAtor(ator: string): "agente" | "humano" | "sistema" {
  if (ator.startsWith("agente:")) return "agente";
  if (ator.startsWith("humano:")) return "humano";
  return "sistema";
}

// ─────────────── por ator ───────────────

const METRICAS_ATOR = [
  "mensagens_enviadas",
  "transbordos_recebidos",
  "devolucoes",
  "tarefas_criadas",
  "tarefas_concluidas",
  "leads_movidos",
] as const;
type MetricaAtor = (typeof METRICAS_ATOR)[number];

export interface ResumoAtor {
  ator: string;
  nome: string;
  tipo: "agente" | "humano" | "sistema";
  ativo: boolean;
  mensagens: Comparado;
  /** conversas DISTINTAS em que o ator deu sua primeira resposta na janela (v_dashboard_conversa_ator) */
  conversas: Comparado;
  transbordos: Comparado;
  devolucoes: Comparado;
  tarefasCriadas: Comparado;
  tarefasConcluidas: Comparado;
  leadsMovidos: Comparado;
  /** mediana de minutos da 1a resposta, das conversas que este ator respondeu primeiro */
  primeiraResposta: { medianaMin: number | null; amostra: number; anteriorMin: number | null };
  /** o ator fez alguma coisa em qualquer das duas janelas */
  temAtividade: boolean;
}

function somar(linhas: LinhaAtorDia[], m: MetricaAtor, pred: (dia: string) => boolean): number {
  let s = 0;
  for (const l of linhas) if (pred(l.dia)) s += Number(l[m]) || 0;
  return s;
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/** Conversas distintas do ator cujo primeiro dia de resposta cai no predicado. */
function contarConversas(linhas: LinhaConversaAtor[], pred: (dia: string) => boolean): number {
  const vistas = new Set<string>();
  for (const l of linhas) if (pred(l.primeiro_dia)) vistas.add(l.conversa_id);
  return vistas.size;
}

/**
 * Uma linha por ator do catalogo (+ atores que aparecem no ledger e nao estao no catalogo, para
 * historico nao sumir). Ordem: agentes primeiro, depois humanos, cada grupo por conversas desc.
 * `conversas` vem de `conversaAtor` (0302), nunca da soma de `conversas_atendidas` por dia.
 */
export function resumirPorAtor(
  catalogo: Ator[],
  atorDia: LinhaAtorDia[],
  primeira: LinhaPrimeiraResposta[],
  j: Janela,
  conversaAtor: LinhaConversaAtor[] = [],
): ResumoAtor[] {
  const chaves = new Set<string>(catalogo.map((a) => a.ator));
  for (const l of atorDia) if (l.ator !== "sistema") chaves.add(l.ator);
  for (const l of conversaAtor) if (l.ator !== "sistema") chaves.add(l.ator);
  const nomes = new Map(catalogo.map((a) => [a.ator, a] as const));

  const out: ResumoAtor[] = [];
  for (const ator of chaves) {
    const linhas = atorDia.filter((l) => l.ator === ator);
    const conversas = conversaAtor.filter((l) => l.ator === ator);
    const comp = (m: MetricaAtor): Comparado => ({
      atual: somar(linhas, m, (d) => noAtual(d, j)),
      anterior: somar(linhas, m, (d) => noAnterior(d, j)),
    });
    const respAtual = primeira.filter((p) => p.respondida_por === ator && p.minutos != null && noAtual(p.dia, j));
    const respAnt = primeira.filter((p) => p.respondida_por === ator && p.minutos != null && noAnterior(p.dia, j));
    const cat = nomes.get(ator);
    const r: ResumoAtor = {
      ator,
      nome: cat?.nome ?? ator.replace(/^(agente|humano):/, ""),
      tipo: tipoDoAtor(ator),
      ativo: cat?.ativo ?? false,
      mensagens: comp("mensagens_enviadas"),
      conversas: {
        atual: contarConversas(conversas, (d) => noAtual(d, j)),
        anterior: contarConversas(conversas, (d) => noAnterior(d, j)),
      },
      transbordos: comp("transbordos_recebidos"),
      devolucoes: comp("devolucoes"),
      tarefasCriadas: comp("tarefas_criadas"),
      tarefasConcluidas: comp("tarefas_concluidas"),
      leadsMovidos: comp("leads_movidos"),
      primeiraResposta: {
        medianaMin: mediana(respAtual.map((p) => Number(p.minutos))),
        amostra: respAtual.length,
        anteriorMin: mediana(respAnt.map((p) => Number(p.minutos))),
      },
      temAtividade: linhas.length > 0 || conversas.length > 0 || respAtual.length > 0 || respAnt.length > 0,
    };
    out.push(r);
  }
  const peso = (t: ResumoAtor["tipo"]) => (t === "agente" ? 0 : t === "humano" ? 1 : 2);
  return out.sort(
    (a, b) =>
      peso(a.tipo) - peso(b.tipo) ||
      (b.conversas.atual ?? 0) - (a.conversas.atual ?? 0) ||
      (b.mensagens.atual ?? 0) - (a.mensagens.atual ?? 0) ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

// ─────────────── agente × humano ───────────────

/** Limiar de "respondida a tempo", em minutos — o mesmo SLA de 1a resposta da aba Canais. */
export const MINUTOS_SLA_RESPOSTA = 5;

export interface Atendimento {
  /** conversas com pelo menos uma resposta no periodo, por tipo de quem respondeu (1a resposta) */
  conversasAgente: Comparado;
  conversasHumano: Comparado;
  semResposta: Comparado;
  /** conversas cuja 1a resposta veio em ate MINUTOS_SLA_RESPOSTA (W-D4) */
  dentroDeSla: Comparado;
  /** fracao das conversas respondidas cuja 1a resposta foi de agente. null sem amostra */
  fracaoAgente: number | null;
  transbordos: Comparado;
  primeiraResposta: {
    geralMin: Comparado;
    agenteMin: number | null;
    humanoMin: number | null;
    amostra: number;
  };
}

export function resumirAtendimento(primeira: LinhaPrimeiraResposta[], atorDia: LinhaAtorDia[], j: Janela): Atendimento {
  const conta = (pred: (d: string) => boolean) => {
    let agente = 0, humano = 0, sem = 0, noSla = 0;
    const tempos: number[] = [];
    const tAg: number[] = [];
    const tHu: number[] = [];
    for (const p of primeira) {
      if (!pred(p.dia)) continue;
      if (p.minutos == null || !p.respondida_por) { sem++; continue; }
      const t = tipoDoAtor(p.respondida_por);
      const m = Number(p.minutos);
      tempos.push(m);
      if (m <= MINUTOS_SLA_RESPOSTA) noSla++;
      if (t === "agente") { agente++; tAg.push(m); }
      else if (t === "humano") { humano++; tHu.push(m); }
    }
    return { agente, humano, sem, noSla, med: mediana(tempos), medAg: mediana(tAg), medHu: mediana(tHu), n: tempos.length };
  };
  const a = conta((d) => noAtual(d, j));
  const b = conta((d) => noAnterior(d, j));
  const respondidas = a.agente + a.humano;
  return {
    conversasAgente: { atual: a.agente, anterior: b.agente },
    conversasHumano: { atual: a.humano, anterior: b.humano },
    semResposta: { atual: a.sem, anterior: b.sem },
    dentroDeSla: { atual: a.noSla, anterior: b.noSla },
    fracaoAgente: respondidas === 0 ? null : a.agente / respondidas,
    transbordos: {
      atual: somar(atorDia, "transbordos_recebidos", (d) => noAtual(d, j)),
      anterior: somar(atorDia, "transbordos_recebidos", (d) => noAnterior(d, j)),
    },
    primeiraResposta: { geralMin: { atual: a.med, anterior: b.med }, agenteMin: a.medAg, humanoMin: a.medHu, amostra: a.n },
  };
}

// ─────────────── serie diaria ───────────────

export interface PontoDia {
  dia: string;
  /** "27/08" */
  rotulo: string;
  leadsNovos: number;
  /** mensagens recebidas no dia */
  recebidas: number;
  /** conversas com pelo menos uma entrada no dia (W-D4) */
  conversas: number;
  enviadasAgente: number;
  enviadasHumano: number;
}

export function rotuloCurto(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

/** Serie da janela atual com zero nos dias sem linha (a view nao emite dia vazio). */
export function serieDiaria(dias: LinhaDia[], atorDia: LinhaAtorDia[], j: Janela, atorFiltro: string | null): PontoDia[] {
  const porDia = new Map(dias.map((d) => [d.dia, d] as const));
  return diasDaJanela(j).map((dia) => {
    const d = porDia.get(dia);
    let ag = 0, hu = 0;
    for (const l of atorDia) {
      if (l.dia !== dia) continue;
      if (atorFiltro && l.ator !== atorFiltro) continue;
      const t = tipoDoAtor(l.ator);
      if (t === "agente") ag += l.mensagens_enviadas;
      else if (t === "humano") hu += l.mensagens_enviadas;
    }
    return {
      dia,
      rotulo: rotuloCurto(dia),
      leadsNovos: d?.leads_novos ?? 0,
      recebidas: d?.mensagens_recebidas ?? 0,
      conversas: d?.conversas_com_entrada ?? 0,
      enviadasAgente: ag,
      enviadasHumano: hu,
    };
  });
}

export function somarDiasNegocio(dias: LinhaDia[], j: Janela) {
  const soma = (campo: keyof Omit<LinhaDia, "dia">, pred: (d: string) => boolean) =>
    dias.reduce((s, d) => (pred(d.dia) ? s + (Number(d[campo]) || 0) : s), 0);
  const comp = (campo: keyof Omit<LinhaDia, "dia">): Comparado => ({
    atual: soma(campo, (d) => noAtual(d, j)),
    anterior: soma(campo, (d) => noAnterior(d, j)),
  });
  return {
    leadsNovos: comp("leads_novos"),
    mensagensRecebidas: comp("mensagens_recebidas"),
    mensagensEnviadas: comp("mensagens_enviadas"),
    conversasComEntrada: comp("conversas_com_entrada"),
  };
}

// ─────────────── funil ───────────────

export interface EtapaResumo {
  etapa: string;
  nome: string;
  tipo: string;
  ordem: number;
  estoque: number;
  valor: number;
  leadsComValor: number;
  entradas: Comparado;
  /** entradas nesta etapa ÷ entradas na 1a etapa aberta, no periodo. null sem base. */
  pctAteAqui: number | null;
  /** entradas nesta etapa ÷ entradas na etapa aberta anterior. null na primeira ou sem base. */
  pctDaAnterior: number | null;
}

export function resumirFunil(
  funil: LinhaFunil[],
  etapaDia: LinhaEtapaDia[],
  j: Janela,
  atorFiltro: string | null,
): EtapaResumo[] {
  const ordenado = [...funil].sort((a, b) => a.ordem - b.ordem || a.etapa.localeCompare(b.etapa));
  const entradas = (etapa: string, pred: (d: string) => boolean) =>
    etapaDia.reduce(
      (s, l) => (l.etapa === etapa && pred(l.dia) && (!atorFiltro || l.ator === atorFiltro) ? s + l.entradas : s),
      0,
    );
  const linhas = ordenado.map((f) => ({
    etapa: f.etapa,
    nome: f.nome,
    tipo: f.tipo,
    ordem: f.ordem,
    estoque: Number(f.leads) || 0,
    valor: Number(f.valor) || 0,
    leadsComValor: Number(f.leads_com_valor) || 0,
    entradas: { atual: entradas(f.etapa, (d) => noAtual(d, j)), anterior: entradas(f.etapa, (d) => noAnterior(d, j)) },
  }));
  const abertas = linhas.filter((l) => l.tipo === "aberto");
  const base = abertas[0]?.entradas.atual ?? 0;
  let anterior: number | null = null;
  return linhas.map((l) => {
    const ehAberta = l.tipo === "aberto";
    const pctAteAqui = base > 0 ? (l.entradas.atual ?? 0) / base : null;
    const pctDaAnterior = ehAberta && anterior != null && anterior > 0 ? (l.entradas.atual ?? 0) / anterior : null;
    if (ehAberta) anterior = l.entradas.atual ?? 0;
    return { ...l, pctAteAqui, pctDaAnterior };
  });
}

export function valorEmNegociacao(funil: LinhaFunil[]) {
  const abertas = funil.filter((f) => f.tipo === "aberto");
  return {
    total: abertas.reduce((s, f) => s + (Number(f.valor) || 0), 0),
    leadsComValor: abertas.reduce((s, f) => s + (Number(f.leads_com_valor) || 0), 0),
    leads: abertas.reduce((s, f) => s + (Number(f.leads) || 0), 0),
  };
}

// ─────────────── % em AGORA (teto 15%) ───────────────

export interface ResumoAgora {
  porFaixa: Record<FaixaPrioridade, number>;
  total: number;
  /** fracao dos cards do board em AGORA (sem_dado fica fora do denominador) */
  pctAgora: number | null;
  excedeuTeto: boolean;
  teto: number;
}

/**
 * TODO(F5): trocar por `resumoFaixas` de `lib/dados/funil-ordenacao.ts` quando a branch da F5
 * chegar ao tronco — hoje a conta e feita aqui com a MESMA `prioridadeCard` (D55), para nao haver
 * duas regras de cor.
 */
export function resumirAgora(
  cards: Array<Pick<CardLead, "etapa" | "entrou_etapa_em" | "ultima_mensagem" | "compromisso_em">>,
  sla: SlaEtapas,
  agora: number,
): ResumoAgora {
  const porFaixa: Record<FaixaPrioridade, number> = { agora: 0, hoje: 0, na_semana: 0, sem_pressa: 0, sem_prazo: 0, sem_dado: 0 };
  for (const c of cards) porFaixa[prioridadeCard(c, sla, agora).faixa]++;
  const comDado = FAIXAS_ESCALA.reduce((s, f) => s + porFaixa[f], 0);
  const pctAgora = comDado === 0 ? null : porFaixa.agora / comDado;
  return { porFaixa, total: cards.length, pctAgora, excedeuTeto: pctAgora != null && pctAgora > TETO_AGORA, teto: TETO_AGORA };
}

// ─────────────── formatacao ───────────────

export function fmtInt(v: number | null | undefined): string {
  return v == null ? "—" : Math.round(v).toLocaleString("pt-BR");
}

export function fmtPct(fracao: number | null | undefined, casas = 0): string {
  return fracao == null ? "—" : `${(fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;
}

export function fmtMoeda(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** "4 min" · "1h20" · "2d" — minutos como pessoa le. */
export function fmtMinutos(min: number | null | undefined): string {
  if (min == null) return "—";
  if (min < 1) return "< 1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h < 24) return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr === 0 ? `${d}d` : `${d}d ${hr}h`;
}
