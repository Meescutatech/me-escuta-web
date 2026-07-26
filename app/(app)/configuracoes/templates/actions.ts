"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Ações da aba Configurações > Templates (SPEC-TEMPLATES-MENSAGENS §7).
 *
 * Tudo evento via porta `api.registrar_evento` — as guardas V1..V8 (papel admin/owner,
 * obrigatórios, atalho único entre ativos, corpo <= 4096) são validadas NO BANCO (0046);
 * a recusa volta como motivo legível e a UI mostra cru. Nenhum insert direto, nunca.
 *
 * Revalida /configuracoes/templates E /conversas: o menu `/` do composer lê a mesma lista.
 */

export interface ResultadoAcao {
  ok: boolean;
  motivo?: string;
}

async function registrarEventoTemplates(
  tipo: string,
  payload: Record<string, unknown>,
): Promise<ResultadoAcao> {
  const supabase = criarClienteServidor();
  const envelope = { tipo, id_externo: randomUUID(), versao_payload: 1, payload };
  const { error } = await supabase.schema("api").rpc("registrar_evento", { p: envelope });
  if (error) return { ok: false, motivo: error.message };
  revalidatePath("/configuracoes/templates");
  revalidatePath("/conversas");
  return { ok: true };
}

export async function criarTemplate(dados: {
  titulo: string;
  atalho: string;
  corpo: string;
}): Promise<ResultadoAcao> {
  return registrarEventoTemplates("template_criado", {
    titulo: dados.titulo.trim(),
    atalho: dados.atalho.trim(),
    corpo: dados.corpo,
  });
}

/** Patch parcial (>= 1 campo — V7); campo ausente preserva o vigente. */
export async function atualizarTemplate(
  templateId: string,
  patch: { titulo?: string; atalho?: string; corpo?: string },
): Promise<ResultadoAcao> {
  const payload: Record<string, unknown> = { template_id: templateId };
  if (patch.titulo !== undefined) payload.titulo = patch.titulo.trim();
  if (patch.atalho !== undefined) payload.atalho = patch.atalho.trim();
  if (patch.corpo !== undefined) payload.corpo = patch.corpo;
  return registrarEventoTemplates("template_atualizado", payload);
}

/** Arquivado é terminal (GO 10.4): sai do menu; recriar em vez de reativar. */
export async function arquivarTemplate(templateId: string, motivo?: string): Promise<ResultadoAcao> {
  const payload: Record<string, unknown> = { template_id: templateId };
  const m = motivo?.trim();
  if (m) payload.motivo = m;
  return registrarEventoTemplates("template_arquivado", payload);
}
