import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para o browser (client components). Usa a chave publicável (anon) — pública por
 * design; o RLS é quem protege os dados. Segredo real NUNCA vai pro bundle (Constituição Art. VI).
 */
export function criarClienteBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
