import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import { diffDiasSP } from "@/lib/dados/tarefas-visao-calculos";

/*
 * A ORDEM "MAIS URGENTE PRIMEIRO" — e por que ela tem de ser EXPLICÁVEL (11/09, pedido do Diogo:
 * "focaria bastante em visualização, filtros, priorização").
 *
 * Toda lista de tarefas ordena. O que quase nenhuma faz é DIZER POR QUE aquela ficou em primeiro —
 * e é aí que a ordem deixa de ser ajuda e vira superstição: a Sara passa a confiar ou a ignorar a
 * primeira linha em bloco, porque não tem como conferir. Aqui a ordem é a soma de fatores com
 * nome, e a tela mostra a soma de volta em português ("vencida há 1 d · lead em Proposta enviada ·
 * R$ 21 mil parados"). Se o número estiver errado, dá para apontar QUAL fator errou.
 *
 * Três regras de desenho, cada uma com um motivo:
 *
 * 1. **O que não se sabe vale ZERO, nunca um chute.** `SinaisDoLead` é todo opcional. Em produção
 *    hoje chegam `undefined` a etapa, o valor e o tempo sem resposta — a ordem então é vencida →
 *    hoje → prioridade → prazo, que é exatamente a ordem que a tela já tinha. A tela não fica
 *    pior por não saber; ela fica melhor quando sabe.
 * 2. **Fator só entra na lista se pontuar.** O "por quê" mostra o que EMPURROU a tarefa para cima,
 *    não um formulário com seis linhas onde quatro dizem zero.
 * 3. **Atraso pesa mais que tudo, e satura.** Uma tarefa parada há 40 dias não é 40 vezes mais
 *    urgente que a de ontem — é urgente e velha. Sem o teto, uma tarefa esquecida em março
 *    engoliria a fila do dia para sempre.
 *
 * Os pesos são NÚMEROS NESTE ARQUIVO, e isso é uma dívida declarada: quando a priorização sair do
 * ensaio, eles viram config (`core.config`, chave `pesos_tarefa`) — Constituição §4, "preço,
 * régua e SLA são dado, não código". Enquanto é uma tela de ensaio, config seria cerimônia sobre
 * número que ainda não foi calibrado com ninguém.
 */

/**
 * O que se sabe do LEAD por trás da tarefa. Tudo opcional: em produção a leitura ainda não traz
 * nada disto (é o [M] do benchmark de 10/09), e no ensaio vem de `lib/ensaio/tarefas-foco.ts`.
 */
export interface SinaisDoLead {
  /** chave da etapa no funil: `novo`, `qualificando`, `avaliacao`, `proposta`, `negociacao`, … */
  etapa?: string | null;
  /** nome legível da etapa — é ele que aparece no "por quê" */
  etapa_nome?: string | null;
  /** valor em reais da proposta/negociação */
  valor?: number | null;
  /**
   * Horas desde a última mensagem DO LEAD que ainda não foi respondida. `null` = ou ele não está
   * esperando, ou não sabemos — e as duas viram zero ponto, porque inventar espera é pior do que
   * não contar essa dimensão.
   */
  horas_sem_resposta?: number | null;
}

export type SinaisPorTarefa = Record<string, SinaisDoLead>;

export interface FatorPeso {
  chave: string;
  /** já em português e pronto para a tela: "vencida há 1 d", "R$ 21 mil parados" */
  texto: string;
  pontos: number;
}

export interface PesoTarefa {
  total: number;
  /** só o que pontuou, do que mais empurrou para o que menos */
  fatores: FatorPeso[];
}

// ─────────────── os pesos ───────────────

const PESO_VENCIDA_BASE = 60;
const PESO_VENCIDA_POR_DIA = 8;
const TETO_VENCIDA = 40; // teto do acréscimo por dia: atraso satura, não acumula para sempre
const PESO_HOJE = 35;
const PESO_AMANHA = 12;
const PESO_PRIORIDADE_ALTA = 25;
const PESO_PRIORIDADE_BAIXA = -10;

/** A etapa diz quanto custa o silêncio. Proposta e negociação são onde o dinheiro esfria. */
const PESO_ETAPA: Record<string, number> = {
  negociacao: 20,
  proposta: 18,
  avaliacao: 10,
  qualificando: 5,
  novo: 3,
  ganho: 0,
  perdido: -5,
};

/** Espera do lead, em degraus — a diferença entre 2 h e 3 h não muda decisão nenhuma. */
const DEGRAUS_ESPERA: Array<{ horas: number; pontos: number }> = [
  { horas: 48, pontos: 22 },
  { horas: 24, pontos: 16 },
  { horas: 8, pontos: 10 },
  { horas: 2, pontos: 5 },
];

/** Valor, também em degraus: R$ 21 mil e R$ 23 mil pedem a mesma coisa. */
const DEGRAUS_VALOR: Array<{ reais: number; pontos: number }> = [
  { reais: 20000, pontos: 18 },
  { reais: 10000, pontos: 12 },
  { reais: 5000, pontos: 7 },
  { reais: 1, pontos: 3 },
];

// ─────────────── textos ───────────────

export function dinheiroCurto(v: number): string {
  if (v >= 1000) return `R$ ${Math.round(v / 1000)} mil`;
  return `R$ ${Math.round(v)}`;
}

/** "há 1 d", "há 3 d", "hoje" — a unidade da dívida com o paciente é o dia, não a hora. */
function atrasoEmTexto(dias: number): string {
  if (dias <= 0) return "vencida hoje";
  return `vencida há ${dias} d`;
}

function esperaEmTexto(horas: number): string {
  if (horas >= 48) return `lead esperando há ${Math.floor(horas / 24)} d`;
  if (horas >= 24) return "lead esperando há 1 d";
  return `lead esperando há ${Math.floor(horas)} h`;
}

// ─────────────── o peso ───────────────

export function pesoDaTarefa(t: TarefaVisao, sinais: SinaisDoLead | undefined, agoraMs: number): PesoTarefa {
  const fatores: FatorPeso[] = [];

  // 1. prazo — vencida, hoje, amanhã
  const dias = t.prazo ? diffDiasSP(t.prazo, agoraMs) : null;
  if (t.vencida) {
    const atraso = dias != null ? Math.max(0, -dias) : 0;
    fatores.push({
      chave: "vencida",
      texto: atrasoEmTexto(atraso),
      pontos: PESO_VENCIDA_BASE + Math.min(TETO_VENCIDA, atraso * PESO_VENCIDA_POR_DIA),
    });
  } else if (dias === 0) {
    fatores.push({ chave: "hoje", texto: "vence hoje", pontos: PESO_HOJE });
  } else if (dias === 1) {
    fatores.push({ chave: "amanha", texto: "vence amanhã", pontos: PESO_AMANHA });
  }

  // 2. prioridade declarada (ainda não existe no banco — só o ensaio preenche)
  if (t.prioridade === "alta") fatores.push({ chave: "prioridade", texto: "prioridade alta", pontos: PESO_PRIORIDADE_ALTA });
  else if (t.prioridade === "baixa") fatores.push({ chave: "prioridade", texto: "prioridade baixa", pontos: PESO_PRIORIDADE_BAIXA });

  // 3. etapa do lead
  const etapa = sinais?.etapa;
  if (etapa && PESO_ETAPA[etapa] != null && PESO_ETAPA[etapa] !== 0) {
    fatores.push({
      chave: "etapa",
      texto: `lead em ${sinais?.etapa_nome ?? etapa}`,
      pontos: PESO_ETAPA[etapa],
    });
  }

  // 4. o lead está esperando
  const horas = sinais?.horas_sem_resposta;
  if (horas != null && horas > 0) {
    const degrau = DEGRAUS_ESPERA.find((d) => horas >= d.horas);
    if (degrau) fatores.push({ chave: "espera", texto: esperaEmTexto(horas), pontos: degrau.pontos });
  }

  // 5. dinheiro parado
  const valor = sinais?.valor;
  if (valor != null && valor > 0) {
    const degrau = DEGRAUS_VALOR.find((d) => valor >= d.reais);
    if (degrau) fatores.push({ chave: "valor", texto: `${dinheiroCurto(valor)} parados`, pontos: degrau.pontos });
  }

  fatores.sort((a, b) => b.pontos - a.pontos);
  return { total: fatores.reduce((s, f) => s + f.pontos, 0), fatores };
}

/**
 * O "por quê" em uma linha: os três fatores que mais empurraram, separados por " · ". Só os
 * POSITIVOS — "prioridade baixa" explica por que ela não subiu, e ninguém pergunta isso ao ver a
 * primeira da fila.
 */
export function porQueEstaAqui(p: PesoTarefa, limite = 3): string {
  return p.fatores
    .filter((f) => f.pontos > 0)
    .slice(0, limite)
    .map((f) => f.texto)
    .join(" · ");
}

// ─────────────── ordenações ───────────────

export type ChaveOrdem = "urgencia" | "prazo" | "prioridade" | "valor" | "espera";

export const ORDENS: Array<{ chave: ChaveOrdem; rotulo: string; explica: string }> = [
  { chave: "urgencia", rotulo: "Mais urgente primeiro", explica: "soma vencida + prazo + prioridade + etapa do lead + espera + valor" },
  { chave: "prazo", rotulo: "Prazo", explica: "a mais atrasada primeiro; sem prazo no fim" },
  { chave: "prioridade", rotulo: "Prioridade", explica: "alta → média → baixa" },
  { chave: "valor", rotulo: "Valor da proposta", explica: "o maior primeiro" },
  { chave: "espera", rotulo: "Lead mais tempo sem resposta", explica: "quem está esperando há mais tempo" },
];

export const ROTULO_ORDEM: Record<ChaveOrdem, string> = {
  urgencia: "Mais urgente primeiro",
  prazo: "Prazo",
  prioridade: "Prioridade",
  valor: "Valor da proposta",
  espera: "Lead mais tempo sem resposta",
};

export function ehChaveOrdem(v: unknown): v is ChaveOrdem {
  return v === "urgencia" || v === "prazo" || v === "prioridade" || v === "valor" || v === "espera";
}

const SEM_PRAZO = Number.MAX_SAFE_INTEGER;

function prazoMs(t: TarefaVisao): number {
  const ms = t.prazo ? new Date(t.prazo).getTime() : NaN;
  return Number.isFinite(ms) ? ms : SEM_PRAZO;
}

function pesoPrio(t: TarefaVisao): number {
  return t.prioridade === "alta" ? 0 : t.prioridade === "baixa" ? 2 : 1;
}

/**
 * Ordena e já devolve o peso de cada uma — a tela precisa dos dois, e calcular duas vezes é como
 * uma ordem passa a discordar da explicação que ela mesma mostra.
 */
export function ordenarPorUrgencia(
  tarefas: TarefaVisao[],
  sinais: SinaisPorTarefa,
  agoraMs: number,
): Array<{ t: TarefaVisao; peso: PesoTarefa }> {
  return tarefas
    .map((t) => ({ t, peso: pesoDaTarefa(t, sinais[t.id], agoraMs) }))
    .sort((a, b) => b.peso.total - a.peso.total || prazoMs(a.t) - prazoMs(b.t) || a.t.criado_em.localeCompare(b.t.criado_em));
}

/** As outras ordens. Devolve o mesmo formato, com o peso junto (o "por quê" continua alcançável). */
export function ordenar(
  tarefas: TarefaVisao[],
  ordem: ChaveOrdem,
  sinais: SinaisPorTarefa,
  agoraMs: number,
): Array<{ t: TarefaVisao; peso: PesoTarefa }> {
  if (ordem === "urgencia") return ordenarPorUrgencia(tarefas, sinais, agoraMs);
  const comPeso = tarefas.map((t) => ({ t, peso: pesoDaTarefa(t, sinais[t.id], agoraMs) }));
  const desempate = (a: { t: TarefaVisao }, b: { t: TarefaVisao }) =>
    prazoMs(a.t) - prazoMs(b.t) || a.t.criado_em.localeCompare(b.t.criado_em);
  switch (ordem) {
    case "prazo":
      return comPeso.sort((a, b) => prazoMs(a.t) - prazoMs(b.t) || a.t.criado_em.localeCompare(b.t.criado_em));
    case "prioridade":
      return comPeso.sort((a, b) => pesoPrio(a.t) - pesoPrio(b.t) || desempate(a, b));
    case "valor":
      return comPeso.sort((a, b) => (sinais[b.t.id]?.valor ?? -1) - (sinais[a.t.id]?.valor ?? -1) || desempate(a, b));
    case "espera":
      return comPeso.sort((a, b) => (sinais[b.t.id]?.horas_sem_resposta ?? -1) - (sinais[a.t.id]?.horas_sem_resposta ?? -1) || desempate(a, b));
  }
}
