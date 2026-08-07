"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { confirmarProjecao, type RespostaRegistrarEvento } from "@/lib/eventos/confirmar-projecao";

export interface ResultadoEvento {
  ok: boolean;
  motivo?: string;
  /**
   * true = a porta absorveu por idempotência (mesma `id_externo`). É SUCESSO, não falha — mas
   * sucesso distinguível: nada novo foi gravado, e a projeção vigente é a do evento original.
   * Quem trata "salvei" e "já estava salvo" igual está mentindo por omissão.
   */
  duplicado?: boolean;
}

/**
 * ÚNICO caminho de escrita da UI: a porta `api.registrar_evento(p jsonb)` (param = `p`).
 * Envelope EXATO (verificado no corpo da função no remoto):
 *   { tipo, id_externo:<uuid v4 novo por ação>, versao_payload:1, lead_id?, payload:{...} }
 * A porta FORÇA ator=`humano:<uid>` + origem=ui — NÃO enviar. Idempotência por (origem, id_externo).
 *
 * TODO(spec) D9 — formato de ator diverge entre RPCs da porta: registrar_evento carimba
 * `humano:<uid>` (auth.uid), enquanto propor/validar_sugestao usam `humano:<email>` (auth.jwt.email).
 * Ex.: enviar_mensagem_humana → humano:<uid>; prompt_atualizado → humano:<email>. Unificar pós-MVP
 * (dono do laço = Agent 2). Cosmético; não afeta a demo.
 */
export async function registrarEventoUI(
  tipo: string,
  payload: Record<string, unknown>,
  leadId?: string,
  idExterno?: string,
): Promise<ResultadoEvento> {
  const supabase = criarClienteServidor();
  const envelope: Record<string, unknown> = {
    tipo,
    // idExterno estável (ex.: id da bolha otimista) ⇒ retry da MESMA ação cai no dedupe
    // UNIQUE(origem,id_externo) da porta em vez de gravar evento novo. Ausente ⇒ uuid por ação.
    id_externo: idExterno ?? randomUUID(),
    versao_payload: 1,
    payload,
  };
  if (leadId) envelope.lead_id = leadId;

  const { data, error } = await supabase.schema("api").rpc("registrar_evento", { p: envelope });
  if (error) return { ok: false, motivo: error.message };

  // F6 — o corpo da resposta era JOGADO FORA aqui, e com ele a única prova de que a escrita virou
  // dado. Verificado por execução: reenviar a mesma id_externo com texto diferente devolve
  // {"duplicado":true}, o texto novo some, e a tela dizia que salvou.
  const resposta = (data ?? null) as RespostaRegistrarEvento | null;
  const conferido = await confirmarProjecao(supabase, tipo, payload, resposta);
  if (!conferido.ok) return conferido;

  revalidatePath("/funil");
  revalidatePath("/timeline");
  return { ok: true, ...(resposta?.duplicado ? { duplicado: true } : {}) };
}

/**
 * Atribui/remove o responsável do lead (0060): emite dono_atribuido {lead_id, dono_id}.
 * A chave dono_id vai SEMPRE no payload — null é remoção EXPLÍCITA (a porta recusa ausência).
 */
export async function atribuirDono(leadId: string, donoId: string | null): Promise<ResultadoEvento> {
  return registrarEventoUI("dono_atribuido", { lead_id: leadId, dono_id: donoId }, leadId);
}

/**
 * Açúcar do arrastar-card: emite etapa_alterada no shape do contrato.
 *
 * R20 — `motivo` só existe na saída para etapa de tipo `perdido`, e vai no MESMO evento, não num
 * evento seguinte: perder o lead e dizer por quê é um ato só. Dois eventos criariam a janela em que
 * o lead está perdido sem motivo, que é exatamente o estado que o campo existe para impedir.
 */
export async function moverCardEtapa(
  leadId: string,
  etapaDe: string,
  etapaPara: string,
  motivo?: { chave: string; detalhe?: string },
): Promise<ResultadoEvento> {
  const payload: Record<string, unknown> = {
    lead_id: leadId,
    etapa_de: etapaDe,
    etapa_para: etapaPara,
  };
  if (motivo?.chave) {
    payload.motivo_perda = motivo.chave;
    if (motivo.detalhe?.trim()) payload.motivo_detalhe = motivo.detalhe.trim();
  }
  return registrarEventoUI("etapa_alterada", payload, leadId);
}

/** Campos do lead criado à mão. Só `nome` é obrigatório — telefone entra depois, pela ficha. */
export interface NovoLead {
  nome: string;
  telefone?: string;
  origem?: string;
  etapa: string;
  /** uuid de core.usuario — quem fica com o lead. Ausente = sem dono (a faixa de alarme acusa). */
  donoId?: string | null;
}

/**
 * R20 · CRIAR LEAD À MÃO — o ato que faltava para isto ser um sistema e não um receptor de WhatsApp.
 *
 * Quem chega por ligação, indicação ou pela mão da fono não tem conversa de WhatsApp para nascer
 * de, e hoje simplesmente não existe no board (medido no gap: A6 = NÃO TEM).
 *
 * O `lead_id` é gerado AQUI e vai no envelope: `proj_lead` usa o lead_id do evento como chave da
 * projeção. O `id_externo` é o MESMO uuid — assim o duplo-clique no botão cai no dedupe da porta
 * (UNIQUE(origem,id_externo)) em vez de criar dois leads iguais, que é o defeito clássico desta tela.
 */
export async function criarLeadManual(dados: NovoLead): Promise<ResultadoEvento & { leadId?: string }> {
  const nome = dados.nome.trim();
  if (!nome) return { ok: false, motivo: "Nome é obrigatório." };

  const leadId = randomUUID();
  const payload: Record<string, unknown> = { lead_id: leadId, nome, etapa: dados.etapa };
  const tel = dados.telefone?.trim();
  if (tel) payload.telefone = tel;
  // origem fica sob vocabulário da config de captação; 'manual' é o valor honesto para quem foi
  // digitado por uma pessoa — nunca herdar 'meta'/'wa' de um lead que não veio de canal nenhum.
  payload.origem = dados.origem?.trim() || "manual";
  if (dados.donoId) payload.dono_id = dados.donoId;

  const res = await registrarEventoUI("lead_criado", payload, leadId, leadId);
  return res.ok ? { ...res, leadId } : res;
}
