import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMANDOS,
  MOTIVO_TRAVA,
  despacharAoCliente,
  ehModoInterno,
  menuComandos,
  podeEnviarAoCliente,
  termoComando,
  type ModoComposer,
} from "../lib/conversas/composer-modo.ts";

/*
 * Rodada 13 / Bloco C — C1 (gatilho do `/`) e C3 (TRAVA DE ENVIO).
 * A trava é o risco nº 1 da spec: nota interna vazando para o cliente. Estes testes existem
 * para provar que a proibição vive no CAMINHO DE ENVIO, não no CSS do botão.
 */

// ═══════════ C1 — o `/` só abre menu no início do campo ═══════════

test("barra no início do campo abre o menu com todos os comandos", () => {
  assert.deepEqual(menuComandos("/"), COMANDOS);
});

test("barra no meio de uma frase é texto comum — nenhum menu", () => {
  assert.equal(termoComando("confirmar o retorno em 23/07"), null);
  assert.deepEqual(menuComandos("confirmar o retorno em 23/07"), []);
});

test("data em PT-BR digitada no começo do campo não vira comando", () => {
  // "/07 já respondi" — barra inicial, mas com espaço: é frase, não comando
  assert.equal(termoComando("/07 já respondi"), null);
  assert.deepEqual(menuComandos("/07 já respondi"), []);
});

test("o termo filtra o menu em tempo real", () => {
  assert.deepEqual(menuComandos("/no").map((c) => c.comando), ["/nota"]);
  assert.deepEqual(menuComandos("/tar").map((c) => c.comando), ["/tarefa"]);
});

test("termo que não casa com nada fecha o menu sem erro", () => {
  assert.deepEqual(menuComandos("/xyz"), []);
});

test("acento e caixa não atrapalham o filtro", () => {
  assert.deepEqual(menuComandos("/NÓ").map((c) => c.comando), ["/nota"]);
});

// ═══════════ C3 — TRAVA DE ENVIO ═══════════

const INTERNOS: ModoComposer[] = ["nota", "tarefa"];

test("em modo interno o caminho de envio NÃO chama a função que envia", () => {
  for (const modo of INTERNOS) {
    let chamadas = 0;
    const r = despacharAoCliente(modo, "isso aqui é interno", () => {
      chamadas += 1;
    });
    assert.equal(chamadas, 0, `modo ${modo} deixou o envio passar — nota interna vazaria`);
    assert.equal(r.enviado, false);
    assert.equal(r.motivo, MOTIVO_TRAVA);
  }
});

test("em modo mensagem o envio acontece normalmente, com o texto aparado", () => {
  const enviados: string[] = [];
  const r = despacharAoCliente("mensagem", "  bom dia, Maria  ", (t) => enviados.push(t));
  assert.equal(r.enviado, true);
  assert.deepEqual(enviados, ["bom dia, Maria"]);
});

test("modo mensagem com campo vazio não envia (e não é a trava)", () => {
  let chamadas = 0;
  const r = despacharAoCliente("mensagem", "   ", () => {
    chamadas += 1;
  });
  assert.equal(chamadas, 0);
  assert.equal(r.enviado, false);
  assert.notEqual(r.motivo, MOTIVO_TRAVA);
});

test("a trava vence mesmo com texto que parece mensagem de cliente", () => {
  // regressão: a decisão é do MODO, nunca do conteúdo
  let chamadas = 0;
  despacharAoCliente("nota", "Oi Maria, tudo bem?", () => {
    chamadas += 1;
  });
  assert.equal(chamadas, 0);
});

test("só o modo mensagem pode falar com o cliente", () => {
  assert.equal(podeEnviarAoCliente("mensagem"), true);
  assert.equal(podeEnviarAoCliente("nota"), false);
  assert.equal(podeEnviarAoCliente("tarefa"), false);
});

test("todo modo interno é reconhecido como interno", () => {
  assert.equal(ehModoInterno("mensagem"), false);
  for (const modo of INTERNOS) assert.equal(ehModoInterno(modo), true);
});

test("todo comando do menu leva a um modo interno — nenhum comando envia ao cliente", () => {
  for (const c of COMANDOS) {
    assert.equal(ehModoInterno(c.modo), true);
    assert.equal(podeEnviarAoCliente(c.modo), false);
  }
});
