"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { registrarEventoUI, type ResultadoEvento } from "@/app/(app)/funil/actions";
import { caminhoValido } from "@/lib/conversas/midia";
import { acaoPresencaValida, montarCorpoPresenca, type AcaoPresenca } from "@/lib/conversas/presenca";

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
  midia?: { caminho: string; mime?: string | null },
  templateId?: string,
): Promise<ResultadoEvento> {
  const texto = corpo.trim();
  if (!texto && !midia) return { ok: false, motivo: "mensagem vazia" };
  // Payload estendido da rodada 6 (D4): {conversa_id, corpo?, midia_caminho?, midia_mime?} —
  // corpo = legenda quando houver mídia. Texto puro segue emitindo o shape idêntico ao de antes.
  // template_id (SPEC-TEMPLATES §6.4): rastro de "partiu deste template" — a porta ignora o
  // campo, o ledger preserva; NENHUM caminho novo de envio, métrica de adoção por SQL.
  const payload: Record<string, unknown> = { conversa_id: conversaId };
  if (texto) payload.corpo = texto;
  if (templateId) payload.template_id = templateId;
  if (midia) {
    const caminho = midia.caminho.trim();
    // o front só sobe em saida/ (D5); qualquer outro caminho aqui é bug ou request forjado
    if (!caminhoValido(caminho) || !caminho.startsWith("saida/")) {
      return { ok: false, motivo: "caminho de mídia inválido" };
    }
    payload.midia_caminho = caminho;
    if (midia.mime) payload.midia_mime = midia.mime;
  }
  // chaveIdem = id da bolha otimista: "Tentar de novo" da mesma bolha reusa a chave e o dedupe da
  // porta absorve (se a 1ª chamada gravou mas a resposta se perdeu, não sai duplicado no WhatsApp).
  const r = await registrarEventoUI("enviar_mensagem_humana", payload, undefined, chaveIdem);
  revalidatePath("/conversas");
  return r;
}

/**
 * PRESENÇA (Rodada 11 — Bloco B): repassa "lida" (Sara abriu a conversa) ou "digitando" (Sara
 * digitando no composer) pra rota interna POST /presenca do RUNTIME — só ele tem o token da Graph
 * e resolve o wamid da última recebida. BEST-EFFORT por contrato: NUNCA lança, nunca revalida
 * rota, nunca vira erro pro operador; sem RUNTIME_PRESENCA_URL/TOKEN é no-op silencioso (o
 * sender ainda marca lida antes de cada resposta — degrade honesto).
 */
export async function sinalizarPresenca(
  conversaId: string,
  acao: AcaoPresenca,
): Promise<{ ok: boolean; motivo?: string }> {
  const url = process.env.RUNTIME_PRESENCA_URL;
  const token = process.env.RUNTIME_PRESENCA_TOKEN;
  if (!url || !token) return { ok: false, motivo: "presença desligada (sem RUNTIME_PRESENCA_URL/TOKEN)" };
  if (!conversaId || !acaoPresencaValida(acao)) return { ok: false, motivo: "pedido inválido" };
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: montarCorpoPresenca(conversaId, acao),
      // presença é cosmética: teto curto pra nunca segurar a UI atrás de action pendente
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!resp.ok) return { ok: false, motivo: `runtime respondeu ${resp.status}` };
    const corpo = (await resp.json()) as { ok?: boolean; motivo?: string };
    return { ok: corpo.ok === true, ...(corpo.motivo ? { motivo: corpo.motivo } : {}) };
  } catch (err) {
    return { ok: false, motivo: String(err) };
  }
}

export interface ResultadoUrlMidia {
  ok: boolean;
  url?: string;
  motivo?: string;
}

/**
 * Signed URL (~60 min) pra QUALQUER mídia no bucket PRIVADO 'midia-whatsapp' (generalização do
 * obterUrlAudio da rodada 5 — mesma mecânica, agora serve áudio E imagem, in e out). Roda no
 * servidor com o cliente de SESSÃO (anon key + JWT do operador logado) — nenhuma service key
 * chega perto do client; o acesso ao objeto é decidido pelo RLS do Storage (política de leitura
 * pra authenticated no bucket). Sem política ou sem objeto, retorna ok=false e a bolha degrada.
 */
export async function obterUrlMidia(caminho: string): Promise<ResultadoUrlMidia> {
  if (!caminhoValido(caminho)) return { ok: false, motivo: "caminho inválido" };
  const supabase = criarClienteServidor();
  const { data, error } = await supabase.storage
    .from("midia-whatsapp")
    .createSignedUrl(caminho.trim(), 3600);
  if (error || !data?.signedUrl) return { ok: false, motivo: error?.message ?? "sem URL" };
  return { ok: true, url: data.signedUrl };
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
