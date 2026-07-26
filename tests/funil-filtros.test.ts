import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FILTROS_VAZIOS,
  SEM_RESPONSAVEL,
  alternarValor,
  buscaCasa,
  contarFiltrosAtivos,
  dentroDoPeriodo,
  filtrarCards,
  haFiltro,
  opcoesResponsavel,
  opcoesTags,
} from "../lib/dados/funil-filtros.ts";
import type { CardLead } from "../lib/dados/funil.ts";

/*
 * Contrato dos filtros do funil (SPEC-FILTROS-FUNIL.md, GO 25/07): AND entre dimensões,
 * OR dentro de cada uma; período inclusivo em UTC-3 sobre entrou_etapa_em; busca por
 * telefone ignora máscara. Fixtures parciais via base() (padrão de notificacoes.test.ts).
 */

function base(sobre: Partial<CardLead> = {}): CardLead {
  return {
    lead_id: "L1",
    nome: "Maria Souza",
    idade: null,
    telefone: "+55 (31) 99981-0000",
    etapa: "novo",
    entrou_etapa_em: "2026-07-20T15:00:00.000Z",
    valor: null,
    origem: "wa",
    responsavel: null,
    tags: [],
    proposta: null,
    kommo_lead_id: null,
    ...sobre,
  };
}

// ─────────────── busca nome/telefone ───────────────

test("busca casa por nome, case-insensitive", () => {
  assert.ok(buscaCasa(base(), "maria"));
  assert.ok(buscaCasa(base(), "SOUZA"));
  assert.ok(!buscaCasa(base(), "joão"));
});

test("busca por telefone ignora máscara — '31 99981' e '99981-0000' acham '+55 (31) 99981-0000'", () => {
  assert.ok(buscaCasa(base(), "3199981"));
  assert.ok(buscaCasa(base(), "99981-0000"));
  assert.ok(buscaCasa(base(), "(31) 99981"));
  assert.ok(!buscaCasa(base(), "99999"));
});

test("query com <3 dígitos não vira busca só-dígitos — '90' não casa '(31) 99981-0000'", () => {
  // "90" não é substring literal do telefone, e os dígitos "9...0" espalhados não contam
  assert.ok(!buscaCasa(base({ nome: "Ana" }), "90"));
  // com 3+ dígitos a comparação só-dígitos liga
  assert.ok(buscaCasa(base({ nome: "Ana" }), "981-00"));
});

test("busca vazia passa tudo; nome e telefone null não explodem", () => {
  assert.ok(buscaCasa(base({ nome: null, telefone: null }), ""));
  assert.ok(!buscaCasa(base({ nome: null, telefone: null }), "maria"));
});

// ─────────────── período (entrou_etapa_em, UTC-3, inclusivo) ───────────────

test("período inclusivo nas duas pontas, no fuso da operação (UTC-3)", () => {
  // 2026-07-20 00:00 -03:00 = 03:00Z; 23:59:59.999 -03:00 = 02:59:59.999Z do dia 21
  assert.ok(dentroDoPeriodo("2026-07-20T03:00:00.000Z", "2026-07-20", "2026-07-20"));
  assert.ok(dentroDoPeriodo("2026-07-21T02:59:59.000Z", "2026-07-20", "2026-07-20"));
  assert.ok(!dentroDoPeriodo("2026-07-20T02:59:59.000Z", "2026-07-20", "2026-07-20")); // ainda dia 19 em SP
  assert.ok(!dentroDoPeriodo("2026-07-21T03:00:00.000Z", "2026-07-20", "2026-07-20"));
});

test("ponta aberta: só 'de' ou só 'até'; sem período tudo passa; sem data não casa período definido", () => {
  assert.ok(dentroDoPeriodo("2026-07-25T12:00:00Z", "2026-07-20", null));
  assert.ok(dentroDoPeriodo("2026-01-01T12:00:00Z", null, "2026-07-20"));
  assert.ok(dentroDoPeriodo(null, null, null));
  assert.ok(!dentroDoPeriodo(null, "2026-07-20", null));
});

// ─────────────── filtrarCards: OR dentro, AND entre ───────────────

const CARDS: CardLead[] = [
  base({ lead_id: "a", nome: "Maria", responsavel: { tipo: "dm", nome: "Clara" }, tags: ["SUS"], etapa: "novo" }),
  base({ lead_id: "b", nome: "João", responsavel: { tipo: "sara", nome: "Sara" }, tags: ["SUS", "Financeiro"], etapa: "proposta" }),
  base({ lead_id: "c", nome: "Pedro", responsavel: null, tags: [], etapa: "proposta", entrou_etapa_em: "2026-06-01T12:00:00Z" }),
];

test("responsável: OR entre selecionados; SEM_RESPONSAVEL casa card sem chip", () => {
  const so = (f: Partial<typeof FILTROS_VAZIOS>) => filtrarCards(CARDS, { ...FILTROS_VAZIOS, ...f }).map((c) => c.lead_id);
  assert.deepEqual(so({ responsaveis: ["Clara"] }), ["a"]);
  assert.deepEqual(so({ responsaveis: ["Clara", "Sara"] }), ["a", "b"]);
  assert.deepEqual(so({ responsaveis: [SEM_RESPONSAVEL] }), ["c"]);
});

test("tags: OR entre selecionadas; etapa filtra pela chave; dimensões combinam em AND", () => {
  const so = (f: Partial<typeof FILTROS_VAZIOS>) => filtrarCards(CARDS, { ...FILTROS_VAZIOS, ...f }).map((c) => c.lead_id);
  assert.deepEqual(so({ tags: ["Financeiro"] }), ["b"]);
  assert.deepEqual(so({ tags: ["SUS", "Financeiro"] }), ["a", "b"]); // OR
  assert.deepEqual(so({ etapas: ["proposta"] }), ["b", "c"]);
  assert.deepEqual(so({ etapas: ["proposta"], tags: ["SUS"] }), ["b"]); // AND
  assert.deepEqual(so({ etapas: ["proposta"], de: "2026-07-01", ate: null }), ["b"]); // AND com período
});

test("filtros vazios devolvem todos os cards (identidade)", () => {
  assert.equal(filtrarCards(CARDS, FILTROS_VAZIOS).length, CARDS.length);
});

// ─────────────── facetas e contadores ───────────────

test("opcoesResponsavel: contagem real, mais leads primeiro, 'Sem responsável' por último", () => {
  const ops = opcoesResponsavel([...CARDS, base({ lead_id: "d", responsavel: { tipo: "dm", nome: "Clara" } })]);
  assert.deepEqual(
    ops.map((o) => [o.valor, o.qtd]),
    [["Clara", 2], ["Sara", 1], [SEM_RESPONSAVEL, 1]],
  );
  assert.equal(ops.at(-1)!.rotulo, "Sem responsável");
});

test("opcoesTags: dedupe com contagem, mais usadas primeiro; sem tags = sem opções", () => {
  assert.deepEqual(
    opcoesTags(CARDS).map((o) => [o.valor, o.qtd]),
    [["SUS", 2], ["Financeiro", 1]],
  );
  assert.deepEqual(opcoesTags([base({ tags: [] })]), []);
});

test("contarFiltrosAtivos conta DIMENSÕES do painel (badge); haFiltro inclui a busca", () => {
  assert.equal(contarFiltrosAtivos(FILTROS_VAZIOS), 0);
  assert.equal(contarFiltrosAtivos({ ...FILTROS_VAZIOS, tags: ["SUS", "FORA"], de: "2026-07-01", ate: null }), 2);
  assert.ok(!haFiltro(FILTROS_VAZIOS));
  assert.ok(haFiltro({ ...FILTROS_VAZIOS, busca: "  maria " }));
  assert.ok(!haFiltro({ ...FILTROS_VAZIOS, busca: "   " })); // espaço não é filtro
});

test("alternarValor liga/desliga sem mutar a lista original", () => {
  const l = ["SUS"];
  assert.deepEqual(alternarValor(l, "FORA"), ["SUS", "FORA"]);
  assert.deepEqual(alternarValor(l, "SUS"), []);
  assert.deepEqual(l, ["SUS"]);
});
