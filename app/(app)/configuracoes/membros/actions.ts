"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Ações da aba Configurações > Membros (Bloco C).
 *
 * Governança (papel/funcao/revogar/reativar): evento via porta `api.registrar_evento` —
 * a matriz §3 é validada NO BANCO (0035); recusa volta como motivo legível.
 *
 * Convites: o runtime (VPS) é quem gera token + grava hash + monta o link (service_role
 * só lá). A chamada vai SERVER-SIDE com o access token do gestor (Bearer) — o runtime
 * valida o JWT no Auth e a porta re-checa o papel. V1 = convite por LINK (decisão 22/07;
 * email fica atrás da flag de config `convite.envio_email_ativo`, desligada).
 */

export interface ResultadoAcao {
  ok: boolean;
  motivo?: string;
}

export interface ResultadoConvite extends ResultadoAcao {
  url?: string;
  convite_id?: string;
  expira_em?: string;
}

const CONVITES_URL = (process.env.CONVITES_URL ?? "http://localhost:8082").replace(/\/+$/, "");

async function registrarEventoMembros(
  tipo: string,
  payload: Record<string, unknown>,
): Promise<ResultadoAcao> {
  const supabase = criarClienteServidor();
  const envelope = { tipo, id_externo: randomUUID(), versao_payload: 1, payload };
  const { error } = await supabase.schema("api").rpc("registrar_evento", { p: envelope });
  if (error) return { ok: false, motivo: error.message };
  revalidatePath("/configuracoes/membros");
  return { ok: true };
}

export async function mudarPapel(usuarioId: string, papelDe: string, papelPara: string): Promise<ResultadoAcao> {
  return registrarEventoMembros("papel_alterado", {
    usuario_id: usuarioId,
    papel_de: papelDe,
    papel_para: papelPara,
  });
}

export async function mudarFuncao(usuarioId: string, funcaoDe: string | null, funcaoPara: string): Promise<ResultadoAcao> {
  return registrarEventoMembros("funcao_alterada", {
    usuario_id: usuarioId,
    funcao_de: funcaoDe,
    funcao_para: funcaoPara,
  });
}

export async function revogarAcesso(usuarioId: string): Promise<ResultadoAcao> {
  return registrarEventoMembros("acesso_revogado", { usuario_id: usuarioId });
}

export async function reativarAcesso(usuarioId: string): Promise<ResultadoAcao> {
  return registrarEventoMembros("acesso_reativado", { usuario_id: usuarioId });
}

/** Bearer do gestor logado (o runtime valida no Auth; nunca expomos service_role aqui). */
async function tokenDoGestor(): Promise<string | null> {
  const supabase = criarClienteServidor();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function chamarConvites(caminho: string, corpo: Record<string, unknown>): Promise<ResultadoConvite> {
  const token = await tokenDoGestor();
  if (!token) return { ok: false, motivo: "sessão expirada — entre de novo" };
  try {
    const resp = await fetch(`${CONVITES_URL}${caminho}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(corpo),
      cache: "no-store",
    });
    const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
    if (!resp.ok) {
      return { ok: false, motivo: typeof json.erro === "string" ? json.erro : `falha (${resp.status})` };
    }
    revalidatePath("/configuracoes/membros");
    return {
      ok: true,
      url: typeof json.url === "string" ? json.url : undefined,
      convite_id: typeof json.convite_id === "string" ? json.convite_id : undefined,
      expira_em: typeof json.expira_em === "string" ? json.expira_em : undefined,
    };
  } catch {
    return { ok: false, motivo: "runtime de convites fora do ar — tente de novo" };
  }
}

/** Gera o convite por LINK (caminho único da V1) e devolve a URL de aceite pra copiar. */
export async function gerarLinkConvite(email: string, papel: "admin" | "membro"): Promise<ResultadoConvite> {
  return chamarConvites("/admin/convites", { email, papel, canal: "link" });
}

/** Reenviar = gerar link NOVO (o antigo morre no ato — spec §4.3). */
export async function reenviarConvite(conviteId: string): Promise<ResultadoConvite> {
  return chamarConvites("/admin/convites/reenviar", { convite_id: conviteId });
}

export async function revogarConvite(conviteId: string): Promise<ResultadoConvite> {
  return chamarConvites("/admin/convites/revogar", { convite_id: conviteId });
}
