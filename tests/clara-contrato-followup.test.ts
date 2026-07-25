import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PISO_JANELA_PRODUCAO_MIN,
  HORARIO_PRODUCAO,
  HORARIO_DEFAULT,
  contratoOk,
  efeitoRuntime,
  problemasContrato,
} from "../lib/clara/contrato-followup.ts";

// ===== espelho do runtime: números PINADOS na fonte da verdade =====
// me-escuta-runtime src/clara/followup.ts (parseConfigFollowup, feat/clara-pronta-producao):
// se o runtime mudar o contrato, este teste quebra ANTES da tela voltar a mentir.
test("contrato espelha o runtime: piso 60 min, horário 6-22, default 8-20", () => {
  assert.equal(PISO_JANELA_PRODUCAO_MIN, 60);
  assert.deepEqual({ ...HORARIO_PRODUCAO }, { inicioMin: 6, fimMax: 22 });
  assert.deepEqual({ ...HORARIO_DEFAULT }, { inicio: 8, fim: 20 });
});

// ===== janelas =====
test("cadência da demo (2/4/8/16 min) é recusada com o porquê", () => {
  const p = problemasContrato([2, 4, 8, 16], 8, 20);
  assert.ok(p.janelas !== null);
  assert.match(p.janelas!, /piso de produção \(60 min\)/);
  assert.match(p.janelas!, /minuto em minuto/); // explica o porquê, não "valor inválido" seco
  assert.equal(p.horario, null);
  assert.equal(contratoOk(p), false);
});

test("cadência default do n8n (120/240/480/960) passa", () => {
  const p = problemasContrato([120, 240, 480, 960], 8, 20);
  assert.deepEqual(p, { janelas: null, horario: null });
  assert.equal(contratoOk(p), true);
});

test("janela exatamente no piso (60) passa; 59 não", () => {
  assert.equal(problemasContrato([60], 8, 20).janelas, null);
  assert.ok(problemasContrato([59], 8, 20).janelas !== null);
});

test("mistura: só as janelas abaixo do piso aparecem na mensagem", () => {
  const p = problemasContrato([30, 120, 45], 8, 20);
  assert.match(p.janelas!, /30, 45/);
  assert.ok(!/120/.test(p.janelas!));
});

test("sem janelas: pede ao menos uma", () => {
  const p = problemasContrato([], 8, 20);
  assert.match(p.janelas!, /ao menos uma/);
});

// ===== horário =====
test("horário 0-24 (gate desligado da demo) é recusado explicando a madrugada", () => {
  const p = problemasContrato([120], 0, 24);
  assert.ok(p.horario !== null);
  assert.match(p.horario!, /entre 6h e 22h/);
  assert.match(p.horario!, /madrugada/);
});

test("bordas do contrato: 6-22 passa; 5-20 e 8-23 não; início >= fim não", () => {
  assert.equal(problemasContrato([120], 6, 22).horario, null);
  assert.ok(problemasContrato([120], 5, 20).horario !== null);
  assert.ok(problemasContrato([120], 8, 23).horario !== null);
  assert.ok(problemasContrato([120], 12, 12).horario !== null);
  assert.ok(problemasContrato([120], 14, 9).horario !== null);
});

// ===== efeito no runtime (o banner "salvo ≠ aplicado") =====
test("efeitoRuntime reproduz a trava: 2/4/8/16 min vira 60/60/60/60 e 0-24 vira 8-20", () => {
  const e = efeitoRuntime([2, 4, 8, 16], 0, 24);
  assert.deepEqual(e.janelasEfetivasMin, [60, 60, 60, 60]);
  assert.deepEqual(e.horarioEfetivo, { inicio: 8, fim: 20 });
  assert.equal(e.divergente, true);
});

test("efeitoRuntime com config dentro do contrato: passa reto, sem divergência", () => {
  const e = efeitoRuntime([120, 240, 480, 960], 8, 20);
  assert.deepEqual(e.janelasEfetivasMin, [120, 240, 480, 960]);
  assert.deepEqual(e.horarioEfetivo, { inicio: 8, fim: 20 });
  assert.equal(e.divergente, false);
});

test("efeitoRuntime só eleva o que está abaixo do piso (piso é por janela)", () => {
  const e = efeitoRuntime([30, 120], 8, 20);
  assert.deepEqual(e.janelasEfetivasMin, [60, 120]);
  assert.deepEqual(e.horarioEfetivo, { inicio: 8, fim: 20 });
  assert.equal(e.divergente, true);
});
