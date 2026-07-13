import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieParaSetar = { name: string; value: string; options?: CookieOptions };

/**
 * Cliente Supabase para Server Components / Server Actions. A sessão vem dos cookies (SSR).
 * Leitura de dados vai direto no schema `core` com RLS; escrita SÓ via RPC-porta (schema `api`).
 */
export function criarClienteServidor() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieParaSetar[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Em Server Component puro o set de cookie lança — ok, o middleware cuida do refresh.
          }
        },
      },
    },
  );
}
