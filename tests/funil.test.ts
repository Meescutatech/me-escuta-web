import { test } from "node:test";
import assert from "node:assert/strict";
import { TETO_CARDS, chavesDoBoard, houveCorte } from "../lib/dados/funil-calculos.ts";

/*
 * Testes da lógica pura do board (conserto do verificador, Rodada 7): a leitura de cards
 * filtra pelas chaves da config vigente e NUNCA descarta silenciosamente ao bater no teto.
 */

/*
 * ── R23 · a régua que mentia ─────────────────────────────────────────────────────────────────
 *
 * A versão anterior deste bloco tinha uma fixture de 7 etapas INVENTADAS ("novo", "qualificando",
 * "avaliacao"…) e afirmava no nome do teste que "'arquivado' nunca entra no filtro". A afirmação
 * era verdadeira sobre a fixture e falsa sobre a produção: `chavesDoBoard` era um `.map` de TODAS
 * as chaves, e a config vigente ganhou uma 15ª etapa `arquivado` com 582 dos 679 leads. O teste
 * passava; o board carregava os 582. Fixture imaginada não é régua — é a mesma suposição do código
 * escrita duas vezes.
 *
 * A fixture abaixo é a config `funil_vendas` REAL, lida de core.v_config_vigente em 17/08/2026
 * (15 etapas, kommo_pipeline_id 6334995). Contra a implementação antiga, o primeiro teste FALHA.
 */
const CONFIG_VIGENTE_PRODUCAO = [
  { chave: "incoming_leads", tipo: "aberto", ordem: 10 },
  { chave: "lead", tipo: "aberto", ordem: 20 },
  { chave: "interessado", tipo: "aberto", ordem: 30 },
  { chave: "qualificado", tipo: "aberto", ordem: 40 },
  { chave: "audiometria_agendada", tipo: "aberto", ordem: 50 },
  { chave: "faltou_audiometria", tipo: "aberto", ordem: 60 },
  { chave: "audiometria_realizada", tipo: "aberto", ordem: 70 },
  { chave: "consulta_agendada", tipo: "aberto", ordem: 80 },
  { chave: "faltou_consulta", tipo: "aberto", ordem: 90 },
  { chave: "consulta_realizada", tipo: "aberto", ordem: 100 },
  { chave: "aprovacao_e_envio", tipo: "aberto", ordem: 110 },
  { chave: "teste_aparelho", tipo: "aberto", ordem: 120 },
  { chave: "venda_ganha", tipo: "ganho", ordem: 10000 },
  { chave: "venda_perdida", tipo: "perdido", ordem: 11000 },
  { chave: "arquivado", tipo: "arquivado", ordem: 9000, no_board: true },
];

test("chavesDoBoard sobre a config REAL: 'arquivado' (no_board) fica fora — 15 etapas viram 14", () => {
  const chaves = chavesDoBoard(CONFIG_VIGENTE_PRODUCAO);
  assert.equal(CONFIG_VIGENTE_PRODUCAO.length, 15, "a fixture é a config de produção, não uma imaginada");
  assert.equal(chaves.length, 14);
  assert.ok(!chaves.includes("arquivado"), "arquivado guarda 582 dos 679 leads — não é coluna de trabalho");
  // as 14 de trabalho continuam TODAS lá: o filtro não pode ter comido etapa legítima junto
  assert.ok(chaves.includes("incoming_leads") && chaves.includes("venda_ganha") && chaves.includes("venda_perdida"));
});

test("INVARIANTE: nenhuma chave marcada no_board pode sair de chavesDoBoard", () => {
  // O invariante que recupera a proteção que o teste antigo dizia ter: vale para QUALQUER config,
  // não só para a de hoje. No dia em que a operação marcar uma segunda etapa como no_board, este
  // teste continua valendo sem ninguém precisar lembrar de atualizá-lo.
  const configs = [
    CONFIG_VIGENTE_PRODUCAO,
    [{ chave: "a" }, { chave: "b", no_board: true }, { chave: "c", no_board: false }],
    [{ chave: "so_no_board", no_board: true }],
    [],
  ];
  for (const cfg of configs) {
    const chaves = chavesDoBoard(cfg);
    for (const e of cfg) {
      if ((e as { no_board?: boolean }).no_board === true) {
        assert.ok(!chaves.includes(e.chave), `${e.chave} é no_board e vazou para o board`);
      } else {
        assert.ok(chaves.includes(e.chave), `${e.chave} NÃO é no_board e sumiu do board`);
      }
    }
  }
});

test("etapa sem o campo no_board entra no board — ausência não é exclusão", () => {
  // Config antiga (sem o campo) não pode virar board vazio: o filtro testa `!== true`, não `=== false`.
  assert.deepEqual(chavesDoBoard([{ chave: "novo" }, { chave: "ganho" }]), ["novo", "ganho"]);
});

test("teto atual comporta o volume real (629 hoje) com folga — o teto antigo de 500 não comportava", () => {
  const volumeReal = 629; // v_lead_card em 21/07, import da Trilha A
  assert.ok(TETO_CARDS > volumeReal, `TETO_CARDS (${TETO_CARDS}) precisa ser > ${volumeReal}`);
  assert.equal(houveCorte(volumeReal, 500), true); // o teto antigo TERIA cortado — e cortava calado
  assert.equal(houveCorte(volumeReal, TETO_CARDS), false); // o novo não corta
});

test("houveCorte sinaliza exatamente quando a leitura bate no teto", () => {
  assert.equal(houveCorte(0, TETO_CARDS), false);
  assert.equal(houveCorte(TETO_CARDS - 1, TETO_CARDS), false);
  assert.equal(houveCorte(TETO_CARDS, TETO_CARDS), true); // no teto = pode haver mais → avisa
});

// ─────────────── régua do funil (assinatura R9 — nas 3 telas) ───────────────

import { segmentosReguaAgregada, segmentosReguaLead } from "../lib/dados/funil-calculos.ts";

const ABERTAS = [{ chave: "novo" }, { chave: "qualificando" }, { chave: "avaliacao" }, { chave: "proposta" }];

test("régua do lead: preenchidas até a etapa atual, atual destacada, futuras apagadas", () => {
  assert.deepEqual(segmentosReguaLead(ABERTAS, "avaliacao"), ["ok", "ok", "atual", "futura"]);
  assert.deepEqual(segmentosReguaLead(ABERTAS, "novo"), ["atual", "futura", "futura", "futura"]);
});

test("régua do lead: etapa fora da lista (ganho/perdido/null) não inventa progresso", () => {
  assert.deepEqual(segmentosReguaLead(ABERTAS, "ganho"), ["futura", "futura", "futura", "futura"]);
  assert.deepEqual(segmentosReguaLead(ABERTAS, null), ["futura", "futura", "futura", "futura"]);
});

test("régua agregada (dashboard): etapa com lead acende; vazia/nula fica fraca", () => {
  assert.deepEqual(
    segmentosReguaAgregada([{ qtd: 44 }, { qtd: 0 }, { qtd: null }, { qtd: 3 }]),
    ["ok", "fraca", "fraca", "ok"],
  );
});

/*
 * ── R23/W2 · a última mensagem no card, e a ordenação que MENTIA ────────────────────────────
 *
 * O bug medido em 22/08: `core.v_lead_card` tinha 17 colunas e nenhuma de mensagem, `montarCard`
 * nunca preenchia `ultima_mensagem`, e a ordem "Sem resposta há mais tempo" comparava `undefined`
 * com `undefined` — caía no desempate por `lead_id` e entregava ORDEM ALFABÉTICA DE UUID. O menu
 * prometia uma coisa e fazia outra.
 *
 * A derivação saiu de dentro da consulta (server-only, intestável) e virou função pura justamente
 * para caber nesta bateria. 71 dos 97 cards do board têm mensagem no banco.
 */
import {
  COLUNAS_CARD,
  COLUNAS_CARD_BASE,
  COLUNAS_ULTIMA_MENSAGEM,
  montarUltimaMensagem,
  planoBusca,
} from "../lib/dados/funil-calculos.ts";

test("montarUltimaMensagem lê as TRÊS colunas do contrato e traduz a direção", () => {
  assert.deepEqual(
    montarUltimaMensagem({
      ultima_mensagem_corpo: "bom dia, ainda dá tempo?",
      ultima_mensagem_em: "2026-08-21T14:02:00.000Z",
      ultima_mensagem_direcao: "entrada",
    }),
    { texto: "bom dia, ainda dá tempo?", em: "2026-08-21T14:02:00.000Z", de: "cliente" },
  );
  assert.equal(
    montarUltimaMensagem({
      ultima_mensagem_corpo: "te mando o orçamento hoje",
      ultima_mensagem_em: "2026-08-21T14:02:00.000Z",
      ultima_mensagem_direcao: "saida",
    })?.de,
    "nos",
  );
});

test("direção desconhecida cai em 'nos' — o lado que NÃO cria alarme falso", () => {
  // supor que fomos nós que falamos por último não acusa ninguém; supor o contrário acusaria o
  // lead de estar sem resposta quando talvez não esteja.
  assert.equal(
    montarUltimaMensagem({ ultima_mensagem_corpo: "oi", ultima_mensagem_em: "2026-08-21T14:02:00.000Z" })?.de,
    "nos",
  );
});

test("mensagem sem data, ou sem corpo, é ausência — nunca linha em branco no card", () => {
  assert.equal(montarUltimaMensagem({ ultima_mensagem_corpo: "oi", ultima_mensagem_em: null }), undefined);
  assert.equal(montarUltimaMensagem({ ultima_mensagem_corpo: "   ", ultima_mensagem_em: "2026-08-21T14:02:00.000Z" }), undefined);
  assert.equal(montarUltimaMensagem({}), undefined, "linha sem as colunas (migration não aplicada) → sem bloco");
});

test("as 3 colunas novas entram na leitura, e o degrau sem elas continua existindo", () => {
  // pedir coluna inexistente ao PostgREST derruba a consulta INTEIRA: sem o degrau, "migration da
  // view ainda não aplicada" não seria "board sem a linha de mensagem", seria board VAZIO.
  for (const col of ["ultima_mensagem_corpo", "ultima_mensagem_em", "ultima_mensagem_direcao"]) {
    assert.ok(COLUNAS_ULTIMA_MENSAGEM.includes(col), `${col} é do contrato travado em 22/08`);
    assert.ok(COLUNAS_CARD.includes(col));
    assert.ok(!COLUNAS_CARD_BASE.includes(col), "o degrau precisa ser um shape SEM as colunas novas");
  }
  assert.equal(planoBusca("maria")!.colunas, COLUNAS_CARD);
  assert.equal(planoBusca("maria", false)!.colunas, COLUNAS_CARD_BASE);
});
