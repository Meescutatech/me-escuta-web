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

/*
 * 15/09 · O SELETOR DE RESPONSÁVEL no cartão da conversa não é um componente que se vira sozinho:
 * ele precisa de dois dados que a timeline não carregava — o `responsavel_id` (o nome não serve
 * para gravar) e se a tarefa está pendente (a porta recusa reatribuir as outras, 55000).
 *
 * É a fronteira de sempre: o controle pode estar perfeito e não funcionar porque quem o alimenta
 * não manda o campo. Por isso o contrato é travado aqui, na montagem, e não só no componente.
 */
test("o registro de tarefa carrega responsavel_id e pendente — o que o seletor precisa para gravar", () => {
  const [r] = montarRegistros(
    [],
    [tarefa({ id: "t9", responsavel_id: "u-1", responsavel: "sara@meescuta.com", status: "pendente" })],
    [],
    [{ id: "u-1", nome: "Sara Lima", tipo: "humano", ativo: true, papel: "membro" } as never],
  );
  assert.equal(r!.responsavel_id, "u-1", "sem o uuid não há como reatribuir");
  assert.equal(r!.pendente, true);
  assert.equal(r!.responsavel, "Sara Lima");
});

test("tarefa concluída não é reatribuível — o cartão não pode oferecer o que a porta recusa", () => {
  const [r] = montarRegistros([], [tarefa({ status: "concluida", responsavel_id: "u-1" })], [], []);
  assert.equal(r!.pendente, false);
});

test("nota não tem responsável — o seletor nunca aparece nela", () => {
  const [r] = montarRegistros(
    [{ id: "a1", texto: "oi", autor: null, autor_id: null, criado_em: "2026-08-27T12:00:00.000Z" } as never],
    [],
    [],
    [],
  );
  assert.equal(r!.responsavel_id, null);
  assert.equal(r!.pendente, false);
});
