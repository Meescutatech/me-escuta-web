"use server";

import { revalidatePath } from "next/cache";
import { registrarEventoUI, type ResultadoEvento } from "@/app/(app)/funil/actions";
import { criarClienteServidor } from "@/lib/supabase/server";

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

/**
 * W-D5 (10/09) · PROPOSTA DE TAREFA DO JARVIS — aceitar · ajustar · descartar (benchmark §4 item 9).
 *
 * A mesma porta de toda sugestão (`api.validar_sugestao`, como app/(app)/fila/actions.ts e
 * conversas/actions.ts), com o `p_payload_aprovado` que a fila não usa: é por ele que o AJUSTE
 * entra — os campos editados + `ajustada_de: sugestao_id` (lib/tarefas/propostas.ts). Sem
 * ajuste o payload vai `null` e a porta aplica o que o Jarvis propôs.
 *
 * ⚠️ [E] do benchmark, ainda não provado: que o validador da porta honra `p_payload_aprovado`
 * para sugestão de TIPO tarefa (para mensagem, honra — inbox edita e envia). Enquanto isso não
 * for exercido contra o banco, "Ajustar" em produção é hipótese, não feature. A tela de ensaio
 * não passa por aqui.
 */
export async function validarPropostaTarefa(
  sugestaoId: string,
  decisao: "aprovada" | "rejeitada",
  payloadAjustado: Record<string, unknown> | null = null,
): Promise<ResultadoEvento> {
  if (!sugestaoId) return { ok: false, motivo: "proposta sem id — recarregue a lista" };
  const supabase = criarClienteServidor();
  const { error } = await supabase.schema("api").rpc("validar_sugestao", {
    p_sugestao_id: sugestaoId,
    p_decisao: decisao,
    p_payload_aprovado: decisao === "aprovada" ? payloadAjustado : null,
  });
  if (error) return { ok: false, motivo: error.message };
  revalidar();
  revalidatePath("/fila");
  return { ok: true };
}
