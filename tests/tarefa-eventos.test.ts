import { test } from "node:test";
import assert from "node:assert/strict";
import {
  construirArquivamento,
  construirReatribuicao,
  construirRepactuacao,
} from "../lib/dados/tarefa-eventos.ts";

/*
 * Rodada 14 — gestão de tarefas. Os payloads têm as chaves EXATAS do contrato §5.2 (teste
 * falha se alguém acrescentar ou remover chave — mesmo rigor do mencao_criada do Bloco C), e
 * o motivo obrigatório é espelho da porta: a UI recusa antes do round-trip, o banco recusa de
 * novo (check_violation). Nunca mandar string vazia "para passar".
 */

const TID = "11111111-1111-4111-8111-111111111111";
const UID = "22222222-2222-4222-8222-222222222222";

test("reatribuir: payload tem exatamente {tarefa_id, responsavel_id}", () => {
  const c = construirReatribuicao(TID, UID);
  assert.ok(c.ok);
  assert.equal(c.tipo, "tarefa_reatribuida");
  assert.deepEqual(Object.keys(c.payload).sort(), ["responsavel_id", "tarefa_id"]);
  assert.equal(c.payload.responsavel_id, UID);
});

test("reatribuir: sem responsável (ou só espaço) é recusado antes da porta", () => {
  assert.equal(construirReatribuicao(TID, "").ok, false);
  assert.equal(construirReatribuicao(TID, "   ").ok, false);
  assert.equal(construirReatribuicao("", UID).ok, false);
});

test("repactuar: payload tem exatamente {tarefa_id, prazo, motivo} e prazo vira ISO", () => {
  const c = construirRepactuacao(TID, "2026-08-01T12:00:00.000Z", "paciente viaja, remarcou");
  assert.ok(c.ok);
  assert.equal(c.tipo, "tarefa_prazo_repactuado");
  assert.deepEqual(Object.keys(c.payload).sort(), ["motivo", "prazo", "tarefa_id"]);
  assert.equal(c.payload.prazo, "2026-08-01T12:00:00.000Z");
  assert.equal(c.payload.motivo, "paciente viaja, remarcou");
});

test("repactuar: motivo em branco é recusado — adiar vira registro, não silêncio (§10.1)", () => {
  assert.equal(construirRepactuacao(TID, "2026-08-01T12:00:00.000Z", "").ok, false);
  assert.equal(construirRepactuacao(TID, "2026-08-01T12:00:00.000Z", "   ").ok, false);
});

test("repactuar: prazo ausente ou inválido é recusado", () => {
  assert.equal(construirRepactuacao(TID, "", "motivo real").ok, false);
  assert.equal(construirRepactuacao(TID, "amanhã de manhã", "motivo real").ok, false);
});

test("repactuar: motivo é aparado, nunca enviado com espaços de enfeite", () => {
  const c = construirRepactuacao(TID, "2026-08-01T12:00:00.000Z", "  lead pediu  ");
  assert.ok(c.ok);
  assert.equal(c.payload.motivo, "lead pediu");
});

test("arquivar: payload tem exatamente {tarefa_id, motivo}", () => {
  const c = construirArquivamento(TID, "lead fechou por outro canal");
  assert.ok(c.ok);
  assert.equal(c.tipo, "tarefa_arquivada");
  assert.deepEqual(Object.keys(c.payload).sort(), ["motivo", "tarefa_id"]);
});

test("arquivar: motivo em branco é recusado — sair da fila deixa rastro", () => {
  assert.equal(construirArquivamento(TID, "").ok, false);
  assert.equal(construirArquivamento(TID, "  ").ok, false);
  assert.equal(construirArquivamento("", "motivo").ok, false);
});
