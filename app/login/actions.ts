"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Login por e-mail/senha (Supabase Auth). Sem sessão, a UI é bloqueada (RF-7). */
export async function entrar(_prev: string | null, formData: FormData): Promise<string | null> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const proxima = String(formData.get("proxima") ?? "/funil") || "/funil";

  if (!email || !senha) return "Informe e-mail e senha.";

  const supabase = criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return error.message;

  // sessao_iniciada no ledger (spec §5.2) — conta como 1º batimento de presença.
  // Melhor esforço: falha da métrica nunca bloqueia o login.
  await supabase
    .schema("api")
    .rpc("registrar_evento", {
      p: { tipo: "sessao_iniciada", id_externo: randomUUID(), versao_payload: 1, payload: { metodo: "senha" } },
    })
    .then(() => undefined, () => undefined);

  redirect(proxima);
}
