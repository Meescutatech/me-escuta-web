import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTONOMIA_TAREFA,
  TETOS_TAREFA,
  decidirAutonomia,
  fundamentoTeto,
  rotuloTipo,
  tetoTarefa,
} from "../lib/tarefas/autonomia.ts";

/*
 * Contrato da autonomia por tipo de tarefa (D10, 18/08), no vocabulário das migrations
 * 0160/0161/0165 da trilha B.
 *
 * Os dois testes que mais importam aqui não são sobre o que a lista diz hoje — a lista é config
 * e vai mudar. São sobre as duas propriedades que NÃO podem mudar por descuido:
 *   · fail-closed: o que ninguém declarou pede aprovação, nunca nasce sozinho (0161);
 *   · o teto vence a config: pedir `auto` onde o teto é `propor` é recusado, não obedecido (0160).
 */

test("fail-closed: tipo não declarado cai em `propor`, nunca em `auto`", () => {
  assert.equal(tetoTarefa("tipo_que_ninguem_declarou"), "propor");
  const d = decidirAutonomia("tipo_que_ninguem_declarou");
  assert.equal(d.nivel, "propor");
  assert.ok(d.fundamento.length > 0, "até o fail-closed tem de dizer por quê");
});

test("INVARIANTE: nenhum teto declarado pode ser `auto` sem fundamento escrito", () => {
  for (const t of TETOS_TAREFA.tetos) {
    assert.ok(t.fundamento.trim().length > 40, `teto de ${t.chave} sem fundamento suficiente`);
    assert.ok(["auto", "propor"].includes(t.teto_nivel), `teto inválido em ${t.chave}`);
  }
});

test("INVARIANTE Art. III.3: crédito, cobrança e preço NUNCA são automáticos", () => {
  for (const chave of ["validar_serasa", "confirmar_pagamento", "negociar_preco"]) {
    assert.equal(AUTONOMIA_TAREFA[chave], "proibido", `${chave} deixou de ser proibido`);
    assert.notEqual(tetoTarefa(chave), "auto", `${chave} ganhou teto auto — o limite duro caiu`);
    assert.equal(decidirAutonomia(chave).nivel, "proibido");
  }
});

test("o teto vence a config: `auto` pedido acima do teto vira `propor` e MARCA o rebaixamento", () => {
  // simula o conflito que a 0160 barra na porta, sem mutar a config real
  const chave = "ligar_lead"; // teto `propor`
  assert.equal(tetoTarefa(chave), "propor");
  const original = AUTONOMIA_TAREFA[chave];
  try {
    AUTONOMIA_TAREFA[chave] = "auto";
    const d = decidirAutonomia(chave);
    assert.equal(d.nivel, "propor", "config `auto` foi obedecida acima do teto");
    assert.equal(d.rebaixadoPeloTeto, true, "rebaixamento silencioso — ninguém descobriria o conflito");
  } finally {
    AUTONOMIA_TAREFA[chave] = original;
  }
});

test("D10: os três automáticos e os três que propõem estão como o workshop fechou", () => {
  for (const c of ["acompanhar_follow_up", "confirmar_exame", "primeiro_toque"])
    assert.equal(decidirAutonomia(c).nivel, "auto", c);
  for (const c of ["ligar_lead", "cobrar_terceiro", "marcar_perdido"])
    assert.equal(decidirAutonomia(c).nivel, "propor", c);
});

test("toda chave configurada tem teto declarado — config sem teto é config sem lastro", () => {
  for (const chave of Object.keys(AUTONOMIA_TAREFA)) {
    assert.ok(fundamentoTeto(chave), `${chave} está na config mas não tem teto declarado`);
  }
});

test("todo tipo configurado tem rótulo humano — a tela nunca mostra a chave crua", () => {
  for (const chave of Object.keys(AUTONOMIA_TAREFA)) {
    assert.notEqual(rotuloTipo(chave), chave, `${chave} sem rótulo`);
  }
});
