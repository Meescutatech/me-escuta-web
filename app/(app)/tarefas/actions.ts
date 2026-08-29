"use server";

import { revalidatePath } from "next/cache";
import { registrarEventoUI, type ResultadoEvento } from "@/app/(app)/funil/actions";

/**
 * Ações do QUADRO POR STATUS (F8 · 0305). Toda escrita passa por `api.registrar_evento` — a
 * mesma porta de tudo — e volta pela conferência de projeção (lib/eventos/confirmar-projecao.ts).
 *
 * Contratos (0305):
 *   tarefa_iniciada {tarefa_id}          — só pendente e ainda não iniciada (55000 se já estiver)
 *   tarefa_reaberta {tarefa_id, motivo?} — concluída ou em andamento → A fazer; arquivada recusa
 * Concluir NÃO mora aqui: é `concluirTarefaLead` / `concluirTarefaNotificacao`, com resultado
 * obrigatório, e o quadro reaproveita o painel que já existe.
 *
 * O `leadId` ancora o evento no ledger do lead quando há; sem ele a porta acha a tarefa pelo id.
 */
function revalidar() {
  revalidatePath("/tarefas");
  revalidatePath("/notificacoes");
}

export async function iniciarTarefa(tarefaId: string, leadId: string | null): Promise<ResultadoEvento> {
  if (!tarefaId) return { ok: false, motivo: "tarefa sem id — recarregue a lista" };
  const r = await registrarEventoUI("tarefa_iniciada", { tarefa_id: tarefaId }, leadId ?? undefined);
  if (r.ok) revalidar();
  return r;
}

export async function reabrirTarefa(
  tarefaId: string,
  leadId: string | null,
  motivo?: string,
): Promise<ResultadoEvento> {
  if (!tarefaId) return { ok: false, motivo: "tarefa sem id — recarregue a lista" };
  const payload: Record<string, unknown> = { tarefa_id: tarefaId };
  const m = motivo?.trim();
  if (m) payload.motivo = m;
  const r = await registrarEventoUI("tarefa_reaberta", payload, leadId ?? undefined);
  if (r.ok) revalidar();
  return r;
}
