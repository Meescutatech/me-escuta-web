import { NextResponse, type NextRequest } from "next/server";
import { atualizarSessao } from "@/lib/supabase/middleware";
import {
  COOKIE_DEPARTAMENTO,
  FORMA_CHAVE,
  MAX_AGE_DEPARTAMENTO,
  PARAM_DEPARTAMENTO,
} from "@/lib/departamentos/cookie";

/**
 * M6 · A PORTA DE ENTRADA DO CONTEXTO POR URL — e ela é porta, não sede.
 *
 * `?departamento=pre_venda` é consumido aqui, vira cookie e a URL sai limpa. O que isso compra é o
 * ganho do modelo Vercel apontado pelo benchmark §3-bis.1: **o link compartilhado carrega o
 * contexto**, então "olha esse lead" não abre no departamento errado do outro lado.
 *
 * O que isso NÃO faz, de propósito: não deixa o parâmetro viver na URL. A sede é o cookie, porque
 * o header mora no layout e no Next 14.2.20 layout não recebe `searchParams` (medida no cabeçalho
 * de `lib/dados/departamentos.ts`). Duas sedes produziriam a única coisa que o D6-f proíbe: o
 * rótulo do topo dizendo um escopo e a tela mostrando outro.
 *
 * O middleware só CARREGA o valor — ele não valida contra o banco, e não deve: validar aqui custaria
 * uma consulta por requisição, e a validação já acontece onde importa, em `lerEstadoEscopo`, a cada
 * leitura. Chave que a pessoa não vê é tratada como AUSENTE lá. Por isso o cookie continua sendo
 * preferência, e não credencial.
 */
export async function middleware(request: NextRequest) {
  const pedido = request.nextUrl.searchParams.get(PARAM_DEPARTAMENTO);
  if (pedido && FORMA_CHAVE.test(pedido)) {
    const url = request.nextUrl.clone();
    url.searchParams.delete(PARAM_DEPARTAMENTO);
    const resposta = NextResponse.redirect(url);
    resposta.cookies.set(COOKIE_DEPARTAMENTO, pedido, {
      path: "/",
      sameSite: "lax",
      maxAge: MAX_AGE_DEPARTAMENTO,
    });
    return resposta;
  }
  return atualizarSessao(request);
}

export const config = {
  // Roda em tudo, exceto assets estáticos e imagens.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
