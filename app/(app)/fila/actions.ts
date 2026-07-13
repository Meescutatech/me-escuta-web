"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Valida uma sugestão (aprovar/rejeitar) — o ÚNICO caminho de escrita da UI é a RPC-porta
 * `api.validar_sugestao` (schema `api`), que delega para `porta.validar_sugestao` e resolve o
 * validador pelo JWT. A UI não tem caminho próprio de escrita (RF-7). Aprovar cria evento hitl.
 */
export async function validarSugestao(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const decisao = String(formData.get("decisao") ?? "");
  if (!id || (decisao !== "aprovada" && decisao !== "rejeitada")) {
    throw new Error("Parâmetros inválidos para validar_sugestao.");
  }

  const supabase = criarClienteServidor();
  const { error } = await supabase.schema("api").rpc("validar_sugestao", {
    p_sugestao_id: id,
    p_decisao: decisao,
    p_payload_aprovado: null,
  });
  if (error) throw new Error(`Falha ao validar sugestão: ${error.message}`);

  revalidatePath("/fila");
  revalidatePath("/timeline");
}
