import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expDoJwt,
  extrairAccessToken,
  montarCookieSessao,
  sessaoAindaFresca,
} from "../lib/supabase/sessao-cookie.ts";

/*
 * Testes do atalho local do middleware (perf/rotas): decidir "sessão fresca" pelo exp do JWT
 * no cookie, sem round-trip ao Auth. Roda com `npm test` (node --test, sem framework).
 */

const b64url = (s: string) => Buffer.from(s).toString("base64url");

function jwtFake(exp: number): string {
  return `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ sub: "u1", exp }))}.assinatura`;
}

function cookieSessao(exp: number, opts?: { base64?: boolean; chunks?: number }): { name: string; value: string }[] {
  const json = JSON.stringify({ access_token: jwtFake(exp), refresh_token: "r", expires_at: exp });
  const valor = opts?.base64 ? `base64-${Buffer.from(json).toString("base64url")}` : json;
  if (!opts?.chunks) return [{ name: "sb-abc-auth-token", value: valor }];
  const tam = Math.ceil(valor.length / opts.chunks);
  return Array.from({ length: opts.chunks }, (_, i) => ({
    name: `sb-abc-auth-token.${i}`,
    value: valor.slice(i * tam, (i + 1) * tam),
  }));
}

const AGORA = 1_750_000_000_000; // ms
const agoraSeg = AGORA / 1000;

// ─────────── montarCookieSessao ───────────

test("cookie inteiro é encontrado", () => {
  assert.equal(montarCookieSessao([{ name: "sb-x-auth-token", value: "abc" }]), "abc");
});

test("chunks .0/.1 são juntados na ordem", () => {
  const cookies = [
    { name: "sb-x-auth-token.1", value: "B" },
    { name: "sb-x-auth-token.0", value: "A" },
  ];
  assert.equal(montarCookieSessao(cookies), "AB");
});

test("sem cookie de sessão → null (outros cookies são ignorados)", () => {
  assert.equal(montarCookieSessao([{ name: "outro", value: "x" }]), null);
  assert.equal(montarCookieSessao([]), null);
});

// ─────────── extrairAccessToken / expDoJwt ───────────

test("JSON puro e base64- são decodificados", () => {
  const exp = agoraSeg + 3600;
  for (const opts of [undefined, { base64: true }]) {
    const [c] = cookieSessao(exp, opts);
    const token = extrairAccessToken(c.value);
    assert.ok(token, JSON.stringify(opts));
    assert.equal(expDoJwt(token!), exp);
  }
});

test("lixo não explode: vira null", () => {
  assert.equal(extrairAccessToken("nao-e-json"), null);
  assert.equal(extrairAccessToken("base64-@@@!"), null);
  assert.equal(expDoJwt("so.duas"), null);
  assert.equal(expDoJwt(`${b64url("{}")}.${b64url('{"sem":"exp"}')}.x`), null);
});

// ─────────── sessaoAindaFresca ───────────

test("token com 1h pela frente → fresca (sem rede)", () => {
  assert.equal(sessaoAindaFresca(cookieSessao(agoraSeg + 3600), AGORA), true);
});

test("token fresco em cookie base64 e em chunks → fresca", () => {
  assert.equal(sessaoAindaFresca(cookieSessao(agoraSeg + 3600, { base64: true }), AGORA), true);
  assert.equal(sessaoAindaFresca(cookieSessao(agoraSeg + 3600, { base64: true, chunks: 3 }), AGORA), true);
});

test("token expirado ou dentro da margem de 60s → NÃO fresca (vai pro caminho completo)", () => {
  assert.equal(sessaoAindaFresca(cookieSessao(agoraSeg - 10), AGORA), false);
  assert.equal(sessaoAindaFresca(cookieSessao(agoraSeg + 30), AGORA), false); // < margem
});

test("sem cookie / cookie ilegível → NÃO fresca", () => {
  assert.equal(sessaoAindaFresca([], AGORA), false);
  assert.equal(sessaoAindaFresca([{ name: "sb-x-auth-token", value: "lixo" }], AGORA), false);
});
