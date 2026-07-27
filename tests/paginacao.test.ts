import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITE_PAGINA,
  codificar,
  decodificar,
  filtroKeyset,
  houveCorte,
  proximoCursor,
} from "../lib/conversas/paginacao.ts";

/*
 * F22 · lógica pura da paginação keyset do inbox. Roda com `npm test`.
 */

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const EM = "2026-07-20T23:49:27.000Z";

// ─────────── codificar / decodificar ───────────

test("F22 · cursor sobrevive à ida e volta", () => {
  assert.deepEqual(decodificar(codificar({ em: EM, id: ID_A })), { em: EM, id: ID_A });
});

test("F22 · cursor com em=null (bloco dos nulos) sobrevive à ida e volta", () => {
  assert.deepEqual(decodificar(codificar({ em: null, id: ID_A })), { em: null, id: ID_A });
});

test("F22 · o cursor é opaco — não vaza o par em texto claro", () => {
  const c = codificar({ em: EM, id: ID_A });
  assert.equal(c.includes(EM), false);
  assert.equal(c.includes(ID_A), false);
});

test("F22 · cursor corrompido devolve null, nunca lança e nunca adivinha", () => {
  const lixos = [
    null,
    undefined,
    "",
    "não é base64 ###",
    codificar({ em: EM, id: ID_A }).slice(0, 5), // truncado
    btoa("não é json"),
    btoa(JSON.stringify({ em: EM, id: ID_A })), // objeto em vez de par
    btoa(JSON.stringify([EM])), // faltando o id
    btoa(JSON.stringify([EM, ID_A, "sobra"])), // par com item a mais
    btoa(JSON.stringify([EM, "não-é-uuid"])), // id inválido
    btoa(JSON.stringify(["data inventada", ID_A])), // carimbo inválido
    btoa(JSON.stringify([123, ID_A])), // tipo errado
  ];
  for (const lixo of lixos) {
    assert.equal(decodificar(lixo as string), null, `deveria recusar: ${String(lixo)}`);
  }
});

// ─────────── proximoCursor ───────────

test("F22 · próximo cursor é o par da ÚLTIMA linha da página", () => {
  const pagina = [
    { id: ID_A, ultima_entrada_em: EM },
    { id: ID_B, ultima_entrada_em: null },
  ];
  assert.deepEqual(decodificar(proximoCursor(pagina, true)), { em: null, id: ID_B });
});

test("F22 · sem mais conversas, não há próximo cursor (fim é afirmação, não palpite)", () => {
  assert.equal(proximoCursor([{ id: ID_A, ultima_entrada_em: EM }], false), null);
});

test("F22 · página vazia não gera cursor", () => {
  assert.equal(proximoCursor([], true), null);
});

// ─────────── houveCorte ───────────

test("F22 · com total do servidor a resposta é exata", () => {
  assert.equal(houveCorte(50, 94, 50), true);
  assert.equal(houveCorte(94, 94, 50), false);
});

test("F22 · com exatamente 50 de 50 NÃO há corte — o caso que a spec crava", () => {
  // a página encheu, mas o total confirma que acabou: oferecer "carregar mais" aqui seria
  // prometer o que não existe
  assert.equal(houveCorte(50, 50, 50), false);
});

test("F22 · sem total, erra pro lado de DECLARAR o corte, nunca de esconder", () => {
  assert.equal(houveCorte(50, null, 50), true); // página cheia → provavelmente tem mais
  assert.equal(houveCorte(12, null, 50), false); // página incompleta → acabou mesmo
});

// ─────────── filtroKeyset ───────────

test("F22 · keyset cobre os três caminhos: menor, empate por id, e o bloco dos nulos", () => {
  const f = filtroKeyset({ em: EM, id: ID_A });
  assert.match(f, /ultima_entrada_em\.lt\."2026-07-20T23:49:27\.000Z"/);
  assert.match(f, /and\(ultima_entrada_em\.eq\."2026-07-20T23:49:27\.000Z",id\.gt\.11111111-/);
  assert.match(f, /ultima_entrada_em\.is\.null/);
});

test("F22 · cursor já no bloco dos nulos sobra só o desempate por id", () => {
  const f = filtroKeyset({ em: null, id: ID_A });
  assert.equal(f, `and(ultima_entrada_em.is.null,id.gt.${ID_A})`);
  // e NÃO pode reabrir os não-nulos, senão a página 2 traz de volta a lista inteira
  assert.equal(/lt\./.test(f), false);
});

test("F22 · o carimbo vai entre aspas — `+`/`:` são separadores na gramática do PostgREST", () => {
  const f = filtroKeyset({ em: "2026-07-20T23:49:27+00:00", id: ID_A });
  assert.match(f, /lt\."2026-07-20T23:49:27\+00:00"/);
});

test("F22 · o limite de página é o teto declarado, não um número solto no código", () => {
  assert.equal(LIMITE_PAGINA, 50);
});
