import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HORA_MANHA,
  HORA_TARDE,
  MAX_DIAS_PROGRAMACAO,
  civil,
  frasePrograma,
  instante,
  opcoesProgramar,
  paraValorLocal,
  proximaHoraCheia,
  validarEscolha,
} from "../lib/conversas/programar-envio.ts";

/*
 * Contrato do "enviar agora ou programar" (workshop 12/08, pedido nº 1): cópia do Gmail, no fuso
 * fixo da operação (-03:00). O que estes testes travam é justamente o que um relógio de navegador
 * quebraria em silêncio — "amanhã de manhã" tem de ser 8h em São Paulo para todo mundo.
 */

/** quarta-feira, 13/08/2025, 14:30 em São Paulo */
const QUA_1430 = instante(2025, 8, 13, 14, 30);

test("civil e instante são inversos no fuso da operação", () => {
  const c = civil(QUA_1430);
  assert.deepEqual(
    { ano: c.ano, mes: c.mes, dia: c.dia, hora: c.hora, min: c.min },
    { ano: 2025, mes: 8, dia: 13, hora: 14, min: 30 },
  );
  assert.equal(c.diaSemana, 3); // quarta
});

test("instante trata a hora como -03:00, não como UTC", () => {
  // 13/08/2025 14:30 em SP = 17:30 UTC
  assert.equal(new Date(QUA_1430).toISOString(), "2025-08-13T17:30:00.000Z");
});

test("atalhos: amanhã de manhã às 8h e amanhã à tarde às 13h", () => {
  const o = opcoesProgramar(QUA_1430);
  const manha = o.find((x) => x.chave === "amanha_manha")!;
  const tarde = o.find((x) => x.chave === "amanha_tarde")!;
  assert.equal(civil(manha.quando).hora, HORA_MANHA);
  assert.equal(civil(tarde.quando).hora, HORA_TARDE);
  assert.equal(civil(manha.quando).dia, 14);
  assert.equal(manha.detalhe, "qui, 08:00");
});

test("segunda de manhã é a PRÓXIMA segunda — na segunda, some para daqui a 7 dias", () => {
  const seg = instante(2025, 8, 11, 10, 0); // segunda
  const alvo = opcoesProgramar(seg).find((x) => x.chave === "segunda_manha")!;
  const c = civil(alvo.quando);
  assert.equal(c.diaSemana, 1);
  assert.equal(c.dia, 18); // a seguinte, não hoje
});

test("no domingo, 'segunda de manhã' colide com 'amanhã de manhã' e a repetida some", () => {
  const dom = instante(2025, 8, 17, 10, 0); // domingo
  const o = opcoesProgramar(dom);
  assert.equal(o.filter((x) => x.chave === "segunda_manha").length, 0);
  assert.ok(o.some((x) => x.chave === "amanha_manha"));
  // e nenhum instante aparece duas vezes
  assert.equal(new Set(o.map((x) => x.quando)).size, o.length);
});

test("nenhum atalho oferecido está no passado", () => {
  for (const base of [instante(2025, 8, 13, 23, 59), instante(2025, 8, 14, 7, 59), QUA_1430]) {
    for (const o of opcoesProgramar(base)) assert.ok(o.quando > base, `${o.chave} no passado`);
  }
});

test("validarEscolha recusa horário passado com motivo", () => {
  const r = validarEscolha("2025-08-13T14:00", QUA_1430);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : "", /já passou/);
});

test("validarEscolha recusa formato inválido e além do teto", () => {
  assert.equal(validarEscolha("", QUA_1430).ok, false);
  assert.equal(validarEscolha("13/08/2025 15:00", QUA_1430).ok, false);
  const longe = paraValorLocal(QUA_1430 + (MAX_DIAS_PROGRAMACAO + 1) * 86_400_000);
  assert.equal(validarEscolha(longe, QUA_1430).ok, false);
});

test("validarEscolha aceita futuro e devolve o instante no fuso da operação", () => {
  const r = validarEscolha("2025-08-14T09:15", QUA_1430);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.quando, instante(2025, 8, 14, 9, 15));
});

test("frasePrograma: hoje e amanhã são relativos; de dois dias em diante leva a data", () => {
  assert.equal(frasePrograma(instante(2025, 8, 13, 18, 0), QUA_1430), "hoje às 18:00");
  assert.equal(frasePrograma(instante(2025, 8, 14, 8, 0), QUA_1430), "amanhã às 08:00");
  assert.equal(frasePrograma(instante(2025, 8, 19, 8, 0), QUA_1430), "ter, 19/08 às 08:00");
});

test("proximaHoraCheia nunca devolve um horário já passado", () => {
  for (const base of [QUA_1430, instante(2025, 8, 13, 23, 40), instante(2025, 8, 13, 0, 1)]) {
    const p = proximaHoraCheia(base);
    assert.ok(p > base);
    assert.equal(civil(p).min, 0);
  }
});

test("paraValorLocal produz exatamente o formato do input datetime-local", () => {
  assert.equal(paraValorLocal(instante(2025, 8, 4, 9, 5)), "2025-08-04T09:05");
});
