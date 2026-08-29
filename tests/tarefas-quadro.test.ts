import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLUNAS,
  acaoPorTecla,
  agruparPorLead,
  colunaDe,
  distribuir,
  proximaColuna,
  proximoIndice,
  reconciliar,
  transicao,
  type TarefaQuadro,
} from "../lib/tarefas/quadro.ts";

/*
 * Quadro por status (F8 · 0305). O que se prova: a coluna é DERIVADA (status + iniciada_em, nunca
 * um 4º status), toda transição vira a sequência certa de eventos que a porta conhece, concluir
 * nunca é imediato (pede resultado), o otimista reconcilia quando a verdade chega, e o teclado
 * manda para a coluna certa.
 */

function t(p: Partial<TarefaQuadro> & { id: string }): TarefaQuadro {
  return {
    lead_id: null,
    lead_nome: null,
    status: "pendente",
    prazo: null,
    vencida: false,
    criado_em: "2026-08-27T10:00:00Z",
    concluida_em: null,
    ...p,
  };
}

test("coluna derivada: pendente+iniciada = em andamento; concluída; arquivada fica fora", () => {
  const andamento = new Set(["b"]);
  assert.equal(colunaDe(t({ id: "a" }), andamento), "a_fazer");
  assert.equal(colunaDe(t({ id: "b" }), andamento), "em_andamento");
  assert.equal(colunaDe(t({ id: "c", status: "concluida" }), andamento), "concluida");
  assert.equal(colunaDe(t({ id: "d", status: "arquivada" }), andamento), null);
  // concluída que por acaso ainda tem iniciada_em no conjunto: concluída manda
  assert.equal(colunaDe(t({ id: "b", status: "concluida" }), andamento), "concluida");
});

test("transições: cada arrasto vira os eventos certos, e concluir sempre pede resultado", () => {
  assert.equal(transicao("a_fazer", "a_fazer"), null);
  assert.deepEqual(transicao("a_fazer", "em_andamento"), { eventos: ["tarefa_iniciada"], pedeResultado: false });
  assert.deepEqual(transicao("em_andamento", "a_fazer"), { eventos: ["tarefa_reaberta"], pedeResultado: false });
  assert.deepEqual(transicao("concluida", "a_fazer"), { eventos: ["tarefa_reaberta"], pedeResultado: false });
  assert.deepEqual(transicao("concluida", "em_andamento"), {
    eventos: ["tarefa_reaberta", "tarefa_iniciada"],
    pedeResultado: false,
  });
  for (const de of ["a_fazer", "em_andamento"] as const) {
    const tr = transicao(de, "concluida");
    assert.ok(tr && tr.pedeResultado, `${de} → concluída pede resultado (0037: o desfecho é o dado)`);
    assert.deepEqual(tr.eventos, ["tarefa_concluida"]);
  }
});

test("distribuir: overrides otimistas vencem a derivação; abertas por vencida→prazo, concluídas por recência", () => {
  const lista = [
    t({ id: "a", prazo: "2026-09-01T10:00:00Z" }),
    t({ id: "b", prazo: "2026-08-01T10:00:00Z", vencida: true }),
    t({ id: "c" }),
    t({ id: "d", status: "concluida", concluida_em: "2026-08-20T10:00:00Z" }),
    t({ id: "e", status: "concluida", concluida_em: "2026-08-25T10:00:00Z" }),
  ];
  const r = distribuir(lista, new Set(["c"]), new Map([["a", "em_andamento"]]));
  assert.deepEqual(r.a_fazer.map((x) => x.id), ["b"]);
  assert.deepEqual(r.em_andamento.map((x) => x.id), ["a", "c"], "override manda a antes; sem prazo por último");
  assert.deepEqual(r.concluida.map((x) => x.id), ["e", "d"], "mais recente primeiro");
});

test("reconciliar: override some quando o servidor já reflete, ou quando a tarefa sumiu", () => {
  const overrides = new Map<string, "a_fazer" | "em_andamento" | "concluida">([
    ["a", "em_andamento"], // servidor já tem iniciada_em → sai
    ["b", "concluida"], // servidor ainda pendente → fica
    ["z", "concluida"], // não está na leitura → sai
  ]);
  const vivo = reconciliar(overrides, [t({ id: "a" }), t({ id: "b" })], new Set(["a"]));
  assert.deepEqual([...vivo.entries()], [["b", "concluida"]]);
});

test("agrupar por lead: preserva ordem, junta pelo lead, sem lead vai para o fim", () => {
  const g = agruparPorLead([
    t({ id: "1", lead_id: "L1", lead_nome: "Maria" }),
    t({ id: "2" }),
    t({ id: "3", lead_id: "L2", lead_nome: null }),
    t({ id: "4", lead_id: "L1", lead_nome: "Maria" }),
  ]);
  assert.deepEqual(
    g.map((x) => [x.rotulo, x.tarefas.map((y) => y.id)]),
    [
      ["Maria", ["1", "4"]],
      ["Lead sem nome", ["3"]],
      ["Sem lead", ["2"]],
    ],
  );
});

test("teclado: E/C/V mandam para a coluna, sem ação quando já está lá; navegação é circular", () => {
  assert.equal(acaoPorTecla("e", "a_fazer"), "em_andamento");
  assert.equal(acaoPorTecla("E", "em_andamento"), null);
  assert.equal(acaoPorTecla("c", "a_fazer"), "concluida");
  assert.equal(acaoPorTecla("v", "concluida"), "a_fazer");
  assert.equal(acaoPorTecla("x", "a_fazer"), null);
  assert.equal(proximoIndice(-1, 1, 3), 0);
  assert.equal(proximoIndice(-1, -1, 3), 2);
  assert.equal(proximoIndice(2, 1, 3), 0);
  assert.equal(proximoIndice(0, -1, 3), 2);
  assert.equal(proximoIndice(0, 1, 0), -1);
  assert.equal(proximaColuna("concluida", 1), "a_fazer");
  assert.equal(proximaColuna("a_fazer", -1), "concluida");
  assert.equal(COLUNAS.length, 3);
});
