import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agrupar,
  aplicarFiltros,
  bucketPrazo,
  contadores,
  diasAteDomingoSP,
  diffDiasSP,
  ordenarLista,
  parseFiltros,
  serializarFiltros,
  temFiltroAtivo,
  FILTROS_PADRAO,
  type FiltrosTarefas,
  type TarefaVisao,
} from "../lib/dados/tarefas-visao-calculos.ts";

/*
 * Rodada 14 — visão de tarefas (/tarefas). O funil aqui é o TEMPO, e o bucket é calculado no
 * calendário de São Paulo: prazo é compromisso local, não UTC. `vencida` vem derivada do
 * banco (core.v_tarefa) — estes testes tratam a flag como dado, nunca a recalculam.
 */

// quarta 22/07/2026, 12:00 em São Paulo (15:00Z). Domingo está a 4 dias.
const AGORA = Date.parse("2026-07-22T15:00:00.000Z");

function tarefa(sobrescreve: Partial<TarefaVisao>): TarefaVisao {
  return {
    id: "t1",
    lead_id: "lead-1",
    lead_nome: "Maria Souza",
    titulo: "Confirmar retorno",
    descricao: null,
    tipo: null,
    responsavel: null,
    responsavel_id: null,
    prazo: null,
    status: "pendente",
    resultado: null,
    motivo_arquivo: null,
    criado_em: "2026-07-20T12:00:00.000Z",
    concluida_em: null,
    vencida: false,
    ...sobrescreve,
  };
}

function filtros(sobrescreve: Partial<FiltrosTarefas>): FiltrosTarefas {
  return { ...FILTROS_PADRAO, ...sobrescreve };
}

// ─────────────── dias em São Paulo ───────────────

test("diffDiasSP conta dias no calendário de SP, não no de UTC", () => {
  // 23/07 01:30Z ainda é 22/07 22:30 em SP → mesmo dia, não amanhã
  assert.equal(diffDiasSP("2026-07-23T01:30:00.000Z", AGORA), 0);
  assert.equal(diffDiasSP("2026-07-23T12:00:00.000Z", AGORA), 1);
  assert.equal(diffDiasSP("2026-07-21T12:00:00.000Z", AGORA), -1);
  assert.equal(diffDiasSP("data-inválida", AGORA), null);
});

test("diasAteDomingoSP: quarta → 4; domingo → 0", () => {
  assert.equal(diasAteDomingoSP(AGORA), 4);
  const domingo = Date.parse("2026-07-26T15:00:00.000Z");
  assert.equal(diasAteDomingoSP(domingo), 0);
});

// ─────────────── buckets (as colunas do funil do tempo) ───────────────

test("bucketPrazo: a flag vencida do banco manda — não recalculamos o predicado", () => {
  const t = tarefa({ prazo: "2026-07-22T13:00:00.000Z", vencida: true });
  assert.equal(bucketPrazo(t, AGORA), "vencidas");
});

test("bucketPrazo: hoje, amanhã, esta semana, depois e sem prazo", () => {
  assert.equal(bucketPrazo(tarefa({ prazo: "2026-07-22T20:00:00.000Z" }), AGORA), "hoje");
  assert.equal(bucketPrazo(tarefa({ prazo: "2026-07-23T12:00:00.000Z" }), AGORA), "amanha");
  // sexta 24/07 e domingo 26/07 cabem em "esta semana" (domingo a 4 dias da quarta)
  assert.equal(bucketPrazo(tarefa({ prazo: "2026-07-24T12:00:00.000Z" }), AGORA), "semana");
  assert.equal(bucketPrazo(tarefa({ prazo: "2026-07-26T12:00:00.000Z" }), AGORA), "semana");
  // segunda 27/07 já é outra semana
  assert.equal(bucketPrazo(tarefa({ prazo: "2026-07-27T12:00:00.000Z" }), AGORA), "depois");
  assert.equal(bucketPrazo(tarefa({ prazo: null }), AGORA), "sem_prazo");
});

test("bucketPrazo: prazo hoje mais tarde NÃO é vencida — vencer é hora, não dia", () => {
  const t = tarefa({ prazo: "2026-07-22T22:00:00.000Z", vencida: false });
  assert.equal(bucketPrazo(t, AGORA), "hoje");
});

// ─────────────── filtros ───────────────

const MEU_ID = "uuid-diogo";
const BASE = [
  tarefa({ id: "a", status: "pendente", responsavel_id: MEU_ID, prazo: "2026-07-21T12:00:00.000Z", vencida: true, tipo: "confirmar_consulta" }),
  tarefa({ id: "b", status: "pendente", responsavel_id: "uuid-sara", prazo: "2026-07-22T20:00:00.000Z" }),
  tarefa({ id: "c", status: "pendente", responsavel_id: null, prazo: null, tipo: "pos_venda" }),
  tarefa({ id: "d", status: "concluida", responsavel_id: MEU_ID, concluida_em: "2026-07-21T10:00:00.000Z", resultado: "não atendeu" }),
  tarefa({ id: "e", status: "arquivada", responsavel_id: "uuid-sara" }),
];

const ids = (ts: TarefaVisao[]) => ts.map((t) => t.id);

test("status: abertas é o default; concluídas e arquivadas são recortes próprios", () => {
  assert.deepEqual(ids(aplicarFiltros(BASE, filtros({}), MEU_ID, AGORA)), ["a", "b", "c"]);
  assert.deepEqual(ids(aplicarFiltros(BASE, filtros({ status: "concluidas" }), MEU_ID, AGORA)), ["d"]);
  assert.deepEqual(ids(aplicarFiltros(BASE, filtros({ status: "arquivadas" }), MEU_ID, AGORA)), ["e"]);
});

test("minhas tarefas corta por responsavel_id = eu; sem sessão não passa nada", () => {
  assert.deepEqual(ids(aplicarFiltros(BASE, filtros({ minhas: true }), MEU_ID, AGORA)), ["a"]);
  assert.deepEqual(ids(aplicarFiltros(BASE, filtros({ minhas: true }), null, AGORA)), []);
});

test("vencidas é a fila vermelha do Kommo — só o que o banco marcou", () => {
  assert.deepEqual(ids(aplicarFiltros(BASE, filtros({ vencidas: true }), MEU_ID, AGORA)), ["a"]);
});

test("responsável e tipo cortam exato", () => {
  assert.deepEqual(ids(aplicarFiltros(BASE, filtros({ responsavelId: "uuid-sara" }), MEU_ID, AGORA)), ["b"]);
  assert.deepEqual(ids(aplicarFiltros(BASE, filtros({ tipo: "pos_venda" }), MEU_ID, AGORA)), ["c"]);
});

test("prazo é recorte CUMULATIVO: 'hoje' inclui o já vencido; 'sem prazo' é só sem prazo", () => {
  assert.deepEqual(ids(aplicarFiltros(BASE, filtros({ prazo: "hoje" }), MEU_ID, AGORA)), ["a", "b"]);
  assert.deepEqual(ids(aplicarFiltros(BASE, filtros({ prazo: "sem_prazo" }), MEU_ID, AGORA)), ["c"]);
});

// ─────────────── ordenação e agrupamento ───────────────

test("lista aberta: mais atrasada primeiro, sem prazo por último", () => {
  const abertas = aplicarFiltros(BASE, filtros({}), MEU_ID, AGORA);
  assert.deepEqual(ids(ordenarLista(abertas, "abertas")), ["a", "b", "c"]);
});

test("histórico: desfecho mais recente primeiro", () => {
  const duas = [
    tarefa({ id: "velha", status: "concluida", concluida_em: "2026-07-10T10:00:00.000Z" }),
    tarefa({ id: "nova", status: "concluida", concluida_em: "2026-07-21T10:00:00.000Z" }),
  ];
  assert.deepEqual(ids(ordenarLista(duas, "concluidas")), ["nova", "velha"]);
});

test("agrupar por prazo: as 6 colunas são FIXAS (o vazio também informa) e só Vencidas é vermelha", () => {
  const abertas = aplicarFiltros(BASE, filtros({}), MEU_ID, AGORA);
  const grupos = agrupar(abertas, filtros({}), AGORA, { membros: new Map(), tipos: new Map() });
  assert.deepEqual(
    grupos.map((g) => g.chave),
    ["vencidas", "hoje", "amanha", "semana", "depois", "sem_prazo"],
  );
  assert.deepEqual(grupos.map((g) => g.vermelho), [true, false, false, false, false, false]);
  assert.deepEqual(ids(grupos[0].tarefas), ["a"]);
  assert.deepEqual(ids(grupos[1].tarefas), ["b"]);
  assert.deepEqual(ids(grupos[5].tarefas), ["c"]);
});

test("agrupar por responsável: maiores primeiro, 'Sem responsável' no fim, nome vem do mapa", () => {
  const abertas = aplicarFiltros(BASE, filtros({}), MEU_ID, AGORA);
  const grupos = agrupar(abertas, filtros({ agrupamento: "responsavel" }), AGORA, {
    membros: new Map([[MEU_ID, "Diogo"]]),
    tipos: new Map(),
  });
  assert.equal(grupos[0].rotulo, "Diogo");
  assert.equal(grupos[1].rotulo, "Outro membro"); // uuid-sara sem nome resolvido
  assert.equal(grupos.at(-1)!.rotulo, "Sem responsável");
  assert.ok(grupos.every((g) => !g.vermelho));
});

test("agrupar por tipo: rótulo da config; chave sem rótulo aparece crua, nunca some", () => {
  const abertas = aplicarFiltros(BASE, filtros({}), MEU_ID, AGORA);
  const grupos = agrupar(abertas, filtros({ agrupamento: "tipo" }), AGORA, {
    membros: new Map(),
    tipos: new Map([["confirmar_consulta", "Confirmar consulta"]]),
  });
  const rotulos = grupos.map((g) => g.rotulo);
  assert.ok(rotulos.includes("Confirmar consulta"));
  assert.ok(rotulos.includes("pos_venda"));
  assert.equal(rotulos.at(-1), "Sem tipo");
});

// ─────────────── contadores e URL ───────────────

test("contadores honestos: abertas, vencidas, concluídas, arquivadas", () => {
  assert.deepEqual(contadores(BASE), { abertas: 3, vencidas: 1, concluidas: 1, arquivadas: 1 });
});

test("URL ⇄ filtros: padrão vira URL vazia; ida e volta preserva tudo", () => {
  assert.equal(serializarFiltros(FILTROS_PADRAO), "");
  assert.equal(temFiltroAtivo(FILTROS_PADRAO), false);

  const f = filtros({
    exibicao: "lista",
    agrupamento: "responsavel",
    minhas: true,
    status: "concluidas",
    vencidas: true,
    prazo: "hoje",
    tipo: "pos_venda",
  });
  const qs = serializarFiltros(f);
  const volta = parseFiltros(Object.fromEntries(new URLSearchParams(qs)));
  assert.deepEqual(volta, f);
  assert.equal(temFiltroAtivo(f), true);
});

test("parseFiltros ignora lixo na URL — valor desconhecido cai no padrão", () => {
  const f = parseFiltros({ ver: "3d", status: "tudo", prazo: "ontem", agrupar: "cor" });
  assert.deepEqual(f, FILTROS_PADRAO);
});
