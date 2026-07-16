"use server";

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

  redirect(proxima);
}
