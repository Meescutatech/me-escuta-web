/*
 * Leitura LOCAL do access token da sessão Supabase gravada em cookie pelo @supabase/ssr —
 * pro middleware decidir "sessão presente e longe de expirar" SEM round-trip ao Auth
 * (us-west-2, ~200ms por navegação). Não é validação de assinatura: quem garante a
 * autenticidade continua sendo o getUser dos Server Components + RLS em toda leitura.
 * Cookie forjado no máximo passa do middleware e morre no layout (redirect /login).
 *
 * Formato do cookie (@supabase/ssr): `sb-<ref>-auth-token` com o JSON da sessão, opcionalmente
 * prefixado com `base64-` (base64url) e/ou fatiado em chunks `.0`, `.1`, … quando grande.
 */

export interface CookiePar {
  name: string;
  value: string;
}

const SUFIXO = "-auth-token";

/** Reconstrói o valor do cookie de sessão (juntando chunks `.0`, `.1`, … na ordem). */
export function montarCookieSessao(cookies: CookiePar[]): string | null {
  const inteiro = cookies.find((c) => c.name.startsWith("sb-") && c.name.endsWith(SUFIXO));
  if (inteiro?.value) return inteiro.value;

  const chunks = cookies
    .map((c) => {
      const m = c.name.match(/^sb-.*-auth-token\.(\d+)$/);
      return m ? { ordem: Number(m[1]), valor: c.value } : null;
    })
    .filter((c): c is { ordem: number; valor: string } => c !== null)
    .sort((a, b) => a.ordem - b.ordem);
  if (chunks.length === 0) return null;
  return chunks.map((c) => c.valor).join("");
}

function decodificarBase64Url(s: string): string | null {
  try {
    return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return null;
  }
}

/** Extrai o access_token (JWT) do valor do cookie de sessão. */
export function extrairAccessToken(valorCookie: string): string | null {
  let json = valorCookie;
  if (json.startsWith("base64-")) {
    const decodificado = decodificarBase64Url(json.slice("base64-".length));
    if (!decodificado) return null;
    json = decodificado;
  }
  try {
    const sessao = JSON.parse(json);
    return typeof sessao?.access_token === "string" ? sessao.access_token : null;
  } catch {
    return null;
  }
}

/** `exp` (segundos unix) do payload do JWT — sem validar assinatura (ver cabeçalho). */
export function expDoJwt(jwt: string): number | null {
  const partes = jwt.split(".");
  if (partes.length !== 3) return null;
  const payload = decodificarBase64Url(partes[1]);
  if (!payload) return null;
  try {
    const exp = JSON.parse(payload)?.exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

/**
 * Sessão presente e com access token a mais de `margemSegundos` de expirar → o middleware
 * pode decidir localmente. Perto de expirar/ausente/ilegível → false (caminho completo:
 * getUser + refresh, exatamente o comportamento de antes).
 */
export function sessaoAindaFresca(
  cookies: CookiePar[],
  agoraMs: number,
  margemSegundos = 60,
): boolean {
  const valor = montarCookieSessao(cookies);
  if (!valor) return false;
  const token = extrairAccessToken(valor);
  if (!token) return false;
  const exp = expDoJwt(token);
  if (exp == null) return false;
  return exp * 1000 > agoraMs + margemSegundos * 1000;
}
