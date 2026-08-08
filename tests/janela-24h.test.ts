import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVISO_FECHADA,
  duracaoCurta,
  EXPLICACAO_FECHADA,
  exigeTemplate,
  MS_DIA,
  MS_HORA,
  permiteMensagemLivre,
  regimeDaJanela,
} from "../lib/conversas/janela.ts";

/*
 * SPEC-B §7 — a janela de 24 horas e o regime do composer.
 * J1: "não sei" não é "fechada" — coluna ausente NÃO tranca o campo.
 * J2: fora da janela o composer troca de regime e diz por quê; nunca some.
 * J3: o rótulo de tempo nunca é zero.
 */

const AGORA = Date.parse("2026-08-07T21:00:00Z");

test("J2 · dentro da janela: aberta, com quanto tempo ainda resta", () => {
  const e = regimeDaJanela(new Date(AGORA + 21 * MS_HORA).toISOString(), AGORA);
  assert.equal(e.regime, "aberta");
  assert.equal(e.chip, "Responde livre por 21h");
  assert.equal(e.aviso, null);
  assert.ok(permiteMensagemLivre(e));
  assert.ok(!exigeTemplate(e));
});

test("J2 · fora da janela: fechada, com há quanto tempo e o que fazer", () => {
  const e = regimeDaJanela(new Date(AGORA - 3 * MS_DIA).toISOString(), AGORA);
  assert.equal(e.regime, "fechada");
  assert.equal(e.chip, "Janela fechada há 3 dias");
  assert.equal(e.aviso, EXPLICACAO_FECHADA);
  assert.ok(!permiteMensagemLivre(e));
  assert.ok(exigeTemplate(e));
});

test("J1 · coluna AUSENTE (undefined) ⇒ desconhecida: nada é dito e nada é trancado", () => {
  const e = regimeDaJanela(undefined, AGORA);
  assert.equal(e.regime, "desconhecida");
  assert.equal(e.chip, null);
  assert.equal(e.aviso, null);
  // é a doutrina do M7: ambiente sem a coluna não vira impedimento de atendimento.
  assert.ok(permiteMensagemLivre(e));
  assert.ok(!exigeTemplate(e));
});

test("J1 · coluna VAZIA (null) ⇒ fechada: conversa sem entrada nunca teve janela", () => {
  const e = regimeDaJanela(null, AGORA);
  assert.equal(e.regime, "fechada");
  assert.ok(exigeTemplate(e));
  assert.ok(e.chip?.includes("Sem janela"));
  assert.ok(e.aviso?.includes("nunca recebeu"));
});

test("J1 · undefined e null são OPOSTOS em consequência — o teste que prova que não colapsaram", () => {
  assert.notEqual(regimeDaJanela(undefined, AGORA).regime, regimeDaJanela(null, AGORA).regime);
});

test("J1 · carimbo ilegível vira 'não sei', nunca 'fechada'", () => {
  const e = regimeDaJanela("nao-e-uma-data", AGORA);
  assert.equal(e.regime, "desconhecida");
  assert.ok(permiteMensagemLivre(e));
});

test("a borda exata: o instante em que fecha já é fechado", () => {
  assert.equal(regimeDaJanela(new Date(AGORA).toISOString(), AGORA).regime, "fechada");
  assert.equal(regimeDaJanela(new Date(AGORA + 1000).toISOString(), AGORA).regime, "aberta");
});

test("J3 · o rótulo de tempo nunca é zero — '0h' lido como 'acabou' é o erro caro", () => {
  assert.equal(duracaoCurta(0), "menos de 1min");
  assert.equal(duracaoCurta(59_000), "menos de 1min");
  assert.equal(duracaoCurta(60_000), "1min");
  assert.equal(duracaoCurta(43 * 60_000), "43min");
  assert.equal(duracaoCurta(MS_HORA), "1h");
  assert.equal(duracaoCurta(23 * MS_HORA), "23h");
  assert.equal(duracaoCurta(MS_DIA), "1 dia");
  assert.equal(duracaoCurta(3 * MS_DIA), "3 dias");
});

test("J3 · faltando segundos para fechar, o chip ainda convida a responder", () => {
  const e = regimeDaJanela(new Date(AGORA + 30_000).toISOString(), AGORA);
  assert.equal(e.regime, "aberta");
  assert.equal(e.chip, "Responde livre por menos de 1min");
});

test("o texto do aviso mora num lugar só — barra e campo não podem divergir", () => {
  assert.ok(AVISO_FECHADA.includes("24 horas"));
  assert.ok(EXPLICACAO_FECHADA.includes("template aprovado"));
});
