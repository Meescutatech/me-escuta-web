import { test } from "node:test";
import assert from "node:assert/strict";
import { BATIMENTO_MS, INTERACAO_MS, devePulsar, montarEnvelopeAtividade } from "../lib/presenca.ts";

/*
 * Heartbeat (spec §7.1): pulsa a cada 60s SOMENTE com sessão + aba visível + interação
 * nos últimos 5 min. As constantes casam com a config `presenca` semeada na 0035
 * (batimento_seg=60, interacao_seg=300) — a derivação de janelas é do banco.
 */

test("constantes casam com a config presenca da 0035 (60s / 300s)", () => {
  assert.equal(BATIMENTO_MS, 60_000);
  assert.equal(INTERACAO_MS, 300_000);
});

test("pulsa: autenticado + aba visível + interação recente", () => {
  assert.equal(devePulsar({ autenticado: true, abaVisivel: true, msDesdeInteracao: 0 }), true);
  assert.equal(devePulsar({ autenticado: true, abaVisivel: true, msDesdeInteracao: 299_999 }), true);
});

test("NÃO pulsa sem sessão", () => {
  assert.equal(devePulsar({ autenticado: false, abaVisivel: true, msDesdeInteracao: 0 }), false);
});

test("NÃO pulsa com aba oculta (deixar aberta no fundo não conta tempo online)", () => {
  assert.equal(devePulsar({ autenticado: true, abaVisivel: false, msDesdeInteracao: 0 }), false);
});

test("NÃO pulsa parado há 5 min ou mais (idle não é tempo online)", () => {
  assert.equal(devePulsar({ autenticado: true, abaVisivel: true, msDesdeInteracao: 300_000 }), false);
  assert.equal(devePulsar({ autenticado: true, abaVisivel: true, msDesdeInteracao: 3_600_000 }), false);
});

test("envelope de atividade segue o contrato da porta (id_externo por ação, versao_payload 1)", () => {
  const env = montarEnvelopeAtividade("presenca_registrada", { rota: "/funil" }, "uuid-1");
  assert.deepEqual(env, {
    tipo: "presenca_registrada",
    id_externo: "uuid-1",
    versao_payload: 1,
    payload: { rota: "/funil" },
  });
  // ator/origem NÃO vão no envelope — a porta força do JWT (anti-forja)
  assert.ok(!("ator" in env) && !("origem" in env));
});

test("envelope de conversa_aberta carrega a conversa (D10)", () => {
  const env = montarEnvelopeAtividade("conversa_aberta", { conversa_id: "abc" }, "uuid-2");
  assert.equal(env.tipo, "conversa_aberta");
  assert.deepEqual(env.payload, { conversa_id: "abc" });
});
