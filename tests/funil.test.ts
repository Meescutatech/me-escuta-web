import { test } from "node:test";
import assert from "node:assert/strict";
import { TETO_CARDS, chavesDoBoard, houveCorte } from "../lib/dados/funil-calculos.ts";

/*
 * Testes da lógica pura do board (conserto do verificador, Rodada 7): a leitura de cards
 * filtra pelas chaves da config vigente e NUNCA descarta silenciosamente ao bater no teto.
 */

// config vigente real (funil_vendas): 14 etapas; 'arquivado' NÃO faz parte do funil
const CONFIG_ETAPAS = [
  { chave: "novo" },
  { chave: "qualificando" },
  { chave: "avaliacao" },
  { chave: "proposta" },
  { chave: "negociacao" },
  { chave: "ganho" },
  { chave: "perdido" },
];

test("chavesDoBoard = exatamente as chaves da config — 'arquivado' nunca entra no filtro", () => {
  const chaves = chavesDoBoard(CONFIG_ETAPAS);
  assert.deepEqual(chaves, ["novo", "qualificando", "avaliacao", "proposta", "negociacao", "ganho", "perdido"]);
  assert.ok(!chaves.includes("arquivado"));
});

test("teto atual comporta o volume real (629 hoje) com folga — o teto antigo de 500 não comportava", () => {
  const volumeReal = 629; // v_lead_card em 21/07, import da Trilha A
  assert.ok(TETO_CARDS > volumeReal, `TETO_CARDS (${TETO_CARDS}) precisa ser > ${volumeReal}`);
  assert.equal(houveCorte(volumeReal, 500), true); // o teto antigo TERIA cortado — e cortava calado
  assert.equal(houveCorte(volumeReal, TETO_CARDS), false); // o novo não corta
});

test("houveCorte sinaliza exatamente quando a leitura bate no teto", () => {
  assert.equal(houveCorte(0, TETO_CARDS), false);
  assert.equal(houveCorte(TETO_CARDS - 1, TETO_CARDS), false);
  assert.equal(houveCorte(TETO_CARDS, TETO_CARDS), true); // no teto = pode haver mais → avisa
});
