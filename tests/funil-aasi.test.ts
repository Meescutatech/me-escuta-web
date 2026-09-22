import { test } from "node:test";
import assert from "node:assert/strict";
import {
  opcoesDoCampoAasi,
  valorAindaValido,
  CAMPOS_AASI_CONDICIONADOS,
  ROTULO_CAMPO_AASI,
  type OpcoesModelo,
} from "../lib/funil/aasi.ts";

const MAPA: Record<string, OpcoesModelo> = {
  "MODELO A": { receptores: ["S", "M", "P"], olivas: ["Aberta", "Fechada"] },
  "MODELO B": { receptores: ["HP"], olivas: [] },
};

test("resolve receptores do modelo selecionado", () => {
  const r = opcoesDoCampoAasi("receptor_oe", "MODELO A", MAPA);
  assert.equal(r.estado, "ok");
  assert.deepEqual(r.opcoes, ["S", "M", "P"]);
});

test("resolve olivas do modelo selecionado (independe do ouvido)", () => {
  assert.deepEqual(opcoesDoCampoAasi("oliva_oe", "MODELO A", MAPA).opcoes, ["Aberta", "Fechada"]);
  assert.deepEqual(opcoesDoCampoAasi("oliva_od", "MODELO A", MAPA).opcoes, ["Aberta", "Fechada"]);
});

test("OE e OD do mesmo tipo compartilham as opções do modelo", () => {
  const oe = opcoesDoCampoAasi("receptor_oe", "MODELO A", MAPA).opcoes;
  const od = opcoesDoCampoAasi("receptor_od", "MODELO A", MAPA).opcoes;
  assert.deepEqual(oe, od);
});

test("sem modelo selecionado → estado sem_modelo, lista vazia (não select fantasma)", () => {
  for (const v of [null, undefined, "", "   "]) {
    const r = opcoesDoCampoAasi("receptor_oe", v, MAPA);
    assert.equal(r.estado, "sem_modelo");
    assert.equal(r.opcoes.length, 0);
  }
});

test("modelo fora do mapa → nao_mapeado, NUNCA inventa opção", () => {
  const r = opcoesDoCampoAasi("receptor_oe", "MODELO INEXISTENTE", MAPA);
  assert.equal(r.estado, "nao_mapeado");
  assert.equal(r.opcoes.length, 0);
});

test("modelo mapeado mas sem olivas → nao_mapeado para oliva, ok para receptor", () => {
  assert.equal(opcoesDoCampoAasi("oliva_oe", "MODELO B", MAPA).estado, "nao_mapeado");
  assert.equal(opcoesDoCampoAasi("receptor_oe", "MODELO B", MAPA).estado, "ok");
});

test("valorAindaValido: vazio é sempre válido", () => {
  assert.equal(valorAindaValido("receptor_oe", null, "MODELO A", MAPA), true);
  assert.equal(valorAindaValido("receptor_oe", "   ", "MODELO A", MAPA), true);
});

test("valorAindaValido: receptor compatível com o modelo passa", () => {
  assert.equal(valorAindaValido("receptor_oe", "M", "MODELO A", MAPA), true);
});

test("valorAindaValido: receptor de OUTRO modelo é rejeitado (trocou o modelo depois)", () => {
  // "S" é do MODELO A; ao mudar para MODELO B (só "HP"), deixa de valer
  assert.equal(valorAindaValido("receptor_oe", "S", "MODELO B", MAPA), false);
});

test("os 4 campos condicionados existem e têm rótulo OE/OD", () => {
  assert.deepEqual([...CAMPOS_AASI_CONDICIONADOS], ["receptor_oe", "receptor_od", "oliva_oe", "oliva_od"]);
  assert.equal(ROTULO_CAMPO_AASI.receptor_oe, "Receptor OE");
  assert.equal(ROTULO_CAMPO_AASI.oliva_od, "Oliva OD");
});
