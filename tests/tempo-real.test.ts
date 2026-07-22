import { test } from "node:test";
import assert from "node:assert/strict";
import { deveRefazer, fmtAtras, novosIds } from "../lib/tempo-real.ts";

/*
 * Testes da lógica pura do tempo real (Rodada 9, fase 1) — `npm test` (node --test).
 */

test("deveRefazer: respeita a folga mínima entre refetches (rajada vira UMA releitura)", () => {
  assert.equal(deveRefazer(0, 1200, 1200), true);
  assert.equal(deveRefazer(1000, 2100, 1200), false);
  assert.equal(deveRefazer(1000, 2200, 1200), true);
});

test("novosIds: detecta só quem ENTROU; primeira leitura nunca pulsa", () => {
  const prev = new Set(["a", "b"]);
  assert.deepEqual(novosIds(prev, ["a", "b", "c"], false), ["c"]);
  assert.deepEqual(novosIds(prev, ["a"], false), []); // saída não pulsa
  assert.deepEqual(novosIds(new Set(), ["a", "b"], true), []); // primeira leitura
  assert.deepEqual(novosIds(new Set(), ["a"], false), ["a"]);
});

test("fmtAtras: agora / segundos / minutos / horas", () => {
  assert.equal(fmtAtras(0), "agora");
  assert.equal(fmtAtras(4.9), "agora");
  assert.equal(fmtAtras(32), "há 32s");
  assert.equal(fmtAtras(59.9), "há 59s");
  assert.equal(fmtAtras(60), "há 1min");
  assert.equal(fmtAtras(59 * 60), "há 59min");
  assert.equal(fmtAtras(3600), "há 1h");
});
