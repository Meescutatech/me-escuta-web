import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./apoio/resolucao-alias.mjs", import.meta.url);

/*
 * ── TÓPICO ÚNICO: os três eixos, e o que cada um custou ───────────────────────────────────────
 *
 * O defeito original (22/08): `RealtimeClient.channel(topico)` NÃO cria canal novo quando o tópico
 * já existe — devolve o EXISTENTE. E `RealtimeChannel.on()` LANÇA quando o canal já está
 * `isJoined()||isJoining()` (RealtimeChannel.js:413-419). Na /tarefas o sino e a VisaoTarefas
 * pediam a mesma `core.tarefa` e calculavam o mesmo tópico; a segunda instância morria e o tempo
 * real de tarefa nunca existiu.
 *
 * O primeiro conserto pôs instância+rodada no tópico. Fecha ENTRE instâncias e ENTRE rodadas, e
 * deixa aberta a colisão DENTRO da mesma rodada — duas fontes iguais no mesmo array. Nesse caso o
 * `catch` do laço chama `removeChannel` sobre o canal que a PRIMEIRA fonte já tinha assinado (é o
 * mesmo objeto): as duas ficam sem tempo real e o selo acusa uma só.
 *
 * Os testes abaixo cobrem os três eixos. Sem o índice no tópico, o primeiro FALHA.
 */

const TAREFA = { tabela: { schema: "core", table: "tarefa" } };
const MENCAO = { tabela: { schema: "core", table: "mencao" } };

test("duas fontes IGUAIS na mesma rodada recebem tópicos DISTINTOS (o eixo que faltava)", async () => {
  const { topicosDaRodada } = await import("../components/projecao-viva.ts");

  const plano = topicosDaRodada([TAREFA, TAREFA], "r1abc", 1);

  assert.equal(plano.length, 2);
  assert.notEqual(
    plano[0].topico,
    plano[1].topico,
    "tópicos iguais fazem o 2º .on() lançar e o catch derrubar o canal do 1º — as DUAS fontes mudas",
  );
  // o rótulo LEGÍVEL continua o mesmo nas duas: é o que aparece no console e no selo
  assert.equal(plano[0].nome, "pg:core.tarefa:*");
  assert.equal(plano[1].nome, "pg:core.tarefa:*");
});

test("INVARIANTE: qualquer lista de fontes produz tópicos todos distintos", async () => {
  const { topicosDaRodada } = await import("../components/projecao-viva.ts");

  const listas = [
    [TAREFA, TAREFA, TAREFA],
    [TAREFA, MENCAO, TAREFA], // o par real do sino, com a repetição no meio
    [{ canal: "lead:123" }, { canal: "lead:123" }],
    [{ tabela: { schema: "core", table: "mensagem", filter: "conversa_id=eq.7" } },
     { tabela: { schema: "core", table: "mensagem", filter: "conversa_id=eq.7" } }],
    [],
  ];
  for (const lista of listas) {
    const topicos = topicosDaRodada(lista, "inst", 3).map((p) => p.topico);
    assert.equal(new Set(topicos).size, topicos.length, `colisão em ${JSON.stringify(lista)}`);
  }
});

test("o eixo INSTÂNCIA: sino e /tarefas pedem core.tarefa e não colidem", async () => {
  const { topicosDaRodada } = await import("../components/projecao-viva.ts");
  // reprodução do caso medido em 22/08: o sino (mencao+tarefa) monta no header de toda tela
  const sino = topicosDaRodada([MENCAO, TAREFA], "sinoID", 1).map((p) => p.topico);
  const visao = topicosDaRodada([TAREFA], "visaoID", 1).map((p) => p.topico);
  assert.equal(new Set([...sino, ...visao]).size, 3);
});

test("o eixo RODADA: remontar a mesma instância não reusa o tópico que ainda está saindo", async () => {
  const { topicosDaRodada } = await import("../components/projecao-viva.ts");
  // `removeChannel()` é assíncrono: o canal da rodada 1 ainda está em socket.channels quando a 2 abre
  const r1 = topicosDaRodada([TAREFA], "mesmaInst", 1)[0].topico;
  const r2 = topicosDaRodada([TAREFA], "mesmaInst", 2)[0].topico;
  assert.notEqual(r1, r2);
});

test("o rótulo legível NÃO carrega instância/rodada/índice — é o que o operador lê no selo", async () => {
  const { rotuloDaFonte } = await import("../components/projecao-viva.ts");
  assert.equal(rotuloDaFonte(TAREFA), "pg:core.tarefa:*");
  assert.equal(
    rotuloDaFonte({ tabela: { schema: "core", table: "mensagem", filter: "conversa_id=eq.7" } }),
    "pg:core.mensagem:conversa_id=eq.7",
  );
  assert.equal(rotuloDaFonte({ canal: "lead:123" }), "lead:123");
});
