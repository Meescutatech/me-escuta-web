"use server";

/**
 * Aceite público de convite (Bloco C). O front NUNCA fala com o banco aqui — tudo via
 * runtime (VPS), que valida o token (hash sha256), cria o usuário no Auth (service_role
 * só lá) e grava convite_aceito pela porta. Server actions para não expor a URL do
 * runtime nem depender de CORS.
 */

import { randomUUID } from "crypto";
import { criarClienteServidor } from "@/lib/supabase/server";

const CONVITES_URL = (process.env.CONVITES_URL ?? "http://localhost:8082").replace(/\/+$/, "");

export interface ConviteValidado {
  valido: boolean;
  motivo?: string;
  /**
   * `true` = link de GRUPO (0342-0344): não há destinatário, e quem abre traz o próprio e-mail.
   * Muda o que a tela pode dizer — "confirme o e-mail do convite" é falso aqui, e o
   * `email_mascarado` viria a ser o marcador `@convite.invalid`, um endereço que não é de ninguém.
   * `undefined` num runtime antigo: a tela trata como nominal, que é o comportamento de sempre.
   */
  aberto?: boolean;
  email_mascarado?: string;
  papel?: string;
  /** chave do cargo (0338) — é o que a tela mostra, no lugar do papel técnico. */
  cargo?: string;
  departamentos?: { departamento: string; papel_no_departamento?: string; rotulo?: string | null }[];
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
  /**
   * `ok: true, entrou: false` = a conta FOI criada e o login automático não passou. É sucesso com
   * um passo a mais, não falha — e a tela tem de dizer isso, porque "não deu certo" faria a pessoa
   * tentar aceitar de novo um convite que ela já aceitou.
   */
  entrou?: boolean;
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

    /*
     * ENTRA DIRETO — o aceite acabou de criar a conta com ESTA senha, então pedir login em seguida
     * é pedir para digitar de novo o que a pessoa digitou há um segundo. Decisão do Diogo em 14/09
     * ("cai direto no funil").
     *
     * Falhar aqui NÃO desfaz o aceite: a conta existe e é válida. Por isso o desfecho é
     * `entrou: false` e a tela manda para o login com uma frase que diz a verdade — "sua conta foi
     * criada, entre com ela" — em vez de um erro que sugere que nada aconteceu.
     */
    const supabase = criarClienteServidor();
    const { error } = await supabase.auth.signInWithPassword({ email: p.email, password: p.senha });
    if (error) return { ok: true, entrou: false };

    await supabase
      .schema("api")
      .rpc("registrar_evento", {
        p: { tipo: "sessao_iniciada", id_externo: randomUUID(), versao_payload: 1, payload: { metodo: "convite" } },
      })
      .then(() => undefined, () => undefined);

    return { ok: true, entrou: true };
  } catch {
    return { ok: false, motivo: "runtime de convites fora do ar — tente de novo" };
  }
}
