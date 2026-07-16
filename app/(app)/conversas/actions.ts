"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { registrarEventoUI, type ResultadoEvento } from "@/app/(app)/funil/actions";

/**
 * TRANSBORDO — Sara assume a conversa (Clara pausa) / devolve (Clara retoma).
 * Emite conversa_assumida/devolvida via porta. O projetor proj_conversa_posse seta
 * mode=HUMANO/IA e dono_atual (= ator forçado humano:<uid> quando não vier no payload).
 */
export async function assumirConversa(conversaId: string): Promise<ResultadoEvento> {
  const r = await registrarEventoUI("conversa_assumida", { conversa_id: conversaId });
  revalidatePath("/conversas");
  return r;
}

export async function devolverConversa(conversaId: string): Promise<ResultadoEvento> {
  const r = await registrarEventoUI("conversa_devolvida", { conversa_id: conversaId });
  revalidatePath("/conversas");
  return r;
}

/**
 * Envio humano (modo HUMANO, após transbordo). AINDA NÃO PERSISTE — de propósito.
 *
 * Decisão do Orquestrador (16/07): NÃO emitir `mensagem_enviada` direto pela UI — isso "mentiria"
 * (gravaria envio sem ter saído pelo WhatsApp). O caminho honesto (a definir pelo Agent 2, dono do
 * laço de saída) é um evento tipo `enviar_mensagem_humana` → fila_saida (sem HITL, Sara envia direto)
 * → sender (Agent 1) envia de verdade → aí sim `mensagem_enviada`. Envio real depende do access token
 * do Diogo. Enquanto o shape não é publicado no CONTRATO, o composer só mostra a bolha LOCAL como
 * pendente (não escreve no ledger). TODO(enviar-mensagem-humana): trocar por api.registrar_evento
 * com o tipo/shape confirmado.
 */
export async function enviarMensagem(_conversaId: string, corpo: string): Promise<ResultadoEvento> {
  const texto = corpo.trim();
  if (!texto) return { ok: false, motivo: "mensagem vazia" };
  // Sem persistência (ver nota acima). Sinaliza "pendente de envio" pra UI ser honesta.
  return { ok: false, motivo: "pendente_saida" };
}

/**
 * Aprova/rejeita a proposta de resposta da Clara (sugestao_ia tipo='enviar_mensagem') via a
 * RPC-porta api.validar_sugestao. Aprovar → projetor empurra pra fila_saida → sender (A) envia.
 */
export async function validarSugestaoMensagem(
  sugestaoId: string,
  decisao: "aprovada" | "rejeitada",
): Promise<ResultadoEvento> {
  const supabase = criarClienteServidor();
  const { error } = await supabase.schema("api").rpc("validar_sugestao", {
    p_sugestao_id: sugestaoId,
    p_decisao: decisao,
    p_payload_aprovado: null,
  });
  if (error) return { ok: false, motivo: error.message };
  revalidatePath("/conversas");
  revalidatePath("/timeline");
  return { ok: true };
}
