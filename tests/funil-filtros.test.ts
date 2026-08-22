import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FILTROS_VAZIOS,
  SEM_RESPONSAVEL,
  alternarValor,
  buscaCasa,
  contarFiltrosAtivos,
  dentroDoPeriodo,
  contarSemProximaAcao,
  filtrarCards,
  haFiltro,
  opcoesResponsavel,
  opcoesTags,
} from "../lib/dados/funil-filtros.ts";
import type { CardLead } from "../lib/dados/funil.ts";
import type { FaixaPrioridade } from "../lib/dados/funil-ordenacao.ts";

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
    dono_id: null,
    dono_nome: null,
    tags: [],
    proposta: null,
    kommo_lead_id: null,
    // R20 — o card do fixture TEM próxima ação por padrão: assim o teste do filtro "sem próxima
    // ação" precisa dizer explicitamente `false` para casar, e nenhum teste antigo muda de
    // resultado por causa de um default silencioso.
    tem_tarefa_pendente: true,
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

// ─────────────── meus leads (0060 — vínculo por uuid, nunca por nome) ───────────────

const UID = "00000000-0000-4000-8000-000000000161";
const CARDS_DONO: CardLead[] = [
  base({ lead_id: "m1", dono_id: UID, dono_nome: "Membro Sessenta" }),
  base({ lead_id: "m2", dono_id: "99999999-0000-4000-8000-000000000099", dono_nome: "Outra Pessoa" }),
  base({ lead_id: "m3", dono_id: null, responsavel: { tipo: "dm", nome: "Clara" } }),
];

test("meus leads corta por dono_id === uuid do logado; legado por nome NÃO entra", () => {
  const meus = filtrarCards(CARDS_DONO, { ...FILTROS_VAZIOS, meus: true }, UID);
  assert.deepEqual(meus.map((c) => c.lead_id), ["m1"]);
});

test("meus leads sem usuário logado não casa nada (não inventar carteira)", () => {
  assert.deepEqual(filtrarCards(CARDS_DONO, { ...FILTROS_VAZIOS, meus: true }, null), []);
  assert.equal(filtrarCards(CARDS_DONO, FILTROS_VAZIOS, null).length, 3); // desligado, tudo passa
});

test("meus leads combina em AND com as demais dimensões e conta em haFiltro", () => {
  const cards = [...CARDS_DONO, base({ lead_id: "m4", dono_id: UID, etapa: "proposta" })];
  const meusProposta = filtrarCards(cards, { ...FILTROS_VAZIOS, meus: true, etapas: ["proposta"] }, UID);
  assert.deepEqual(meusProposta.map((c) => c.lead_id), ["m4"]);
  assert.ok(haFiltro({ ...FILTROS_VAZIOS, meus: true }));
  assert.equal(contarFiltrosAtivos({ ...FILTROS_VAZIOS, meus: true }), 0); // chip próprio, fora do badge do painel
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

// ─────────────── R20 · sem próxima ação ───────────────

test("R20 · filtro sem-próxima-ação passa só quem NÃO tem tarefa pendente", () => {
  const cards = [
    base({ lead_id: "com", tem_tarefa_pendente: true }),
    base({ lead_id: "sem", tem_tarefa_pendente: false }),
  ];
  const r = filtrarCards(cards, { ...FILTROS_VAZIOS, semProximaAcao: true });
  assert.deepEqual(r.map((c) => c.lead_id), ["sem"]);
});

test("R20 · leitura de tarefas indisponível (null) NÃO acusa o lead — o card passa", () => {
  // discrimina: o defeito que este teste mira é "filtro engole card por falha de leitura",
  // que esconderia justamente o lead que o filtro existe para achar.
  const cards = [base({ lead_id: "desconhecido", tem_tarefa_pendente: null })];
  assert.equal(filtrarCards(cards, { ...FILTROS_VAZIOS, semProximaAcao: true }).length, 0);
  assert.equal(filtrarCards(cards, FILTROS_VAZIOS).length, 1);
});

test("R20 · sem-próxima-ação combina com as outras dimensões por AND", () => {
  const cards = [
    base({ lead_id: "a", etapa: "novo", tem_tarefa_pendente: false }),
    base({ lead_id: "b", etapa: "qualificado", tem_tarefa_pendente: false }),
  ];
  const r = filtrarCards(cards, { ...FILTROS_VAZIOS, semProximaAcao: true, etapas: ["qualificado"] });
  assert.deepEqual(r.map((c) => c.lead_id), ["b"]);
});

test("R20 · contarSemProximaAcao devolve null se QUALQUER card for desconhecido", () => {
  assert.equal(
    contarSemProximaAcao([base({ tem_tarefa_pendente: false }), base({ tem_tarefa_pendente: null })]),
    null,
  );
  assert.equal(
    contarSemProximaAcao([base({ tem_tarefa_pendente: false }), base({ tem_tarefa_pendente: true })]),
    1,
  );
  assert.equal(contarSemProximaAcao([]), 0);
});

test("R20 · sem-próxima-ação conta como filtro ativo no cabeçalho", () => {
  assert.ok(haFiltro({ ...FILTROS_VAZIOS, semProximaAcao: true }));
  assert.ok(!haFiltro(FILTROS_VAZIOS));
});

// ─────────────── R23/W2 · "só os estourados" ───────────────

/*
 * O chip existe porque a cor sozinha informa e não ajuda a escolher: o board tem 97 cards e a
 * Sarah tem meia manhã. E ele é PURO de propósito — o filtro não sabe calcular faixa, recebe de
 * fora quem sabe (o board, que leu `sla_etapas`). Sem esse contrato, o limiar que D55 tirou do
 * código voltaria a existir aqui dentro, numa segunda cópia.
 */

test("R23/W2 · 'só os estourados' recorta pela faixa AGORA, e a faixa vem de FORA", () => {
  const quente = base({ lead_id: "quente" });
  const morno = base({ lead_id: "morno" });
  const faixaDe = (c: CardLead): FaixaPrioridade => (c.lead_id === "quente" ? "agora" : "sem_pressa");

  const r = filtrarCards([quente, morno], { ...FILTROS_VAZIOS, soAgora: true }, null, faixaDe);
  assert.deepEqual(r.map((c) => c.lead_id), ["quente"]);
  // desligado, ninguém some
  assert.equal(filtrarCards([quente, morno], FILTROS_VAZIOS, null, faixaDe).length, 2);
});

test("R23/W2 · sem `faixaDe`, o filtro NÃO recorta — não afirma urgência que não mediu", () => {
  // é o caso do chamador que não leu a config: o chip nem aparece na tela, e se `soAgora` chegar
  // ligado assim mesmo, engolir cards por uma faixa não calculada esconderia justamente o lead
  // que o filtro existe para achar.
  const r = filtrarCards([base({ lead_id: "a" }), base({ lead_id: "b" })], { ...FILTROS_VAZIOS, soAgora: true });
  assert.equal(r.length, 2);
});

test("R23/W2 · 'só os estourados' combina em AND e conta como filtro ativo no cabeçalho", () => {
  const faixaDe = (): FaixaPrioridade => "agora";
  const comTag = base({ lead_id: "com", tags: ["SUS"] });
  const semTag = base({ lead_id: "sem", tags: [] });
  const r = filtrarCards([comTag, semTag], { ...FILTROS_VAZIOS, soAgora: true, tags: ["SUS"] }, null, faixaDe);
  assert.deepEqual(r.map((c) => c.lead_id), ["com"]);

  assert.ok(haFiltro({ ...FILTROS_VAZIOS, soAgora: true }));
  // chip próprio, fora do painel: não infla o badge de "N filtros" (mesma regra de `meus`)
  assert.equal(contarFiltrosAtivos({ ...FILTROS_VAZIOS, soAgora: true }), 0);
});
