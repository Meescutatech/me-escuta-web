import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatarDuracaoMin,
  inicioDoDiaSP,
  janelasUltimosDias,
  mediana,
  minutosPrimeiraResposta,
  percentualEntrega,
  rotuloDiaSP,
  somaValores,
  ymdEmSaoPaulo,
  type MensagemMinima,
} from "../lib/dados/dashboard-calculos.ts";

/*
 * Testes da lógica PURA do dashboard (Rodada 7, D5) — roda com `npm test`
 * (node --test com type stripping, sem framework externo). As queries em si
 * (lib/dados/dashboard.ts) são head-counts no banco e ficam fora daqui.
 */

// ─────────────── fuso e janelas de dia ───────────────

test("ymdEmSaoPaulo corta o dia no fuso da operação, não em UTC", () => {
  // 21/07 01:30 UTC ainda é 20/07 22:30 em São Paulo
  assert.equal(ymdEmSaoPaulo(new Date("2026-07-21T01:30:00Z")), "2026-07-20");
  assert.equal(ymdEmSaoPaulo(new Date("2026-07-21T12:00:00Z")), "2026-07-21");
});

test("inicioDoDiaSP é meia-noite -03:00", () => {
  const inicio = inicioDoDiaSP(new Date("2026-07-21T01:30:00Z"));
  assert.equal(inicio.toISOString(), "2026-07-20T03:00:00.000Z");
});

test("janelasUltimosDias: 7 janelas contíguas, da mais antiga pra mais nova, terminando hoje", () => {
  const agora = new Date("2026-07-21T18:00:00-03:00");
  const janelas = janelasUltimosDias(agora, 7);
  assert.equal(janelas.length, 7);
  // última janela contém `agora`
  const ultima = janelas[6];
  assert.ok(new Date(ultima.inicioIso) <= agora && agora < new Date(ultima.fimIso));
  assert.equal(new Date(ultima.inicioIso).toISOString(), "2026-07-21T03:00:00.000Z");
  // contíguas: fim de uma = início da seguinte
  for (let i = 1; i < 7; i++) assert.equal(janelas[i - 1].fimIso, janelas[i].inicioIso);
  // primeira janela começa 6 dias antes
  assert.equal(new Date(janelas[0].inicioIso).toISOString(), "2026-07-15T03:00:00.000Z");
});

test("rotuloDiaSP: dia da semana + dd/mm", () => {
  // 21/07/2026 é uma terça
  assert.equal(rotuloDiaSP(new Date("2026-07-21T00:00:00-03:00")), "ter 21/07");
  assert.equal(rotuloDiaSP(new Date("2026-07-19T00:00:00-03:00")), "dom 19/07");
});

// ─────────────── mediana ───────────────

test("mediana: vazia → null, ímpar → central, par → média dos centrais", () => {
  assert.equal(mediana([]), null);
  assert.equal(mediana([7]), 7);
  assert.equal(mediana([9, 1, 5]), 5);
  assert.equal(mediana([4, 1, 3, 2]), 2.5);
});

test("mediana não muta a entrada", () => {
  const v = [3, 1, 2];
  mediana(v);
  assert.deepEqual(v, [3, 1, 2]);
});

// ─────────────── tempo de 1ª resposta ───────────────

function m(conversa: string, direcao: string, iso: string): MensagemMinima {
  return { conversa_id: conversa, direcao, criado_em: iso };
}

test("primeira resposta: da 1ª entrada até a 1ª saída depois dela", () => {
  const tempos = minutosPrimeiraResposta([
    m("c1", "entrada", "2026-07-20T10:00:00Z"),
    m("c1", "entrada", "2026-07-20T10:02:00Z"), // rajada não muda a referência
    m("c1", "saida", "2026-07-20T10:12:00Z"),
    m("c1", "saida", "2026-07-20T10:30:00Z"), // saída seguinte não conta
  ]);
  assert.deepEqual(tempos, [12]);
});

test("primeira resposta: saída ANTES da 1ª entrada (template ativo) não conta como resposta", () => {
  const tempos = minutosPrimeiraResposta([
    m("c1", "saida", "2026-07-20T09:00:00Z"),
    m("c1", "entrada", "2026-07-20T10:00:00Z"),
    m("c1", "saida", "2026-07-20T10:05:00Z"),
  ]);
  assert.deepEqual(tempos, [5]);
});

test("primeira resposta: conversa sem par entrada→saída fica FORA da amostra", () => {
  const tempos = minutosPrimeiraResposta([
    m("so-entrada", "entrada", "2026-07-20T10:00:00Z"),
    m("so-saida", "saida", "2026-07-20T10:00:00Z"),
  ]);
  assert.deepEqual(tempos, []);
});

test("primeira resposta: várias conversas, entrada fora de ordem", () => {
  const tempos = minutosPrimeiraResposta([
    m("c2", "saida", "2026-07-20T11:20:00Z"),
    m("c1", "saida", "2026-07-20T10:12:00Z"),
    m("c2", "entrada", "2026-07-20T11:00:00Z"),
    m("c1", "entrada", "2026-07-20T10:00:00Z"),
  ]);
  assert.deepEqual(tempos.sort((a, b) => a - b), [12, 20]);
});

// ─────────────── % entrega e soma ───────────────

test("percentualEntrega: base zero → null (não inventar número)", () => {
  assert.equal(percentualEntrega(0, 0), null);
  assert.equal(percentualEntrega(5, 0), null);
});

test("percentualEntrega: arredonda a 1 casa", () => {
  assert.equal(percentualEntrega(2, 3), 66.7);
  assert.equal(percentualEntrega(10, 10), 100);
  assert.equal(percentualEntrega(0, 4), 0);
});

test("somaValores ignora null/undefined (valor null é honesto)", () => {
  assert.equal(somaValores([]), 0);
  assert.equal(somaValores([8900, null, 11400, undefined, 0]), 20300);
});

// ─────────────── formatação de duração ───────────────

test("formatarDuracaoMin: null, segundos, minutos, horas, dias", () => {
  assert.equal(formatarDuracaoMin(null), "—");
  assert.equal(formatarDuracaoMin(0.5), "30s");
  assert.equal(formatarDuracaoMin(12), "12 min");
  assert.equal(formatarDuracaoMin(59.6), "1h");
  assert.equal(formatarDuracaoMin(80), "1h 20min");
  assert.equal(formatarDuracaoMin(120), "2h");
  assert.equal(formatarDuracaoMin(60 * 26 + 30), "1d 2h");
});
