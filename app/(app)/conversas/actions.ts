"use server";

import { lerTemplatesHsmDoCanal } from "@/lib/dados/templates-hsm-do-canal";
import type { TemplateHsmNoChat } from "@/lib/conversas/template-hsm";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { registrarEventoUI, type ResultadoEvento } from "@/app/(app)/funil/actions";
import { caminhoValido } from "@/lib/conversas/midia";
import { montarPayloadProgramar } from "@/lib/conversas/envios-programados";
import { acaoPresencaValida, montarCorpoPresenca, type AcaoPresenca } from "@/lib/conversas/presenca";
import { lerConversas, type PaginaConversas } from "@/lib/dados/conversas";
import { lerEstadoEscopo } from "@/lib/dados/departamentos";

/**
 * F22 — próxima página do inbox (keyset). Leitura pura, mesma sessão/RLS do resto do app: o
 * cursor é opaco e revalidado no servidor, então cursor forjado não vira consulta sem filtro —
 * `decodificar` devolve null e a leitura recomeça do topo, que é degrade, não brecha.
 *
 * `jaCarregadas` vem do cliente porque é ele quem acumula; serve só para decidir se AINDA há
 * corte, nunca para escolher linha.
 *
 * M6/R18 — O ESCOPO ENTRA AQUI TAMBÉM, e esquecê-lo seria um vazamento de verdade, não de teoria:
 * a primeira página respeitaria o departamento ativo e a segunda traria o inbox inteiro. O escopo é
 * relido NO SERVIDOR a cada chamada, e de propósito não vem do cliente — o cliente pede "mais",
 * nunca "mais de qual escopo".
 */
export async function carregarMaisConversas(
  cursor: string,
  jaCarregadas: number,
): Promise<PaginaConversas> {
  const { escopo } = await lerEstadoEscopo();
  return lerConversas({ cursor, jaCarregadas, escopo });
}

/**
 * TRANSBORDO — Sara assume a conversa (Clara pausa) / devolve (Clara retoma).
 * Emite conversa_assumida/devolvida via porta. O projetor proj_conversa_posse seta
 * mode=HUMANO/IA e dono_atual (= ator forçado humano:<uid> quando não vier no payload).
 */
export async function assumirConversa(conversaId: string): Promise<ResultadoEvento> {
  // F6: registrarEventoUI só devolve ok:true depois de confirmar core.conversa.posse_posicao —
  // a posse é o dado que decide se a Clara volta a responder, e não pode ser declarada de boca.
  const r = await registrarEventoUI("conversa_assumida", { conversa_id: conversaId });
  if (r.ok) revalidatePath("/conversas");
  return r;
}

export async function devolverConversa(conversaId: string): Promise<ResultadoEvento> {
  const r = await registrarEventoUI("conversa_devolvida", { conversa_id: conversaId });
  if (r.ok) revalidatePath("/conversas");
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
  //
  // F6 — a spec da Fase 1 declarava esta escrita como EXCEÇÃO permanente ("a linha só nasce quando
  // o sender confirma"). Fui conferir no projetor vivo e não é o caso: `proj_mensagem_saida` insere
  // em core.mensagem na MESMA transação, com id = id do evento e status_entrega='na_fila'. Ou seja,
  // a escrita mais cara do app — mensagem para um paciente — É conferível, e agora é conferida.
  // O que continua sendo do sender é o `mensagem_enviada` (saiu de fato); a bolha segue em
  // "aguardando" até lá, que é o comportamento honesto e já era o de hoje.
  const r = await registrarEventoUI("enviar_mensagem_humana", payload, undefined, chaveIdem);
  if (r.ok) revalidatePath("/conversas");
  return r;
}

/**
 * MANDAR UM TEMPLATE HSM (RF-5 · 14/09).
 *
 * ── Por que é uma action própria, e não `enviarMensagem` com um campo a mais ──────────────────
 * `enviar_mensagem_humana` leva TEXTO. O template não: leva `template_id` + `parametros`
 * posicionais, e quem monta o corpo é o sender, a partir da `definicao` que a Meta aprovou. Se a
 * tela mandasse o texto montado como mensagem comum, a Meta recusaria fora da janela de 24h — que
 * é exatamente o caso em que o template existe para servir (354 das 373 conversas, medido em 14/09).
 *
 * ── A guarda, e onde ela mora ─────────────────────────────────────────────────────────────────
 * `porta.validar_evento_template_envio`, chamada de `porta.inserir_evento` — não da `api`. Isso
 * importa: a porta é o caminho comum do web E do runtime, então a guarda vale para os dois. Ela
 * confere que o template existe, que a conversa existe, que a conversa tem canal resolvido, e que
 * o template é DO MESMO CANAL da conversa. Nada disso é reimplementado aqui: a tela filtra pelo
 * canal para não OFERECER o que seria recusado, mas quem recusa é o banco.
 *
 * ── `parametros` vai como array, e a ordem é o contrato ───────────────────────────────────────
 * Posicional e contíguo: o índice é a posição menos um. Quem monta é `armarTemplate`
 * (`lib/conversas/template-hsm.ts`), que devolve o array inteiro com `""` nas lacunas — e a tela
 * trava o envio enquanto houver lacuna. Mandar um array "compactado", sem os vazios, deslocaria
 * todos os seguintes e a mensagem sairia com a data no lugar do nome.
 */
/**
 * Os HSM aprovados do canal DESTA conversa, sob demanda.
 *
 * Por que não vem como prop da página: a lista depende do canal da conversa SELECIONADA, que muda
 * no cliente. Mandar os 318 de todos os canais no primeiro carregamento seria pagar ~100 KB por
 * uma tela que quase sempre usa um canal só. Na prática são dois canais, então isto busca no
 * máximo duas vezes por sessão — o inbox guarda o que já leu.
 */
export async function lerTemplatesDoCanal(canalId: string | null): Promise<TemplateHsmNoChat[]> {
  return lerTemplatesHsmDoCanal(canalId);
}

export async function enviarTemplateHumano(
  conversaId: string,
  templateId: string,
  parametros: string[],
  chaveIdem?: string,
): Promise<ResultadoEvento> {
  if (!conversaId.trim()) return { ok: false, motivo: "conversa não informada" };
  if (!templateId.trim()) return { ok: false, motivo: "template não informado" };
  // A trava de lacuna vale aqui também, e não só na tela: botão desabilitado é conforto visual —
  // não impede Enter, não impede submit programático, e some num refactor.
  const vazia = parametros.findIndex((v) => (v ?? "").trim() === "");
  if (vazia >= 0) {
    return { ok: false, motivo: `a variável {{${vazia + 1}}} está vazia — o template sai como está escrito` };
  }
  const r = await registrarEventoUI(
    "enviar_template_humano",
    { conversa_id: conversaId, template_id: templateId, parametros },
    undefined,
    chaveIdem,
  );
  if (r.ok) revalidatePath("/conversas");
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

/**
 * R27/F1 — PROGRAMAR ENVIO (pedido nº 1 da Sarah). Emite `envio_programado` (0290); a projeção
 * nasce `agendado` e o runtime (worker envio-programado) grava o `enviar_mensagem_humana` na hora,
 * com o ator de quem programou — o mesmo caminho do botão "Enviar". `enviar_em` chega em ISO; a
 * porta recusa hora que já passou e conversa que não existe. A janela de 24h NÃO trava aqui: ela
 * pode reabrir até lá; se não reabrir, a linha volta como `falhou` e a tela mostra o motivo.
 */
export async function programarEnvio(
  conversaId: string,
  leadId: string | null,
  corpo: string,
  quandoMs: number,
): Promise<ResultadoEvento> {
  const montado = montarPayloadProgramar({
    conversaId,
    leadId,
    corpo,
    quandoMs,
    agoraMs: Date.now(),
  });
  if (!montado.ok) return { ok: false, motivo: montado.motivo };
  const r = await registrarEventoUI("envio_programado", montado.payload, leadId ?? undefined);
  if (r.ok) revalidatePath("/conversas");
  return r;
}

/** Cancela um envio ainda `agendado` — a porta recusa qualquer outro estado (0290). */
export async function cancelarEnvioProgramado(envioProgramadoId: string): Promise<ResultadoEvento> {
  if (!envioProgramadoId) return { ok: false, motivo: "envio inválido" };
  const r = await registrarEventoUI("envio_programado_cancelado", {
    envio_programado_id: envioProgramadoId,
  });
  if (r.ok) revalidatePath("/conversas");
  return r;
}
