"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

export interface ResultadoEvento {
  ok: boolean;
  motivo?: string;
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
): Promise<ResultadoEvento> {
  const supabase = criarClienteServidor();
  const envelope: Record<string, unknown> = {
    tipo,
    id_externo: randomUUID(),
    versao_payload: 1,
    payload,
  };
  if (leadId) envelope.lead_id = leadId;

  const { error } = await supabase.schema("api").rpc("registrar_evento", { p: envelope });
  if (error) return { ok: false, motivo: error.message };

  revalidatePath("/funil");
  revalidatePath("/timeline");
  return { ok: true };
}

/** Açúcar do arrastar-card: emite etapa_alterada no shape do contrato. */
export async function moverCardEtapa(
  leadId: string,
  etapaDe: string,
  etapaPara: string,
): Promise<ResultadoEvento> {
  return registrarEventoUI(
    "etapa_alterada",
    { lead_id: leadId, etapa_de: etapaDe, etapa_para: etapaPara },
    leadId,
  );
}
