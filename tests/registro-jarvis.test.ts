import { test } from "node:test";
import assert from "node:assert/strict";
import { jarvisDaTarefa, montarRegistros } from "../lib/conversas/registro-timeline.ts";
import type { TarefaLead } from "../lib/dados/lead-painel.ts";

/*
 * F2 / D62 — a tarefa que o JARVIS criou a partir da conversa aparece na timeline como REGISTRO
 * ("Jarvis criou tarefa: FAZER — POR QUE"), sem botão de aprovar. O contrato que este teste trava:
 * só `origem = 'jarvis_conversa'` vira registro do Jarvis; tarefa humana continua tarefa comum;
 * FAZER cai no título quando a coluna vier vazia.
 */

function tarefa(sobrescreve: Partial<TarefaLead>): TarefaLead {
  return {
    id: "t1",
    titulo: "Ligar para Maria",
    responsavel: null,
    responsavel_id: null,
    descricao: null,
    tipo: null,
    prazo: null,
    status: "pendente",
    resultado: null,
    criado_em: "2026-08-27T12:00:00.000Z",
    concluida_em: null,
    por_que: null,
    fazer: null,
    trecho: null,
    origem: null,
    ...sobrescreve,
  };
}

test("origem jarvis_conversa vira registro do Jarvis com fazer, por_que e trecho", () => {
  const j = jarvisDaTarefa(
    tarefa({ origem: "jarvis_conversa", fazer: "Ligar para Maria amanhã", por_que: " Ela pediu. ", trecho: "me liga amanhã?" }),
  );
  assert.deepEqual(j, { fazer: "Ligar para Maria amanhã", por_que: "Ela pediu.", trecho: "me liga amanhã?" });
});

test("sem origem jarvis_conversa NÃO é registro do Jarvis, mesmo com por_que preenchido", () => {
  assert.equal(jarvisDaTarefa(tarefa({ por_que: "x", trecho: "y" })), null);
  assert.equal(jarvisDaTarefa(tarefa({ origem: "varredura", por_que: "x" })), null);
});

test("fazer vazio cai no título; por_que/trecho vazios viram null", () => {
  assert.deepEqual(jarvisDaTarefa(tarefa({ origem: "jarvis_conversa", fazer: "  ", por_que: "", trecho: null })), {
    fazer: "Ligar para Maria",
    por_que: null,
    trecho: null,
  });
});

test("montarRegistros carrega `jarvis` na tarefa do Jarvis e null na nota e na tarefa humana", () => {
  const regs = montarRegistros(
    [{ id: "n1", autor: "sara@meescuta.com", autor_id: null, tipo: null, texto: "nota", criado_em: "2026-08-27T11:00:00.000Z" }],
    [
      tarefa({ id: "h1", criado_em: "2026-08-27T11:30:00.000Z" }),
      tarefa({ id: "j1", origem: "jarvis_conversa", fazer: "Cobrar exame", por_que: "Exame sem retorno há 2 dias", trecho: "fiz o agendamento?" }),
    ],
    [],
    [],
  );
  assert.deepEqual(
    regs.map((r) => [r.id, r.tipo, r.jarvis?.fazer ?? null]),
    [
      ["n1", "nota", null],
      ["h1", "tarefa", null],
      ["j1", "tarefa", "Cobrar exame"],
    ],
  );
});
