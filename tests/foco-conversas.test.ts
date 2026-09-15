import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./apoio/resolucao-alias.mjs", import.meta.url);

import type { TarefaVisao } from "../lib/dados/tarefas-visao-calculos.ts";

// `lib/tarefas/foco.ts` usa o alias `@/` — entra DEPOIS do hook (import estático é içado)
const { focoDasTarefas, estadoDoPrazo } = await import("../lib/tarefas/foco.ts");

/*
 * O MODO FOCO — o bug de 14/09, e a fronteira que ele atravessa.
 *
 * `focoDasTarefas` sempre esteve certa e sempre teve teste implícito pela fixture de ensaio. O que
 * faltava era a costura: a LEITURA REAL (`lib/dados/tarefas-visao.ts`) não pedia `conversa_id` ao
 * banco, e o foco descarta toda tarefa sem âncora. Resultado medido em produção: 2 tarefas
 * pendentes do admin, as duas ancoradas em `core.tarefa.conversa_id`, e o raio abrindo nada.
 *
 * Por isso os testes abaixo são de DOIS tipos, e o segundo é o que pegaria o bug:
 *  · comportamento da função pura (com linhas no formato que a leitura real produz);
 *  · CONTRATO da consulta — a lista de colunas tem de conter o que a função exige.
 * Teste de função pura com fixture nunca veria isto: a fixture preenchia o campo que o banco não
 * estava mandando.
 */

const AGORA = new Date("2026-09-14T22:00:00.000Z");
const EU = "bf71ce15-f6e9-43f1-be81-1ca7f12ec3da";

function tarefa(sobrescreve: Partial<TarefaVisao>): TarefaVisao {
  return {
    id: "t1",
    lead_id: "45361ea0-0993-5be8-923a-d667237ef996",
    lead_nome: "Rosiane",
    titulo: "Validar tarefas",
    descricao: null,
    tipo: null,
    responsavel: null,
    responsavel_id: EU,
    prazo: "2026-09-16T01:03:00.000Z",
    status: "pendente",
    resultado: null,
    motivo_arquivo: null,
    criado_em: "2026-09-14T20:00:00.000Z",
    concluida_em: null,
    vencida: false,
    por_que: null,
    fazer: null,
    trecho: null,
    origem: null,
    conversa_id: "781e5050-947b-d7f7-c44d-d4bba9943baf",
    ...sobrescreve,
  };
}

test("as tarefas ancoradas da pessoa viram linha no foco", () => {
  const linhas = focoDasTarefas([tarefa({})], EU, {}, AGORA);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].conversa_id, "781e5050-947b-d7f7-c44d-d4bba9943baf");
  assert.equal(linhas[0].tarefa.titulo, "Validar tarefas");
});

test("duas tarefas na MESMA conversa dão UMA linha, com a outra contada", () => {
  // o caso real de 14/09: as duas pendentes do admin apontam para a mesma conversa
  const linhas = focoDasTarefas(
    [tarefa({}), tarefa({ id: "t2", titulo: "crie para rz a tarefa de acompanhar", prazo: null })],
    EU,
    {},
    AGORA,
  );
  assert.equal(linhas.length, 1, "uma conversa entra uma vez");
  assert.equal(linhas[0].outras, 1, "a outra tarefa do mesmo lead é contada, não somem nem duplicam");
});

test("tarefa SEM conversa ancorada não entra — e é por isso que a coluna importa", () => {
  assert.equal(focoDasTarefas([tarefa({ conversa_id: null })], EU, {}, AGORA).length, 0);
  assert.equal(focoDasTarefas([tarefa({ conversa_id: undefined })], EU, {}, AGORA).length, 0);
});

test("tarefa de outra pessoa não entra no meu foco; com incluirTime, entra", () => {
  const deOutro = [tarefa({ responsavel_id: "d855f25a-c6b3-410f-8196-5ccee44dc475" })];
  assert.equal(focoDasTarefas(deOutro, EU, {}, AGORA).length, 0);
  assert.equal(focoDasTarefas(deOutro, EU, { incluirTime: true }, AGORA).length, 1);
});

test("tarefa concluída não entra", () => {
  assert.equal(focoDasTarefas([tarefa({ status: "concluida" })], EU, {}, AGORA).length, 0);
});

test("vencida vem antes de hoje, e hoje antes de futura", () => {
  const linhas = focoDasTarefas(
    [
      tarefa({ id: "f", conversa_id: "c-futura", prazo: "2026-09-20T12:00:00.000Z" }),
      tarefa({ id: "v", conversa_id: "c-vencida", vencida: true, prazo: "2026-09-13T12:00:00.000Z" }),
      tarefa({ id: "h", conversa_id: "c-hoje", prazo: "2026-09-14T23:30:00.000Z" }),
    ],
    EU,
    {},
    AGORA,
  );
  assert.deepEqual(
    linhas.map((l) => l.conversa_id),
    ["c-vencida", "c-hoje", "c-futura"],
  );
  assert.equal(estadoDoPrazo({ prazo: "2026-09-14T23:30:00.000Z", vencida: false }, AGORA.getTime()), "hoje");
});

/*
 * O CONTRATO DA CONSULTA — o teste que faltava.
 *
 * `focoDasTarefas` exige `conversa_id`, `responsavel_id` e `status`. Se a leitura real não pedir
 * essas colunas ao banco, o foco fica vazio SEM ERRO: a função recebe `undefined` e descarta,
 * exatamente como se não houvesse tarefa nenhuma. É a falha que passou por teste verde.
 */
const FONTE_LEITURA = readFileSync(new URL("../lib/dados/tarefas-visao.ts", import.meta.url), "utf8");

test("as três listas de colunas pedem tudo que o foco exige", () => {
  const listas = [...FONTE_LEITURA.matchAll(/const (COLS_[A-Z0-9_]+) =\s*\n?\s*"([^"]+)"/g)];
  assert.equal(listas.length, 3, "mudou o número de fontes de leitura — revise este contrato");
  for (const [, nome, colunas] of listas) {
    const campos = colunas.split(",");
    for (const exigido of ["conversa_id", "responsavel_id", "status"]) {
      assert.ok(campos.includes(exigido), `${nome} não pede "${exigido}" — o modo foco fica vazio em silêncio`);
    }
  }
});

test("a leitura real MAPEIA conversa_id para o objeto — pedir sem mapear dá no mesmo", () => {
  assert.match(FONTE_LEITURA, /conversa_id:\s*r\.conversa_id/);
});

test("o selo do raio conta CONVERSAS distintas, não tarefas", () => {
  // duas tarefas na mesma conversa têm de valer 1 no selo, senão o número não bate com a lista
  assert.match(FONTE_LEITURA, /new Set\(\(data \?\? \[\]\)\.map\(\(r: any\) => String\(r\.conversa_id\)\)\)\.size/);
});
