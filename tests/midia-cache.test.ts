import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARGEM_SEG,
  TTL_ASSINATURA_SEG,
  TTL_CACHE_SEG,
  criarArmazem,
  expirar,
  guardar,
  obter,
  precisaAssinar,
  vigente,
} from "../lib/conversas/cache-midia.ts";

/*
 * F13 · cache de URL assinada. Acerto, expiração e margem — a fronteira é o item inteiro:
 * cache mais longo que a assinatura entrega URL vencida, e a foto vira erro.
 */

const T0 = 1_800_000_000_000; // instante fixo: teste de tempo não pode depender do relógio
const seg = (n: number) => n * 1000;

test("F13 · a MESMA URL é devolvida enquanto estiver vigente — é isso que salva o cache do navegador", () => {
  const a = criarArmazem();
  guardar(a, "foto.jpg", "https://x/foto.jpg?token=abc", T0);
  assert.equal(obter(a, "foto.jpg", T0), "https://x/foto.jpg?token=abc");
  assert.equal(obter(a, "foto.jpg", T0 + seg(60)), "https://x/foto.jpg?token=abc");
  assert.equal(obter(a, "foto.jpg", T0 + seg(TTL_CACHE_SEG - 1)), "https://x/foto.jpg?token=abc");
});

test("F13 · caminho que nunca foi assinado devolve null (= assine), não erro", () => {
  assert.equal(obter(criarArmazem(), "nunca-vista.jpg", T0), null);
});

test("F13 · passado o TTL do cache, a URL para de ser reusada", () => {
  const a = criarArmazem();
  guardar(a, "foto.jpg", "https://x/foto.jpg?token=abc", T0);
  assert.equal(obter(a, "foto.jpg", T0 + seg(TTL_CACHE_SEG)), null);
  assert.equal(obter(a, "foto.jpg", T0 + seg(TTL_CACHE_SEG + 1)), null);
});

test("F13 · A MARGEM: o cache para ANTES da assinatura vencer, nunca depois", () => {
  // é a regra que impede entregar URL vencida — o modo de falha mais provável e mais visível
  assert.ok(TTL_CACHE_SEG < TTL_ASSINATURA_SEG, "cache tem de ser menor que a assinatura");
  assert.equal(TTL_ASSINATURA_SEG - TTL_CACHE_SEG, MARGEM_SEG);
  // no último instante reusável, ainda sobram MARGEM_SEG de vida na assinatura
  const a = criarArmazem();
  guardar(a, "foto.jpg", "u", T0);
  const ultimoInstante = T0 + seg(TTL_CACHE_SEG - 1);
  assert.notEqual(obter(a, "foto.jpg", ultimoInstante), null);
  const vidaRestanteSeg = TTL_ASSINATURA_SEG - (ultimoInstante - T0) / 1000;
  assert.ok(vidaRestanteSeg > MARGEM_SEG, `restavam ${vidaRestanteSeg}s, esperava > ${MARGEM_SEG}s`);
});

test("F13 · relógio para trás não faz a entrada ser reusada às cegas", () => {
  const a = criarArmazem();
  guardar(a, "foto.jpg", "u", T0);
  assert.equal(obter(a, "foto.jpg", T0 - seg(10)), null);
});

test("F13 · precisaAssinar devolve só o que falta — o resto reusa", () => {
  const a = criarArmazem();
  guardar(a, "a.jpg", "ua", T0);
  guardar(a, "b.jpg", "ub", T0 - seg(TTL_CACHE_SEG + 5)); // já vencida
  assert.deepEqual(precisaAssinar(a, ["a.jpg", "b.jpg", "c.jpg"], T0), ["b.jpg", "c.jpg"]);
});

test("F13 · lista vazia não pede assinatura nenhuma", () => {
  assert.deepEqual(precisaAssinar(criarArmazem(), [], T0), []);
});

test("F13 · expirar poda o que venceu — cache de processo que só cresce vira vazamento", () => {
  const a = criarArmazem();
  guardar(a, "viva.jpg", "u1", T0);
  guardar(a, "velha1.jpg", "u2", T0 - seg(TTL_CACHE_SEG + 1));
  guardar(a, "velha2.jpg", "u3", T0 - seg(TTL_CACHE_SEG + 999));
  assert.equal(expirar(a, T0), 2);
  assert.deepEqual([...a.keys()], ["viva.jpg"]);
});

test("F13 · vigente() é a única regra de tempo — quem pergunta não recalcula prazo", () => {
  assert.equal(vigente(undefined, T0), false);
  assert.equal(vigente({ url: "u", assinadaEm: T0 }, T0), true);
  assert.equal(vigente({ url: "u", assinadaEm: T0 }, T0 + seg(TTL_CACHE_SEG)), false);
});
