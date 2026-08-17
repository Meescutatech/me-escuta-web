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
