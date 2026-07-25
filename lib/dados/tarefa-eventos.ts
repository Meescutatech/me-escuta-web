/**
 * Construtores PUROS dos payloads de ciclo de vida da tarefa (Rodada 14 — gestão de tarefas).
 * Contrato §5.2 da SPEC-NOTAS-TAREFAS-MENCOES + validador porta.validar_evento_tarefa (0037).
 *
 * A recusa que vale é a da PORTA (motivo obrigatório é check_violation no banco, não enfeite
 * de formulário). O que este módulo faz é o espelho ergonômico: recusar ANTES do round-trip
 * com a mesma régua — e nunca, jamais, mandar string vazia "para passar".
 */

export type EventoTarefaConstruido =
  | { ok: true; tipo: string; payload: Record<string, unknown> }
  | { ok: false; motivo: string };

/** tarefa_reatribuida{tarefa_id, responsavel_id} — alguém passa a tarefa adiante. */
export function construirReatribuicao(
  tarefaId: string,
  responsavelId: string,
): EventoTarefaConstruido {
  if (!tarefaId) return { ok: false, motivo: "tarefa sem id — recarregue a lista" };
  if (!responsavelId.trim()) return { ok: false, motivo: "escolha o novo responsável" };
  return {
    ok: true,
    tipo: "tarefa_reatribuida",
    payload: { tarefa_id: tarefaId, responsavel_id: responsavelId.trim() },
  };
}

/**
 * tarefa_prazo_repactuado{tarefa_id, prazo, motivo} — adiar vira REGISTRO, não silêncio
 * (spec §10.1: o silêncio é exatamente o que produziu 755 vencidas no Kommo).
 */
export function construirRepactuacao(
  tarefaId: string,
  prazoIso: string,
  motivo: string,
): EventoTarefaConstruido {
  if (!tarefaId) return { ok: false, motivo: "tarefa sem id — recarregue a lista" };
  const prazoMs = prazoIso ? new Date(prazoIso).getTime() : NaN;
  if (!Number.isFinite(prazoMs)) return { ok: false, motivo: "escolha o novo prazo (data e hora)" };
  const m = motivo.trim();
  if (!m) return { ok: false, motivo: "diga o motivo — adiar vira registro, não silêncio" };
  return {
    ok: true,
    tipo: "tarefa_prazo_repactuado",
    payload: { tarefa_id: tarefaId, prazo: new Date(prazoMs).toISOString(), motivo: m },
  };
}

/** tarefa_arquivada{tarefa_id, motivo} — sair da fila deixa rastro. */
export function construirArquivamento(tarefaId: string, motivo: string): EventoTarefaConstruido {
  if (!tarefaId) return { ok: false, motivo: "tarefa sem id — recarregue a lista" };
  const m = motivo.trim();
  if (!m) return { ok: false, motivo: "diga o motivo — sair da fila deixa rastro" };
  return {
    ok: true,
    tipo: "tarefa_arquivada",
    payload: { tarefa_id: tarefaId, motivo: m },
  };
}
