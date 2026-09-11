import type { EventoTarefa, TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import type { PropostaTarefaPendente } from "./propostas";

/**
 * O "LEDGER" DO ENSAIO (W-D5, 10/09) — as escritas da /tarefas quando não há banco.
 *
 * No modo ensaio (W-D2) a página lê a fixture e as server actions não têm para onde escrever.
 * Em vez de mocar a porta, o componente guarda o que a pessoa FEZ e reaplica sobre a fixture a
 * cada render: concluiu → some da fila com o resultado; adiou → prazo novo; aceitou a proposta →
 * tarefa nova entra; descartou → proposta some. É estado de tela, morre no F5, e é isso que se
 * quer de um ensaio: ver o comportamento sem gravar um evento sequer (o ledger é append-only —
 * mock lá é proibido).
 *
 * As funções são puras para o `useMemo` e para teste; o componente só troca o objeto.
 */
export interface EscritasEnsaio {
  /** id → resultado */
  concluidas: Map<string, string>;
  /** id → prazo ISO novo */
  prazos: Map<string, string>;
  /** id → responsável novo */
  responsaveis: Map<string, string>;
  /** id → motivo */
  arquivadas: Map<string, string>;
  /** tarefas que nasceram na sessão (e-agora, proposta aceita) */
  criadas: TarefaVisao[];
  /** propostas já decididas (aceitas ou descartadas) */
  propostasResolvidas: Set<string>;
  /** v3 · o histórico que a sessão acrescentou (adiada · reatribuída · iniciada · reaberta) */
  eventos: Map<string, EventoTarefa[]>;
  /** v3 · quadro por status: `tarefa_iniciada` / `tarefa_reaberta` locais */
  iniciadas: Set<string>;
  reabertas: Set<string>;
}

export function escritasVazias(): EscritasEnsaio {
  return {
    concluidas: new Map(),
    prazos: new Map(),
    responsaveis: new Map(),
    arquivadas: new Map(),
    criadas: [],
    propostasResolvidas: new Set(),
    eventos: new Map(),
    iniciadas: new Set(),
    reabertas: new Set(),
  };
}

/** acrescenta um evento ao histórico local de uma tarefa (imutável) */
export function comEvento(e: EscritasEnsaio, id: string, ev: EventoTarefa): EscritasEnsaio {
  const eventos = new Map(e.eventos);
  eventos.set(id, [...(eventos.get(id) ?? []), ev]);
  return { ...e, eventos };
}

export function aplicarEscritas(tarefas: TarefaVisao[], e: EscritasEnsaio, agoraMs: number): TarefaVisao[] {
  const agoraIso = new Date(agoraMs).toISOString();
  const base = tarefas.map((t) => {
    let s = t;
    const extra = e.eventos.get(t.id);
    if (extra?.length) s = { ...s, historico: [...(s.historico ?? []), ...extra] };
    // reaberta no quadro: uma concluída da fixture volta para pendente
    if (e.reabertas.has(t.id) && t.status === "concluida" && !e.concluidas.has(t.id)) {
      s = { ...s, status: "pendente", resultado: null, concluida_em: null, vencida: !!t.prazo && new Date(t.prazo).getTime() < agoraMs };
    }
    const prazo = e.prazos.get(t.id);
    if (prazo) s = { ...s, prazo, vencida: new Date(prazo).getTime() < agoraMs };
    const resp = e.responsaveis.get(t.id);
    if (resp) s = { ...s, responsavel_id: resp, responsavel: null };
    const resultado = e.concluidas.get(t.id);
    if (resultado != null) s = { ...s, status: "concluida", resultado, concluida_em: agoraIso, vencida: false };
    const motivo = e.arquivadas.get(t.id);
    if (motivo != null) s = { ...s, status: "arquivada", motivo_arquivo: motivo, vencida: false };
    return s;
  });
  // as criadas também podem ter sido concluídas/adiadas na mesma sessão
  const criadas = e.criadas.map((t) => {
    let s = t;
    const extra = e.eventos.get(t.id);
    if (extra?.length) s = { ...s, historico: [...(s.historico ?? []), ...extra] };
    const prazo = e.prazos.get(t.id);
    if (prazo) s = { ...s, prazo, vencida: new Date(prazo).getTime() < agoraMs };
    const resultado = e.concluidas.get(t.id);
    if (resultado != null) s = { ...s, status: "concluida", resultado, concluida_em: agoraIso, vencida: false };
    return s;
  });
  return [...base, ...criadas];
}

/** ids em andamento depois das escritas locais: base ∪ iniciadas − (reabertas ∪ concluídas) */
export function emAndamentoComEscritas(base: readonly string[], e: EscritasEnsaio): string[] {
  const s = new Set(base);
  for (const id of e.iniciadas) s.add(id);
  for (const id of e.reabertas) s.delete(id);
  for (const id of e.concluidas.keys()) s.delete(id);
  return [...s];
}

export function propostasPendentes(propostas: PropostaTarefaPendente[], e: EscritasEnsaio): PropostaTarefaPendente[] {
  return propostas.filter((p) => !e.propostasResolvidas.has(p.id));
}

/** id novo, determinístico dentro da sessão (contador), com o mesmo prefixo da fixture */
export function idNovoEnsaio(n: number): string {
  return `en5a10-0000-4000-8000-9${String(n).padStart(11, "0")}`;
}
