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

test("sequência na_fila→falhou não ressuscita bolha fantasma (poda de estado)", () => {
  // fluxo real do 131030: envia → projeção confirma na_fila → sender falha → linha vira 'falhou'.
  // O inbox aplica pendentesVivas no ESTADO a cada refetch; a confirmação tem que ser irreversível.
  let estado: Mensagem[] = [msg({ id: "tmp-1", pendente: true })];
  estado = pendentesVivas(estado, [msg({ id: "srv-1", status_entrega: "na_fila" })]);
  assert.deepEqual(estado, []); // confirmada → podada do estado
  estado = pendentesVivas(estado, [
    msg({ id: "srv-1", status_entrega: "falhou", erro_codigo: "131030" }),
  ]);
  assert.deepEqual(estado, []); // a mesma linha falhou depois → nada ressuscita
});

test("corpo diferente não reconcilia", () => {
  const pendente = msg({ id: "tmp-1", corpo: "Bom dia", pendente: true });
  const servidor = [msg({ id: "srv-1", status_entrega: "enviado" })];
  assert.deepEqual(pendentesVivas([pendente], servidor), [pendente]);
});

// ─────────── rodada 6 — retry e reconciliação com MÍDIA ───────────

test("mídia falhada SEM legenda ganha retry (tem o que reenviar: o caminho)", () => {
  const m = msg({
    tipo_conteudo: "imagem",
    corpo: null,
    midia_caminho: "saida/u1.jpg",
    status_entrega: "falhou",
    erro_codigo: "131030",
  });
  assert.equal(podeTentarDeNovo(m), true);
});

test("mídia com erro permanente segue sem retry", () => {
  const m = msg({
    tipo_conteudo: "imagem",
    corpo: null,
    midia_caminho: "saida/u1.jpg",
    status_entrega: "falhou",
    erro_codigo: "131047",
  });
  assert.equal(podeTentarDeNovo(m), false);
});

test("pendente de mídia reconcilia pelo midia_caminho (chave única do upload)", () => {
  const pendente = msg({
    id: "tmp-1",
    tipo_conteudo: "imagem",
    corpo: "olha a foto",
    midia_caminho: "saida/u1.jpg",
    pendente: true,
  });
  const servidor = [
    msg({ id: "srv-1", tipo_conteudo: "imagem", corpo: "olha a foto", midia_caminho: "saida/u1.jpg", status_entrega: "na_fila" }),
  ];
  assert.deepEqual(pendentesVivas([pendente], servidor), []);
});

test("dois uploads com a MESMA legenda não se engolem (caminhos distintos)", () => {
  const pendente = msg({
    id: "tmp-2",
    tipo_conteudo: "imagem",
    corpo: "olha a foto",
    midia_caminho: "saida/u2.jpg",
    pendente: true,
  });
  const servidor = [
    msg({ id: "srv-1", tipo_conteudo: "imagem", corpo: "olha a foto", midia_caminho: "saida/u1.jpg", status_entrega: "enviado" }),
  ];
  assert.deepEqual(pendentesVivas([pendente], servidor), [pendente]);
});

test("degrade: servidor SEM colunas de mídia reconcilia pela legenda não-vazia", () => {
  // deploy em qualquer ordem: se a projeção ainda não propaga midia_caminho, a linha vem só com
  // o corpo (legenda) — reconcilia por ele; legenda vazia NÃO reconcilia com qualquer linha vazia
  const comLegenda = msg({
    id: "tmp-1",
    tipo_conteudo: "imagem",
    corpo: "olha a foto",
    midia_caminho: "saida/u1.jpg",
    pendente: true,
  });
  const semLegenda = msg({
    id: "tmp-2",
    tipo_conteudo: "audio",
    corpo: null,
    midia_caminho: "saida/u2.ogg",
    pendente: true,
  });
  const servidor = [
    msg({ id: "srv-1", corpo: "olha a foto", status_entrega: "na_fila" }),
    msg({ id: "srv-2", corpo: null, status_entrega: "na_fila" }),
  ];
  assert.deepEqual(pendentesVivas([comLegenda, semLegenda], servidor), [semLegenda]);
});

test("pendente de TEXTO não é confirmada por linha de mídia com legenda igual", () => {
  const pendente = msg({ id: "tmp-1", corpo: "olha a foto", pendente: true });
  const servidor = [
    msg({ id: "srv-1", tipo_conteudo: "imagem", corpo: "olha a foto", midia_caminho: "saida/u1.jpg", status_entrega: "enviado" }),
  ];
  assert.deepEqual(pendentesVivas([pendente], servidor), [pendente]);
});
