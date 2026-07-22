import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  acaoPresencaValida,
  criarGatilhoDigitando,
  JANELA_DIGITANDO_MS,
  montarCorpoPresenca,
} from "../lib/conversas/presenca.ts";

/*
 * PRESENÇA (Rodada 11 — Bloco B): lógica pura dos gatilhos. O contrato com o runtime
 * (POST /presenca {conversa_id, acao}) e o throttle do "digitando…" por conversa.
 */

describe("acaoPresencaValida", () => {
  it("aceita só as duas ações que a API oficial suporta", () => {
    assert.equal(acaoPresencaValida("lida"), true);
    assert.equal(acaoPresencaValida("digitando"), true);
    for (const invalida of ["online", "typing", "", null, undefined, 42]) {
      assert.equal(acaoPresencaValida(invalida), false, `aceitou indevidamente: ${String(invalida)}`);
    }
  });
});

describe("montarCorpoPresenca (contrato web ↔ rota /presenca do runtime)", () => {
  it("shape exato {conversa_id, acao}", () => {
    assert.deepEqual(JSON.parse(montarCorpoPresenca("abc-123", "digitando")), {
      conversa_id: "abc-123",
      acao: "digitando",
    });
  });
});

describe("criarGatilhoDigitando (throttle por conversa)", () => {
  const T0 = 1_000_000;

  it("primeira tecla sinaliza; dentro da janela segura; passada a janela sinaliza de novo", () => {
    const g = criarGatilhoDigitando(20_000);
    assert.equal(g.deve("c1", T0), true, "primeira tecla deve sinalizar");
    assert.equal(g.deve("c1", T0 + 1_000), false, "1s depois: dentro da janela");
    assert.equal(g.deve("c1", T0 + 19_999), false, "19,999s: ainda dentro");
    assert.equal(g.deve("c1", T0 + 20_000), true, "20s: janela venceu, re-sinaliza (typing da Meta dura 25s)");
  });

  it("janela é POR CONVERSA — trocar de conversa não herda o relógio", () => {
    const g = criarGatilhoDigitando(20_000);
    assert.equal(g.deve("c1", T0), true);
    assert.equal(g.deve("c2", T0 + 100), true, "outra conversa sinaliza imediatamente");
    assert.equal(g.deve("c1", T0 + 200), false, "c1 continua na própria janela");
  });

  it("zerar(conversa) reabre a janela na hora (mensagem enviada derruba o typing na Meta)", () => {
    const g = criarGatilhoDigitando(20_000);
    assert.equal(g.deve("c1", T0), true);
    g.zerar("c1");
    assert.equal(g.deve("c1", T0 + 1), true, "após zerar, a próxima tecla re-sinaliza");
  });

  it("conversa vazia nunca sinaliza", () => {
    const g = criarGatilhoDigitando(20_000);
    assert.equal(g.deve("", T0), false);
  });

  it("janela default fica abaixo dos 25s do indicador da Meta", () => {
    assert.ok(JANELA_DIGITANDO_MS < 25_000);
    assert.ok(JANELA_DIGITANDO_MS >= 10_000, "não martelar a Graph");
  });
});
