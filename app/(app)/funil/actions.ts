"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

export interface ResultadoEvento {
  ok: boolean;
  motivo?: string;
}

/**
 * ÚNICO caminho de escrita da UI para o funil: a porta `api.registrar_evento(jsonb)`.
 * A porta carimba ator=`humano:<uid>` + origem=ui e o projetor materializa na mesma transação
 * (CONTRATO-EVENTOS-MVP). Nada de UPDATE direto em projeção.
 *
 * Assinatura esperada (publicada p/ Trilha B — Agent 2): api.registrar_evento(p_evento jsonb)
 * onde p_evento = { tipo, payload }. Se a função ainda não existe (0009 pendente), devolve
 * ok=false com o motivo — o board em modo mock nem chama isto (move só otimista). TODO(spec).
 */
export async function registrarEventoUI(
  tipo: string,
  payload: Record<string, unknown>,
): Promise<ResultadoEvento> {
  const supabase = criarClienteServidor();
  const { error } = await supabase.schema("api").rpc("registrar_evento", {
    p_evento: { tipo, payload },
  });
  if (error) return { ok: false, motivo: error.message };

  revalidatePath("/funil");
  revalidatePath("/timeline");
  return { ok: true };
}

/** Açúcar p/ o arrastar-card: emite etapa_alterada no shape do contrato. */
export async function moverCardEtapa(
  leadId: string,
  etapaDe: string,
  etapaPara: string,
): Promise<ResultadoEvento> {
  return registrarEventoUI("etapa_alterada", {
    lead_id: leadId,
    etapa_de: etapaDe,
    etapa_para: etapaPara,
  });
}
