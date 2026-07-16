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
 * Envio humano (modo HUMANO, após transbordo). Emite mensagem_enviada → proj_mensagem_saida
 * projeta a bolha de saída no ledger. OBS p/ Agent 1: a entrega REAL no WhatsApp exige enfileirar
 * em fila_saida (sender). Aqui a bolha nasce de evento; casar o enfileiramento do envio humano
 * com a borda é coordenação Trilha A. TODO(coordenar-envio-humano).
 */
export async function enviarMensagem(conversaId: string, corpo: string): Promise<ResultadoEvento> {
  const texto = corpo.trim();
  if (!texto) return { ok: false, motivo: "mensagem vazia" };
  const r = await registrarEventoUI("mensagem_enviada", {
    conversa_id: conversaId,
    corpo: texto,
    tipo_conteudo: "texto",
  });
  revalidatePath("/conversas");
  return r;
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
