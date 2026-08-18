import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sessaoAindaFresca } from "./sessao-cookie";

type CookieParaSetar = { name: string; value: string; options?: CookieOptions };

/** O que o middleware usa do cliente Supabase — só o `getUser`. */
interface ClienteAuthMiddleware {
  auth: { getUser(): Promise<{ data: { user: unknown } }> };
}

interface ManipuladoresCookie {
  getAll(): { name: string; value: string }[];
  setAll(cookies: CookieParaSetar[]): void;
}

/**
 * Injeção usada SÓ pelo teste (`tests/middleware-atalho.test.ts`). Em produção nada é passado:
 * o cliente é o `createServerClient` real e o relógio é o do sistema. Existe porque a única
 * forma honesta de provar "o atalho não fez round-trip" é substituir a única coisa que fala com
 * a rede e afirmar que ela não foi instanciada.
 */
export interface DepsMiddleware {
  criarCliente?: (manipuladores: ManipuladoresCookie) => ClienteAuthMiddleware;
  agoraMs?: number;
}

/**
 * R23 protótipo (branch r23/prototipo-workshop, NUNCA em main) · `/prototipo` entra aqui porque é
 * uma tela de fixtures: ela não lê o banco, não escreve e não mostra dado de ninguém. Exigir
 * sessão só faria o Diogo bater no /login antes de ver as quatro telas do workshop — e o login
 * é justamente a parte que não está sendo prototipada.
 */
const PREFIXOS_PUBLICOS = ["/login", "/auth", "/convite", "/prototipo"];

const ehRotaPublica = (pathname: string) => PREFIXOS_PUBLICOS.some((p) => pathname.startsWith(p));

/**
 * Refresh de sessão + gate de autenticação no middleware (RF-7: não autenticado é BLOQUEADO).
 * Rotas sob (app) exigem sessão; sem sessão → redireciona para /login.
 *
 * F3: quando o cookie de sessão está presente e o access token tem mais de 60 s de folga, a
 * decisão é LOCAL — sem o `getUser()` que atravessa o continente até o Auth em us-west-2 (o
 * middleware resolve em gru1; são 215–310 ms por requisição, inclusive prefetch e RSC).
 *
 * Isto não é validação de assinatura, e não precisa ser: quem garante autenticidade é o
 * `getUser()` do `app/(app)/layout.tsx` mais a RLS em toda leitura. Um cookie forjado no máximo
 * passa daqui e morre no layout. Essa dependência é frágil por natureza — por isso a suíte tem
 * um teste que PARSEIA o layout e falha se aquele gate sumir.
 *
 * O refresh não se perde: dentro da margem de 60 s, `sessaoAindaFresca` devolve false e o
 * caminho completo roda, idêntico ao de antes.
 */
export async function atualizarSessao(
  request: NextRequest,
  deps: DepsMiddleware = {},
): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  if (sessaoAindaFresca(request.cookies.getAll(), deps.agoraMs ?? Date.now())) {
    // Sessão presente e com folga: das três coisas que o middleware faz, só uma se aplica —
    // tirar quem já tem sessão de /login. O refresh não é necessário (ainda há folga) e o gate
    // de rota já está satisfeito.
    if (pathname.startsWith("/login")) {
      const url = request.nextUrl.clone();
      url.pathname = "/funil";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  return caminhoCompleto(request, deps);
}

/**
 * O comportamento anterior ao F3, inalterado: instancia o cliente, roda `getUser` (que renova o
 * cookie quando preciso) e aplica as regras de rota. É para onde cai todo cookie ausente,
 * ilegível, fatiado incompleto ou perto de expirar.
 */
async function caminhoCompleto(
  request: NextRequest,
  deps: DepsMiddleware = {},
): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const manipuladores: ManipuladoresCookie = {
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
  };

  const supabase: ClienteAuthMiddleware = deps.criarCliente
    ? deps.criarCliente(manipuladores)
    : createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: manipuladores },
      );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (!user && !ehRotaPublica(pathname)) {
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
