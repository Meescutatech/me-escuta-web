import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieParaSetar = { name: string; value: string; options?: CookieOptions };

/**
 * Refresh de sessão + gate de autenticação no middleware (RF-7: não autenticado é BLOQUEADO).
 * Rotas sob (app) exigem sessão; sem sessão → redireciona para /login.
 */
export async function atualizarSessao(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieParaSetar[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const rotaPublica =
    pathname.startsWith("/login") || pathname.startsWith("/auth") || pathname.startsWith("/convite");

  if (!user && !rotaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("proxima", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/funil";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
