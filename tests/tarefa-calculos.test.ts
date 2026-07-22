import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estadoTarefa,
  nomeResponsavel,
  organizarTarefas,
  textoPrazo,
  vencida,
} from "../lib/dados/tarefa-calculos.ts";
import { parseTiposTarefa, TIPOS_TAREFA_SEMENTE } from "../lib/tarefa-tipos.ts";
import type { TarefaLead } from "../lib/dados/lead-painel.ts";

/*
 * Rodada 13 / Bloco C — C6. "Vencida" é DERIVADA na leitura (§10.1): o Bloco A não persiste
 * esse estado. Se derivarmos errado, repetimos o cemitério do Kommo (97,9% da fila aberta em
 * vermelho, e o vermelho deixando de significar qualquer coisa).
 */

const AGORA = Date.parse("2026-07-22T12:00:00.000Z");

function tarefa(sobrescreve: Partial<TarefaLead>): TarefaLead {
  return {
    id: "t1",
    titulo: "Confirmar retorno",
    responsavel: null,
    responsavel_id: null,
    descricao: null,
    tipo: null,
    prazo: null,
    status: "pendente",
    resultado: null,
    criado_em: "2026-07-20T10:00:00.000Z",
    concluida_em: null,
    ...sobrescreve,
  };
}

// ═══════════ vencida é derivada do relógio ═══════════

test("prazo no passado vence; no futuro, não", () => {
  assert.equal(vencida("2026-07-20T09:00:00.000Z", AGORA), true);
  assert.equal(vencida("2026-07-23T09:00:00.000Z", AGORA), false);
});

test("tarefa SEM prazo nunca vence — não há contra o que vencer", () => {
  assert.equal(vencida(null, AGORA), false);
  assert.equal(estadoTarefa(tarefa({ prazo: null }), AGORA), "pendente");
});

test("concluída no passado não é vencida — concluir encerra o relógio", () => {
  const t = tarefa({ status: "concluida", prazo: "2026-07-01T09:00:00.000Z", concluida_em: "2026-07-02T09:00:00.000Z" });
  assert.equal(estadoTarefa(t, AGORA), "concluida");
});

test("arquivada sai da fila mesmo com prazo estourado (§10.1)", () => {
  const t = tarefa({ status: "arquivada", prazo: "2026-07-01T09:00:00.000Z" });
  assert.equal(estadoTarefa(t, AGORA), "arquivada");
});

test("prazo inválido não vira vencida silenciosamente", () => {
  assert.equal(vencida("não é data", AGORA), false);
});

// ═══════════ ordenação da lista ═══════════

test("vencida sobe pro topo, depois por prazo, sem prazo por último", () => {
  const { abertas, qtdVencidas } = organizarTarefas(
    [
      tarefa({ id: "sem", prazo: null }),
      tarefa({ id: "futura", prazo: "2026-07-25T09:00:00.000Z" }),
      tarefa({ id: "atrasada", prazo: "2026-07-19T09:00:00.000Z" }),
      tarefa({ id: "hoje", prazo: "2026-07-22T18:00:00.000Z" }),
    ],
    AGORA,
  );
  assert.deepEqual(abertas.map((t) => t.id), ["atrasada", "hoje", "futura", "sem"]);
  assert.equal(qtdVencidas, 1);
});

test("concluídas saem da fila aberta e vêm da mais recente pra mais antiga", () => {
  const { abertas, concluidas } = organizarTarefas(
    [
      tarefa({ id: "velha", status: "concluida", concluida_em: "2026-07-10T11:40:00.000Z" }),
      tarefa({ id: "aberta" }),
      tarefa({ id: "nova", status: "concluida", concluida_em: "2026-07-21T15:12:00.000Z" }),
    ],
    AGORA,
  );
  assert.deepEqual(abertas.map((t) => t.id), ["aberta"]);
  assert.deepEqual(concluidas.map((t) => t.id), ["nova", "velha"]);
});

// ═══════════ responsável: uuid manda, texto livre é legado ═══════════

const NOMES = new Map([["3f9a1c62-7c4e-4a15-9b0f-2d5e8a7c1b44", "Camila Rocha"]]);

test("responsavel_id (Bloco A) vence o texto livre da R8", () => {
  const t = tarefa({ responsavel_id: "3f9a1c62-7c4e-4a15-9b0f-2d5e8a7c1b44", responsavel: "sara@meescuta.com" });
  assert.equal(nomeResponsavel(t, NOMES), "Camila Rocha");
});

test("sem responsavel_id, o e-mail legado vira o prefixo", () => {
  assert.equal(nomeResponsavel(tarefa({ responsavel: "sara@meescuta.com" }), NOMES), "sara");
});

test("artefato da porta (humano:<uid>) não é nome de gente", () => {
  assert.equal(nomeResponsavel(tarefa({ responsavel: "humano:bf71ce15" }), NOMES), null);
  assert.equal(nomeResponsavel(tarefa({ responsavel: "agente:levindo" }), NOMES), null);
});

// ═══════════ texto do prazo ═══════════

test("o verbo do prazo muda com o estado", () => {
  assert.match(textoPrazo(tarefa({ prazo: "2026-07-19T09:00:00.000Z" }), AGORA)!, /^venceu /);
  assert.match(textoPrazo(tarefa({ prazo: "2026-07-25T09:00:00.000Z" }), AGORA)!, /^vence /);
  assert.match(
    textoPrazo(tarefa({ status: "concluida", concluida_em: "2026-07-21T18:12:00.000Z" }), AGORA)!,
    /^concluída /,
  );
  assert.equal(textoPrazo(tarefa({ prazo: null }), AGORA), "sem prazo");
});

// ═══════════ tipos de tarefa vêm de config ═══════════

test("config ausente ou de shape desconhecido cai na semente, nunca em lista vazia", () => {
  assert.equal(parseTiposTarefa(null), null);
  assert.equal(parseTiposTarefa({}), null);
  assert.equal(parseTiposTarefa({ tipos: [] }), null);
  assert.ok(TIPOS_TAREFA_SEMENTE.length >= 9, "a semente da spec §4.1.3 tem 9 tipos");
});

test("config aceita lista de textos e lista de objetos", () => {
  assert.deepEqual(parseTiposTarefa({ tipos: ["Confirmar consulta"] }), [
    { chave: "confirmar_consulta", rotulo: "Confirmar consulta" },
  ]);
  assert.deepEqual(parseTiposTarefa({ tipos: [{ chave: "pos_venda", rotulo: "Pós-venda" }] }), [
    { chave: "pos_venda", rotulo: "Pós-venda" },
  ]);
});
