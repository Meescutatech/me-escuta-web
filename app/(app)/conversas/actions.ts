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
 * Envio humano (modo HUMANO, após transbordo). Shape do CONTRATO §Envio HUMANO (Agent 2, 0016):
 * emite `enviar_mensagem_humana` com payload {conversa_id, corpo} — SÓ isso; a porta deriva
 * telefone/phone_number_id do conversa_id e enfileira em fila_saida → sender (Agent 1) envia →
 * o sender projeta `mensagem_enviada` quando a msg SAIR de fato (a UI NÃO emite mensagem_enviada,
 * pra não "mentir"). O envio real só sai com o access token do Diogo; sem token, a bolha fica
 * "aguardando". Idempotência (dedup_id) casada com o Agent 1.
 */
export async function enviarMensagem(
  conversaId: string,
  corpo: string,
  chaveIdem?: string,
): Promise<ResultadoEvento> {
  const texto = corpo.trim();
  if (!texto) return { ok: false, motivo: "mensagem vazia" };
  // chaveIdem = id da bolha otimista: "Tentar de novo" da mesma bolha reusa a chave e o dedupe da
  // porta absorve (se a 1ª chamada gravou mas a resposta se perdeu, não sai duplicado no WhatsApp).
  const r = await registrarEventoUI(
    "enviar_mensagem_humana",
    { conversa_id: conversaId, corpo: texto },
    undefined,
    chaveIdem,
  );
  revalidatePath("/conversas");
  return r;
}

/**
 * Aprova/edita/rejeita a proposta de resposta da Clara (sugestao_ia tipo='enviar_mensagem') via a
 * RPC-porta api.validar_sugestao. Aprovar/editar → projetor empurra pra fila_saida → sender (A) envia.
 * Editar = decisão 'corrigida' com o payload corrigido (a porta usa payload_aprovado no lugar do proposto).
 */
export async function validarSugestaoMensagem(
  sugestaoId: string,
  decisao: "aprovada" | "rejeitada" | "corrigida",
  payloadAprovado?: Record<string, unknown> | null,
): Promise<ResultadoEvento> {
  const supabase = criarClienteServidor();
  const { error } = await supabase.schema("api").rpc("validar_sugestao", {
    p_sugestao_id: sugestaoId,
    p_decisao: decisao,
    p_payload_aprovado: decisao === "corrigida" ? (payloadAprovado ?? null) : null,
  });
  if (error) return { ok: false, motivo: error.message };
  revalidatePath("/conversas");
  revalidatePath("/timeline");
  return { ok: true };
}
