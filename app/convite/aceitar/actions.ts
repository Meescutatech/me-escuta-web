"use server";

/**
 * Aceite público de convite (Bloco C). O front NUNCA fala com o banco aqui — tudo via
 * runtime (VPS), que valida o token (hash sha256), cria o usuário no Auth (service_role
 * só lá) e grava convite_aceito pela porta. Server actions para não expor a URL do
 * runtime nem depender de CORS.
 */

const CONVITES_URL = (process.env.CONVITES_URL ?? "http://localhost:8082").replace(/\/+$/, "");

export interface ConviteValidado {
  valido: boolean;
  motivo?: string;
  email_mascarado?: string;
  papel?: string;
  funcao?: string;
}

export async function validarConvite(token: string): Promise<ConviteValidado> {
  try {
    const resp = await fetch(`${CONVITES_URL}/convites/validar?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    const json = (await resp.json().catch(() => ({}))) as ConviteValidado;
    if (!resp.ok) return { valido: false, motivo: "token_ausente" };
    return json;
  } catch {
    return { valido: false, motivo: "runtime_fora_do_ar" };
  }
}

export interface ResultadoAceite {
  ok: boolean;
  motivo?: string;
}

export async function aceitarConviteAction(p: {
  token: string;
  email: string;
  nome: string;
  senha: string;
}): Promise<ResultadoAceite> {
  try {
    const resp = await fetch(`${CONVITES_URL}/convites/aceitar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p),
      cache: "no-store",
    });
    const json = (await resp.json().catch(() => ({}))) as { erro?: string };
    if (!resp.ok) return { ok: false, motivo: json.erro ?? `falha (${resp.status})` };
    return { ok: true };
  } catch {
    return { ok: false, motivo: "runtime de convites fora do ar — tente de novo" };
  }
}
