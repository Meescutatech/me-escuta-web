import { test } from "node:test";
import assert from "node:assert/strict";
import { ehBotaoRecebido, ehTipoBotao } from "../lib/conversas/interativa.ts";

/*
 * Testes da lógica pura do botão recebido (E3) — roda com `npm test`
 * (node --test com type stripping, sem framework externo).
 *
 * Os rótulos usados aqui não são inventados: são os que produção realmente tem em 10/09 —
 * SIM (71), PREÇO (34), QUERO SABER MAIS (23), ONDE FICA (23), COMO FUNCIONA (19), NÃO (9).
 */

// ─────────── ehTipoBotao ───────────

test("os tipos de botão da Meta são reconhecidos (PT do ingestor e EN histórico)", () => {
  for (const tipo of ["botao", "button", "interativa", "interactive", "BOTAO", "Interactive"]) {
    assert.equal(ehTipoBotao(tipo), true, tipo);
  }
});

test("texto, mídia e nulo não são botão", () => {
  for (const tipo of ["texto", "text", "imagem", "audio", "reacao", null, undefined, ""]) {
    assert.equal(ehTipoBotao(tipo), false, String(tipo));
  }
});

// ─────────── ehBotaoRecebido ───────────

test("botão com texto vira pastilha — é o caso dos 190 de produção", () => {
  for (const corpo of ["SIM", "PREÇO", "QUERO SABER MAIS", "ONDE FICA", "NÃO"]) {
    assert.equal(ehBotaoRecebido({ tipo_conteudo: "botao", corpo }), true, corpo);
  }
});

test("interativa (button_reply/list_reply) segue o mesmo caminho", () => {
  // ⚠️ Zero linhas de `interativa` em produção até 10/09. O ramo existe porque o parser cria o
  // tipo, mas ele está provado AQUI e não por tráfego — é o que o PR declara.
  assert.equal(ehBotaoRecebido({ tipo_conteudo: "interativa", corpo: "Sim, quero" }), true);
});

test("botão SEM texto NÃO vira pastilha — degrada pro rótulo honesto de sempre", () => {
  // Pastilha vazia seria uma casca desenhada no lugar de um fato ausente. Nunca aconteceu em
  // produção (190/190 têm corpo), e é exatamente por isso que precisa de teste: o caso que
  // ninguém viu é o que ninguém confere à mão.
  for (const corpo of ["", "   ", "\n", null]) {
    assert.equal(ehBotaoRecebido({ tipo_conteudo: "botao", corpo }), false, JSON.stringify(corpo));
  }
  // `undefined` está FORA do tipo (`corpo` é `string | null`) e mesmo assim é alcançável em
  // produção: `lerPrevias` devolve `data as any[]` (lib/dados/conversas.ts), então uma coluna que
  // o select não trouxe chega como undefined sem o compilador ver. Por isso o `?.` na regra, e por
  // isso este caso é exercitado com cast em vez de removido.
  assert.equal(
    ehBotaoRecebido({ tipo_conteudo: "botao", corpo: undefined as unknown as null }),
    false,
    "undefined",
  );
});

test("mensagem de texto com corpo NÃO vira pastilha", () => {
  assert.equal(ehBotaoRecebido({ tipo_conteudo: "texto", corpo: "SIM" }), false);
});

test("reação não vira pastilha de botão — os dois são curtos, mas não são a mesma coisa", () => {
  assert.equal(ehBotaoRecebido({ tipo_conteudo: "reacao", corpo: "👍" }), false);
});
