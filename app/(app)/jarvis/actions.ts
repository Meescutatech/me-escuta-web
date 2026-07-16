"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

export interface PropostaJarvis {
  sugestao_id: string;
  agente_alvo: string;
  versao_base: number;
  diagnostico: string;
  trecho_antigo: string;
  trecho_novo: string;
  justificativa: string;
}

export type ResultadoAvaliar = { ok: true; proposta: PropostaJarvis } | { ok: false; motivo: string };

/**
 * @jarvis (item 10) — pede ao motor do Jarvis (Edge Function jarvis-avaliar, que chama a Anthropic
 * com a persona do agente jarvis) uma melhoria no prompt de um agente. A function propõe via
 * api.propor_atualizacao_prompt → core.sugestao_ia pendente (agente='jarvis'). HITL intacto: a
 * aprovação abaixo é humana. Front↔Supabase apenas (sem bridge). TODO(spec): pós-MVP migra pro worker.
 */
export async function avaliarJarvis(pedido: string): Promise<ResultadoAvaliar> {
  const texto = pedido.trim();
  if (!texto) return { ok: false, motivo: "Escreva o que quer melhorar." };

  const supabase = criarClienteServidor();
  const { data, error } = await supabase.functions.invoke("jarvis-avaliar", {
    body: { pedido: texto, agente_alvo: "clara" },
  });
  if (error) {
    // erros de negócio da function vêm no corpo (422/400) — tenta extrair a mensagem
    const ctx = (error as any)?.context;
    let motivo = error.message;
    try {
      if (ctx && typeof ctx.json === "function") motivo = (await ctx.json())?.error ?? motivo;
    } catch {
      /* mantém motivo */
    }
    return { ok: false, motivo };
  }
  if ((data as any)?.error) return { ok: false, motivo: (data as any).error };
  return { ok: true, proposta: data as PropostaJarvis };
}

/** Aprova/rejeita a proposta de prompt (RPC-porta). Aprovar → prompt_atualizado + agente sobe de versão. */
export async function validarPrompt(
  sugestaoId: string,
  decisao: "aprovada" | "rejeitada",
): Promise<{ ok: boolean; versaoNova?: number; motivo?: string }> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase.schema("api").rpc("validar_sugestao", {
    p_sugestao_id: sugestaoId,
    p_decisao: decisao,
    p_payload_aprovado: null,
  });
  if (error) return { ok: false, motivo: error.message };
  revalidatePath("/timeline");
  revalidatePath("/fila");
  return { ok: true, versaoNova: (data as any)?.versao_nova };
}
