import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoErroPermanente, pendentesVivas, podeTentarDeNovo } from "../lib/conversas/thread.ts";
import type { Mensagem } from "../lib/dados/conversas.ts";

/*
 * Testes da lógica pura do retry (RF-28/32) — roda com `npm test`
 * (node --test com type stripping, sem framework externo).
 */

function msg(sobrescreve: Partial<Mensagem>): Mensagem {
  return {
    id: "m1",
    direcao: "saida",
    tipo_conteudo: "texto",
    corpo: "Ola",
    criado_em: "2026-07-20T21:36:16.560Z",
    ...sobrescreve,
  };
}

// ─────────── podeTentarDeNovo ───────────

test("falha projetada com erro transitório (131030) ganha retry", () => {
  assert.equal(podeTentarDeNovo(msg({ status_entrega: "falhou", erro_codigo: "131030" })), true);
});

test("retry NÃO expira com o tempo — falha antiga continua reprocessável", () => {
  // regressão da janela de 24h: o conserto do sender pode chegar dias depois da falha
  const antiga = msg({
    status_entrega: "falhou",
    erro_codigo: "131030",
    criado_em: "2026-06-01T10:00:00.000Z",
  });
  assert.equal(podeTentarDeNovo(antiga), true);
});

test("erro permanente da Meta não ganha retry (só o motivo)", () => {
  for (const codigo of ["131047", "131026", "130497"]) {
    assert.equal(podeTentarDeNovo(msg({ status_entrega: "falhou", erro_codigo: codigo })), false);
  }
});

test("falha projetada sem código de erro ganha retry", () => {
  assert.equal(podeTentarDeNovo(msg({ status_entrega: "falhou" })), true);
});

test("falha local (action recusou o enfileiramento) ganha retry", () => {
  assert.equal(podeTentarDeNovo(msg({ falha_local: true, pendente: true })), true);
});

test("sem corpo não tem o que reenviar", () => {
  assert.equal(
    podeTentarDeNovo(msg({ corpo: null, status_entrega: "falhou", erro_codigo: "131030" })),
    false,
  );
});

test("mensagem entregue/enviada não ganha retry", () => {
  for (const estado of ["na_fila", "enviando", "enviado", "entregue", "lido"] as const) {
    assert.equal(podeTentarDeNovo(msg({ status_entrega: estado })), false);
  }
});

test("131030 não é permanente; 131047 é", () => {
  assert.equal(motivoErroPermanente("131030"), null);
  assert.match(motivoErroPermanente("131047") ?? "", /24h/);
});

// ─────────── pendentesVivas (reconciliação RF-32) ───────────

test("projeção confirmada (na_fila) reconcilia a pendente de mesmo corpo", () => {
  const pendente = msg({ id: "tmp-1", pendente: true });
  const servidor = [msg({ id: "srv-1", status_entrega: "na_fila" })];
  assert.deepEqual(pendentesVivas([pendente], servidor), []);
});

test("linha 'falhou' do servidor NÃO engole a pendente do reenvio do mesmo texto", () => {
  const pendente = msg({ id: "tmp-1", pendente: true });
  const servidor = [msg({ id: "srv-falha", status_entrega: "falhou", erro_codigo: "131030" })];
  assert.deepEqual(pendentesVivas([pendente], servidor), [pendente]);
});

test("mensagem de ENTRADA com o mesmo corpo não reconcilia pendente de saída", () => {
  const pendente = msg({ id: "tmp-1", pendente: true });
  const servidor = [msg({ id: "srv-in", direcao: "entrada", status_entrega: undefined })];
  assert.deepEqual(pendentesVivas([pendente], servidor), [pendente]);
});

test("corpo diferente não reconcilia", () => {
  const pendente = msg({ id: "tmp-1", corpo: "Bom dia", pendente: true });
  const servidor = [msg({ id: "srv-1", status_entrega: "enviado" })];
  assert.deepEqual(pendentesVivas([pendente], servidor), [pendente]);
});
