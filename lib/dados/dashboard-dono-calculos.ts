/**
 * Lógica PURA do dashboard do DONO (W-D4, 10/09/2026) — a camada que fica POR CIMA de
 * `dashboard-ceo-calculos.ts`. Sem I/O, client-safe, testável com `node --test`.
 *
 * A tela responde a UMA pergunta às 8h da manhã: "o que precisa da minha atenção hoje e como
 * estamos indo?". O que já existia (KPIs, agente × humano, série, funil, por ator) continua saindo
 * das views `api.v_dashboard_*`; o que é novo aqui — a lista de atenção, o Jarvis diz, os canais,
 * o heatmap, a meta do mês — tem contrato próprio, e onde a leitura real ainda não existe o valor
 * é `null` (a UI escreve "sem leitura", nunca zero inventado).
 */

import type { CardLead } from "./funil";
import { prioridadeCard, type SlaEtapas } from "./funil-ordenacao.ts";
import type { TarefaVisao } from "./tarefas-visao-calculos.ts";
import type { ConversaResumo } from "./conversas";
import { noAtual, noAnterior, type Comparado, type Janela, type LinhaPrimeiraResposta, type PontoDia, type ResumoAtor } from "./dashboard-ceo-calculos.ts";

// ─────────────── abas e filtros da URL ───────────────

export type Aba = "geral" | "equipe" | "marketing";
export const ABAS: Array<{ chave: Aba; rotulo: string }> = [
  { chave: "geral", rotulo: "Operação" },
  { chave: "equipe", rotulo: "Equipe" },
  { chave: "marketing", rotulo: "Marketing" },
];

export function interpretarAba(v: unknown): Aba {
  const s = String(Array.isArray(v) ? v[0] : (v ?? "")).trim();
  return (ABAS.some((a) => a.chave === s) ? s : "geral") as Aba;
}

/** Tabela | Dashboard — a mesma leitura, duas densidades. */
export type Vista = "dashboard" | "tabela";
export function interpretarVista(v: unknown): Vista {
  return String(Array.isArray(v) ? v[0] : (v ?? "")).trim() === "tabela" ? "tabela" : "dashboard";
}

/** Lista de valores de um parametro multi (`?pessoa=a,b` ou repetido). Ate 20, sem vazios. */
export function interpretarLista(v: unknown): string[] {
  const bruto = Array.isArray(v) ? v.join(",") : String(v ?? "");
  return [...new Set(bruto.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 20);
}

/** Todos os recortes da toolbar, juntos — o que viaja na URL e o que cada bloco le. */
export type TipoLead = "lead" | "paciente";

export interface FiltrosDashboard {
  q: string;
  /** quem ATENDEU (chave de ator) — recorta KPIs, evolução, funil e tabelas */
  pessoas: string[];
  /** quem é DONO do lead (uuid de pessoa) — recorta leads parados e tarefas vencidas */
  responsaveis: string[];
  /** lead (ainda no funil) × paciente (já comprou) — recorta leads parados */
  tipos: TipoLead[];
  numeros: string[];
  etapas: string[];
  origens: string[];
  cidades: string[];
  departamento: DepartamentoFiltro;
  /** false = esconde a variacao vs periodo anterior */
  comparar: boolean;
}

export const FILTROS_VAZIOS: FiltrosDashboard = { q: "", pessoas: [], responsaveis: [], tipos: [], numeros: [], etapas: [], origens: [], cidades: [], departamento: null, comparar: true };

export function interpretarFiltros(sp: Record<string, string | string[] | undefined>): FiltrosDashboard {
  return {
    q: interpretarBusca(sp.q),
    pessoas: interpretarLista(sp.pessoa).filter((a) => /^(agente|humano):[A-Za-z0-9_.:-]+$/.test(a)),
    responsaveis: interpretarLista(sp.responsavel),
    tipos: interpretarLista(sp.tipo).filter((t): t is TipoLead => t === "lead" || t === "paciente"),
    numeros: interpretarLista(sp.numero),
    etapas: interpretarLista(sp.etapa),
    origens: interpretarLista(sp.origem),
    cidades: interpretarLista(sp.cidade),
    departamento: interpretarDepartamento(sp.dep),
    comparar: String(Array.isArray(sp.comparar) ? sp.comparar[0] : (sp.comparar ?? "1")) !== "0",
  };
}

/** Um lead vira "paciente" quando comprou: etapa de ganho, ou tag de pós-venda. */
export function tipoDoLead(card: { etapa: string; tags?: string[] }, etapasGanho: Set<string>): TipoLead {
  if (etapasGanho.has(card.etapa)) return "paciente";
  if ((card.tags ?? []).some((t) => /retorno|adapta|p[óo]s-venda/i.test(t))) return "paciente";
  return "lead";
}

/** Busca livre (`?q=`) — recorta as tabelas por nome de pessoa, número ou etapa. */
export function interpretarBusca(v: unknown): string {
  return String(Array.isArray(v) ? v[0] : (v ?? "")).trim().slice(0, 80);
}

export function casaBusca(texto: string, q: string): boolean {
  if (!q) return true;
  const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return norm(texto).includes(norm(q));
}

/** Recorte de departamento do segmented control. `null` = todos. */
export type DepartamentoFiltro = "pre_venda" | "pos_venda" | null;
export const DEPARTAMENTOS_FILTRO: Array<{ chave: DepartamentoFiltro; rotulo: string }> = [
  { chave: "pre_venda", rotulo: "Pré-venda" },
  { chave: "pos_venda", rotulo: "Pós-venda" },
  { chave: null, rotulo: "Todos" },
];

export function interpretarDepartamento(v: unknown): DepartamentoFiltro {
  const s = String(Array.isArray(v) ? v[0] : (v ?? "")).trim();
  return s === "pre_venda" || s === "pos_venda" ? s : null;
}

/** O estado inteiro da URL do dashboard. `null`/vazio = padrao e nao entra na query. */
export interface EstadoUrl {
  aba: Aba;
  vista: Vista;
  periodo: 7 | 30 | 90;
  de?: string | null;
  ate?: string | null;
  filtros: FiltrosDashboard;
}

/** A URL do dashboard com TODOS os recortes — a mesma para toolbar, chips, abas e links internos. */
export function montarHref(e: EstadoUrl, mudanca: Partial<Omit<EstadoUrl, "filtros">> & { filtros?: Partial<FiltrosDashboard> } = {}): string {
  const f: FiltrosDashboard = { ...e.filtros, ...(mudanca.filtros ?? {}) };
  const aba = mudanca.aba ?? e.aba;
  const vista = mudanca.vista ?? e.vista;
  const periodo = mudanca.periodo ?? e.periodo;
  const de = mudanca.de === undefined ? e.de : mudanca.de;
  const ate = mudanca.ate === undefined ? e.ate : mudanca.ate;
  const q = new URLSearchParams();
  if (aba !== "geral") q.set("aba", aba);
  if (vista === "tabela") q.set("vista", "tabela");
  if (de && ate) {
    q.set("de", de);
    q.set("ate", ate);
  } else q.set("periodo", String(periodo));
  if (f.q) q.set("q", f.q);
  if (f.pessoas.length) q.set("pessoa", f.pessoas.join(","));
  if (f.responsaveis.length) q.set("responsavel", f.responsaveis.join(","));
  if (f.tipos.length) q.set("tipo", f.tipos.join(","));
  if (f.numeros.length) q.set("numero", f.numeros.join(","));
  if (f.etapas.length) q.set("etapa", f.etapas.join(","));
  if (f.origens.length) q.set("origem", f.origens.join(","));
  if (f.cidades.length) q.set("cidade", f.cidades.join(","));
  if (f.departamento) q.set("dep", f.departamento);
  if (!f.comparar) q.set("comparar", "0");
  return `/?${q.toString()}`;
}

// ─────────────── trajetória (mini-barras) ───────────────

/**
 * Compacta uma série diária em no máximo `n` barras somando vizinhos — 90 dias não cabem em 80px.
 * Mantém a ORDEM (mais antigo → mais novo) e nunca inventa ponto: 7 dias viram 7 barras.
 */
export function compactar(valores: number[], n = 16): number[] {
  if (valores.length <= n) return valores;
  const tam = valores.length / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const ini = Math.floor(i * tam);
    const fim = Math.floor((i + 1) * tam);
    let s = 0;
    for (let k = ini; k < fim; k++) s += valores[k] ?? 0;
    out.push(s);
  }
  return out;
}

export function trajetoria(serie: PontoDia[], campo: keyof Omit<PontoDia, "dia" | "rotulo">): number[] {
  return compactar(serie.map((p) => p[campo]));
}

/** Conversas respondidas por dia (1ª resposta dada), na ordem dos dias da janela. */
export function serieRespondidas(primeira: LinhaPrimeiraResposta[], dias: string[]): number[] {
  const porDia = new Map<string, number>();
  for (const p of primeira) {
    if (p.minutos == null || !p.respondida_por) continue;
    porDia.set(p.dia, (porDia.get(p.dia) ?? 0) + 1);
  }
  return dias.map((d) => porDia.get(d) ?? 0);
}

// ─────────────── precisa de atenção ───────────────

export type TipoAtencao = "sem_resposta" | "tarefas_vencidas" | "leads_parados" | "canal" | "propostas_jarvis";

export interface QuebraAtencao {
  rotulo: string;
  /** já formatado — "3", "1h46", "R$ 12 mil" — porque a unidade muda por tipo */
  valor: string;
  href?: string;
}

export interface ItemAtencao {
  tipo: TipoAtencao;
  /** "7 conversas sem resposta há mais de 2 h" */
  titulo: string;
  /** "a mais antiga: Antônia Ribeiro, há 14 h" */
  detalhe: string | null;
  quantidade: number;
  gravidade: "alta" | "media" | "baixa";
  /** a tela certa, já filtrada */
  href: string;
  /** até 4 subitens (por pessoa, por canal) */
  quebra: QuebraAtencao[];
}

export interface Atencao {
  itens: ItemAtencao[];
  /** tipos cuja leitura não respondeu — a UI diz "sem leitura de X", nunca "tudo certo" */
  indisponiveis: TipoAtencao[];
}

/** Limiar de "sem resposta" — em horas. Config, não hardcode: vem de `core.config` quando existir. */
export const HORAS_SEM_RESPOSTA = 2;

export function horasDesde(iso: string | null | undefined, agoraMs: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.max(0, (agoraMs - t) / 3_600_000) : null;
}

/** "4 min" · "1h46" — o mesmo desenho do `fmtMinutos` do dashboard, sem importar a camada de cima. */
export function fmtMin(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** "R$ 81 mil" · "R$ 1,2 mi" · "R$ 950" — para caber na terceira linha de um card estreito. */
export function fmtMoedaCurta(v: number | null | undefined): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `R$ ${Math.round(v / 1_000).toLocaleString("pt-BR")} mil`;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function fmtHoras(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
}

function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/).slice(0, 2).join(" ") || "sem nome";
}

/** Conversas com última mensagem do cliente sem resposta há mais de `HORAS_SEM_RESPOSTA`. */
export function atencaoSemResposta(conversas: ConversaResumo[], agoraMs: number, limiarHoras = HORAS_SEM_RESPOSTA): ItemAtencao | null {
  const paradas = conversas
    .filter((c) => c.nao_lida)
    .map((c) => ({ c, h: horasDesde(c.ultima_entrada_em ?? c.ultima_msg_em ?? c.atualizado_em, agoraMs) }))
    .filter((x): x is { c: ConversaResumo; h: number } => x.h != null && x.h >= limiarHoras)
    .sort((a, b) => b.h - a.h);
  if (paradas.length === 0) return null;

  const porNumero = new Map<string, number>();
  for (const { c } of paradas) {
    const k = c.numero_apelido ?? c.phone_number_id ?? "sem número";
    porNumero.set(k, (porNumero.get(k) ?? 0) + 1);
  }
  const maisAntiga = paradas[0];
  return {
    tipo: "sem_resposta",
    titulo: `${paradas.length} ${paradas.length === 1 ? "conversa" : "conversas"} sem resposta há mais de ${limiarHoras} h`,
    detalhe: `a mais antiga: ${primeiroNome(maisAntiga.c.nome)}, há ${fmtHoras(maisAntiga.h)}`,
    quantidade: paradas.length,
    gravidade: paradas.some((p) => p.h >= 12) ? "alta" : "media",
    href: "/conversas?filtro=sem_resposta",
    quebra: [...porNumero.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([rotulo, quantidade]) => ({ rotulo, valor: String(quantidade) })),
  };
}

/** Nome curto de uma pessoa a partir do que a tarefa carrega: id → nome do catálogo; senão o e-mail sem domínio. */
export type ResolverNome = (id: string | null, fallback: string | null) => string;
export const nomeDoEmail: ResolverNome = (_id, fallback) => (fallback ?? "sem responsável").replace(/@.*$/, "");

/** Tarefas vencidas, quebradas por responsável. */
export function atencaoTarefasVencidas(tarefas: TarefaVisao[], nomeDe: ResolverNome = nomeDoEmail): ItemAtencao | null {
  const vencidas = tarefas.filter((t) => t.status === "pendente" && t.vencida);
  if (vencidas.length === 0) return null;
  const porPessoa = new Map<string, { nome: string; n: number; id: string | null }>();
  for (const t of vencidas) {
    const k = t.responsavel_id ?? t.responsavel ?? "sem responsável";
    const atual = porPessoa.get(k) ?? { nome: nomeDe(t.responsavel_id, t.responsavel), n: 0, id: t.responsavel_id };
    atual.n++;
    porPessoa.set(k, atual);
  }
  const maisVelha = vencidas.reduce((a, b) => (String(a.prazo ?? "") < String(b.prazo ?? "") ? a : b));
  return {
    tipo: "tarefas_vencidas",
    titulo: `${vencidas.length} ${vencidas.length === 1 ? "tarefa vencida" : "tarefas vencidas"}`,
    detalhe: maisVelha.lead_nome ? `a mais antiga: ${maisVelha.titulo.toLowerCase()} · ${primeiroNome(maisVelha.lead_nome)}` : `a mais antiga: ${maisVelha.titulo.toLowerCase()}`,
    quantidade: vencidas.length,
    gravidade: vencidas.length >= 10 ? "alta" : "media",
    href: "/tarefas?prazo=vencidas",
    quebra: [...porPessoa.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 4)
      .map((p) => ({ rotulo: p.nome, valor: String(p.n), href: p.id ? `/tarefas?responsavel=${encodeURIComponent(p.id)}` : undefined })),
  };
}

/**
 * Leads parados além do SLA da etapa — a MESMA `prioridadeCard` que pinta o funil (D55). Só as
 * etapas ABERTAS entram: lead em ganho/perdido não está "parado", está terminado.
 */
export function atencaoLeadsParados(
  cards: CardLead[],
  sla: SlaEtapas,
  agoraMs: number,
  etapas: Array<{ chave: string; nome: string; tipo: string }> = [],
): ItemAtencao | null {
  const abertas = new Map(etapas.filter((e) => e.tipo === "aberto").map((e) => [e.chave, e.nome] as const));
  const estourados = cards
    .filter((c) => abertas.size === 0 || abertas.has(c.etapa))
    .map((c) => ({ c, p: prioridadeCard(c, sla, agoraMs) }))
    .filter((x) => x.p.faixa === "agora" && !x.p.pausado);
  if (estourados.length === 0) return null;
  const porEtapa = new Map<string, number>();
  for (const { c } of estourados) porEtapa.set(c.etapa, (porEtapa.get(c.etapa) ?? 0) + 1);
  const pior = estourados.reduce((a, b) => ((b.p.excedenteHoras ?? 0) > (a.p.excedenteHoras ?? 0) ? b : a));
  const valor = estourados.reduce((s, x) => s + (x.c.valor ?? 0), 0);
  return {
    tipo: "leads_parados",
    titulo: `${estourados.length} ${estourados.length === 1 ? "lead parado" : "leads parados"} além do prazo da etapa`,
    detalhe:
      valor > 0
        ? `${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} em jogo · o pior: ${primeiroNome(pior.c.nome)}, +${fmtHoras(pior.p.excedenteHoras)}`
        : `o pior: ${primeiroNome(pior.c.nome)}, +${fmtHoras(pior.p.excedenteHoras)}`,
    quantidade: estourados.length,
    gravidade: estourados.length >= 5 ? "alta" : "media",
    href: "/funil?ordem=prioridade",
    quebra: [...porEtapa.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([etapa, quantidade]) => ({ rotulo: abertas.get(etapa) ?? etapa, valor: String(quantidade), href: `/funil?etapa=${encodeURIComponent(etapa)}` })),
  };
}

/** Limiar de 1ª resposta por canal (minutos) — o mesmo do LiderHub (SLA de 5 min). */
export const MINUTOS_SLA_CANAL = 5;

export interface LinhaCanal {
  canal_id: string;
  apelido: string;
  numero: string;
  provedor: "waba" | "nao_oficial";
  departamento: string;
  ativo: boolean;
  /** `false` = Lite não pareado / expirado; oficial é sempre `true` quando ativo. */
  conectado: boolean;
  recebidas: Comparado;
  respondidas: Comparado;
  /** das respondidas, quantas em até MINUTOS_SLA_CANAL */
  dentroDeSla: Comparado;
  /** conversas com entrada do cliente e nenhuma resposta nossa depois (agora) */
  semResposta: number;
  /** mediana de minutos da 1ª resposta no período; null sem amostra */
  primeiraRespostaMin: number | null;
  conversasAbertas: number;
}

/** Canal desconectado, ou com 1ª resposta acima do SLA, ou com fila sem resposta. */
export function atencaoCanais(canais: LinhaCanal[]): ItemAtencao | null {
  const problemas = canais
    .filter((c) => c.ativo)
    .map((c) => {
      if (!c.conectado) return { c, motivo: "desconectado", peso: 3 };
      if (c.primeiraRespostaMin != null && c.primeiraRespostaMin > MINUTOS_SLA_CANAL) return { c, motivo: `${fmtMin(c.primeiraRespostaMin)} na 1ª resposta`, peso: 2 };
      if (c.semResposta > 0) return { c, motivo: `${c.semResposta} sem resposta`, peso: 1 };
      return null;
    })
    .filter((x): x is { c: LinhaCanal; motivo: string; peso: number } => x != null)
    .sort((a, b) => b.peso - a.peso);
  if (problemas.length === 0) return null;
  const desconectados = problemas.filter((p) => p.peso === 3).length;
  const lentos = problemas.filter((p) => p.peso === 2).length;
  const titulo =
    desconectados > 0
      ? `${desconectados} ${desconectados === 1 ? "número desconectado" : "números desconectados"}`
      : lentos > 0
        ? `${lentos} ${lentos === 1 ? "número" : "números"} acima de ${MINUTOS_SLA_CANAL} min na 1ª resposta`
        : `${problemas.length} ${problemas.length === 1 ? "número com conversa" : "números com conversas"} esperando`;
  return {
    tipo: "canal",
    titulo,
    // o detalhe fica nos chips (um por número, com o motivo) — repetir aqui seria a mesma frase duas vezes
    detalhe: null,
    quantidade: problemas.length,
    gravidade: desconectados > 0 ? "alta" : "media",
    href: desconectados > 0 ? "/configuracoes/canais" : "/?aba=canais",
    quebra: problemas.slice(0, 4).map((p) => ({ rotulo: p.c.apelido, valor: p.motivo, href: `/conversas?canal=${encodeURIComponent(p.c.canal_id)}` })),
  };
}

/** Propostas do Jarvis (sugestões) esperando decisão humana. */
export function atencaoPropostasJarvis(pendentes: number | null, porAgente: Array<{ nome: string; n: number }> = []): ItemAtencao | null {
  if (pendentes == null || pendentes === 0) return null;
  return {
    tipo: "propostas_jarvis",
    titulo: `${pendentes} ${pendentes === 1 ? "proposta do Jarvis esperando" : "propostas do Jarvis esperando"} decisão`,
    detalhe: porAgente.length > 0 ? porAgente.map((a) => `${a.nome} ${a.n}`).join(" · ") : null,
    quantidade: pendentes,
    gravidade: "baixa",
    href: "/fila",
    quebra: porAgente.slice(0, 4).map((a) => ({ rotulo: a.nome, valor: String(a.n) })),
  };
}

const PESO_GRAVIDADE = { alta: 0, media: 1, baixa: 2 } as const;

/** Ordem fixa: gravidade, depois quantidade. Nada de ordenar por tipo — o que grita primeiro é o que vem primeiro. */
export function ordenarAtencao(itens: Array<ItemAtencao | null>): ItemAtencao[] {
  return itens
    .filter((i): i is ItemAtencao => i != null)
    .sort((a, b) => PESO_GRAVIDADE[a.gravidade] - PESO_GRAVIDADE[b.gravidade] || b.quantidade - a.quantidade);
}

// ─────────────── canais ───────────────

/** Mediana de minutos da 1ª resposta das conversas de um canal, na janela. */
export function primeiraRespostaPorCanal(primeira: LinhaPrimeiraResposta[], conversaCanal: Map<string, string>, j: Janela): Map<string, number | null> {
  const tempos = new Map<string, number[]>();
  for (const p of primeira) {
    if (!noAtual(p.dia, j) || p.minutos == null) continue;
    const canal = conversaCanal.get(p.conversa_id);
    if (!canal) continue;
    const arr = tempos.get(canal) ?? [];
    arr.push(Number(p.minutos));
    tempos.set(canal, arr);
  }
  const out = new Map<string, number | null>();
  for (const [canal, arr] of tempos) {
    const v = [...arr].sort((a, b) => a - b);
    const meio = Math.floor(v.length / 2);
    out.set(canal, v.length === 0 ? null : v.length % 2 === 1 ? v[meio] : (v[meio - 1] + v[meio]) / 2);
  }
  return out;
}

// ─────────────── equipe ───────────────

export interface LinhaEquipe extends ResumoAtor {
  /** conversas respondidas (1ª resposta dada por este ator) na janela */
  respondidas: Comparado;
  /** das respondidas, quantas em até MINUTOS_SLA_CANAL */
  dentroDeSla: Comparado;
  /** conversas abertas com este ator como dono AGORA; null = sem leitura */
  cargaAgora: number | null;
  departamento: string | null;
  /** vendas ganhas no período com este ator como dono; null = sem leitura */
  ganhos: { vendas: number; valor: number } | null;
}

/** Média das medianas de 1ª resposta, ponderada pela amostra — a régua das barras da tabela. */
export function mediaEquipeMin(linhas: Array<Pick<ResumoAtor, "primeiraResposta" | "tipo">>, soHumanos = false): number | null {
  let soma = 0;
  let n = 0;
  for (const l of linhas) {
    if (soHumanos && l.tipo !== "humano") continue;
    const { medianaMin, amostra } = l.primeiraResposta;
    if (medianaMin == null || amostra === 0) continue;
    soma += medianaMin * amostra;
    n += amostra;
  }
  return n === 0 ? null : soma / n;
}

export function respondidasPorAtor(primeira: LinhaPrimeiraResposta[], ator: string, j: Janela, ateMin?: number): Comparado {
  let atual = 0;
  let anterior = 0;
  for (const p of primeira) {
    if (p.respondida_por !== ator || p.minutos == null) continue;
    if (ateMin != null && Number(p.minutos) > ateMin) continue;
    if (noAtual(p.dia, j)) atual++;
    else if (noAnterior(p.dia, j)) anterior++;
  }
  return { atual, anterior };
}

// ─────────────── séries dos gráficos ───────────────

export interface PontoAcumulado {
  dia: string;
  rotulo: string;
  leads: number;
  conversas: number;
  leadsAcumulado: number;
  conversasAcumulado: number;
}

/** Série acumulada da janela; `agrupar` soma dias vizinhos (1 = dia a dia, 7 = semana). */
export function serieAcumulada(serie: PontoDia[], agrupar = 1): PontoAcumulado[] {
  const out: PontoAcumulado[] = [];
  let l = 0;
  let c = 0;
  for (let i = 0; i < serie.length; i += agrupar) {
    const grupo = serie.slice(i, i + agrupar);
    const leads = grupo.reduce((s, p) => s + p.leadsNovos, 0);
    const conversas = grupo.reduce((s, p) => s + p.conversas, 0);
    l += leads;
    c += conversas;
    out.push({ dia: grupo[0].dia, rotulo: grupo[0].rotulo, leads, conversas, leadsAcumulado: l, conversasAcumulado: c });
  }
  return out;
}

/** Soma do heatmap por hora (0–23), para o gráfico de barras "por hora". */
export function serieHoraria(h: Heatmap | null): Array<{ hora: number; rotulo: string; total: number }> {
  if (!h) return [];
  return Array.from({ length: 24 }, (_, hora) => ({
    hora,
    rotulo: `${hora}h`,
    total: h.reduce((s, linha) => s + (linha[hora] ?? 0), 0),
  }));
}

// ─────────────── heatmap hora × dia ───────────────

/** `celulas[dow][hora]` com dow 0=domingo … 6=sábado, como `Date#getDay`. */
export type Heatmap = number[][];

export function heatmapVazio(): Heatmap {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}

export function maxHeatmap(h: Heatmap): number {
  let m = 0;
  for (const linha of h) for (const v of linha) if (v > m) m = v;
  return m;
}

// ─────────────── meta do mês ───────────────

export interface MetaMes {
  /** "2026-09" */
  mes: string;
  metaVendas: number;
  vendas: number;
  metaValor: number | null;
  valor: number;
  diasCorridos: number;
  diasNoMes: number;
}

export interface RitmoMeta {
  /** fração da meta já realizada */
  fracao: number;
  /** fração do mês já corrido */
  fracaoTempo: number;
  /** vendas esperadas até hoje, no ritmo linear */
  esperadoAteHoje: number;
  /** vendas/dia necessárias no restante para bater a meta */
  ritmoNecessario: number | null;
  estado: "no_ritmo" | "abaixo" | "batida";
}

export function ritmoMeta(m: MetaMes): RitmoMeta {
  const fracao = m.metaVendas > 0 ? m.vendas / m.metaVendas : 0;
  const fracaoTempo = m.diasNoMes > 0 ? m.diasCorridos / m.diasNoMes : 0;
  const esperadoAteHoje = m.metaVendas * fracaoTempo;
  const restantes = Math.max(0, m.diasNoMes - m.diasCorridos);
  const faltam = Math.max(0, m.metaVendas - m.vendas);
  const ritmoNecessario = restantes === 0 ? null : faltam / restantes;
  const estado: RitmoMeta["estado"] = m.vendas >= m.metaVendas ? "batida" : m.vendas >= esperadoAteHoje * 0.9 ? "no_ritmo" : "abaixo";
  return { fracao, fracaoTempo, esperadoAteHoje, ritmoNecessario, estado };
}

// ─────────────── Jarvis diz ───────────────

/** O mesmo contrato do bloco do W-J (`components/jarvis/jarvis-diz.tsx`) — o Jarvis tem uma cara só no app. */
export interface ObservacaoJarvisDono {
  texto: string;
  href: string;
  destino: string;
  origem?: string | null;
  faixa?: "AGORA" | "HOJE" | "NA SEMANA" | null;
}

export interface JarvisDiz {
  /** a frase do dia — uma sentença. `null` = o Jarvis ainda não olhou hoje. */
  frase: string | null;
  /** até três observações, cada uma com o link para a tela certa */
  observacoes: ObservacaoJarvisDono[];
  /** cada uma abre `/jarvis` com o texto preenchido */
  perguntas: string[];
  /** ISO da última passada; null = nunca */
  geradoEm: string | null;
}

export const PERGUNTAS_PADRAO = ["Quantas conversas estão sem resposta?", "Quais tarefas venceram e de quem são?", "Como está o funil esta semana?"];

export function hrefPergunta(pergunta: string): string {
  return `/jarvis?contexto=%2F&pergunta=${encodeURIComponent(pergunta)}`;
}
