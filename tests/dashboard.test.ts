import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketizarMensagens,
  contarEntrega,
  contarPorEtapa,
  formatarDuracaoMin,
  inicioDoDiaSP,
  janelasUltimosDias,
  mediana,
  idadeCurta,
  minutosPrimeiraResposta,
  percentualChegouAteAqui,
  percentualEntrega,
  resumirSugestoes,
  rotuloDiaSP,
  taxaFechamento,
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

/*
 * F24a · a agregação em JS que substitui os head-counts. O risco declarado do item é a TROCA DE
 * TÉCNICA MUDAR NÚMERO — silenciosamente, por fuso, fronteira de janela ou estado esquecido.
 * Cada teste abaixo compara contra o que o head-count antigo teria devolvido.
 */

test("F24a · contagem por etapa == 1 head-count por etapa, inclusive as etapas vazias", () => {
  const linhas = [
    { etapa: "novo" }, { etapa: "novo" }, { etapa: "novo" },
    { etapa: "qualificando" },
    { etapa: "arquivado" }, // fora do board: não pode entrar em etapa nenhuma
    { etapa: null },        // sem etapa: idem
  ];
  const chaves = ["novo", "qualificando", "proposta"];
  // o head-count antigo faria: eq(etapa,'novo')=3, eq('qualificando')=1, eq('proposta')=0
  assert.deepEqual(contarPorEtapa(linhas, chaves), [3, 1, 0]);
});

test("F24a · etapa vazia é 0, nunca ausente — a régua do painel tem uma casa por etapa", () => {
  assert.deepEqual(contarPorEtapa([], ["a", "b"]), [0, 0]);
});

test("F24a · bucketização respeita [início, fim) — a mesma fronteira do .gte()/.lt()", () => {
  const janelas = [
    { inicioIso: "2026-07-20T03:00:00.000Z", fimIso: "2026-07-21T03:00:00.000Z", rotulo: "seg 20/07" },
    { inicioIso: "2026-07-21T03:00:00.000Z", fimIso: "2026-07-22T03:00:00.000Z", rotulo: "ter 21/07" },
  ];
  const msgs = [
    { direcao: "entrada", criado_em: "2026-07-20T03:00:00.000Z" }, // exatamente o início: entra no 1º
    { direcao: "saida", criado_em: "2026-07-21T02:59:59.999Z" },   // último instante do 1º
    { direcao: "entrada", criado_em: "2026-07-21T03:00:00.000Z" }, // início do 2º, NÃO do 1º
    { direcao: "entrada", criado_em: "2026-07-19T23:00:00.000Z" }, // antes de tudo: fora
    { direcao: "entrada", criado_em: "2026-07-25T00:00:00.000Z" }, // depois: fora
  ];
  assert.deepEqual(bucketizarMensagens(msgs, janelas), [
    { rotulo: "seg 20/07", entrada: 1, saida: 1 },
    { rotulo: "ter 21/07", entrada: 1, saida: 0 },
  ]);
});

test("F24a · direção desconhecida e data inválida não entram em balde nenhum", () => {
  const janelas = [
    { inicioIso: "2026-07-20T03:00:00.000Z", fimIso: "2026-07-21T03:00:00.000Z", rotulo: "seg 20/07" },
  ];
  const msgs = [
    { direcao: "interna", criado_em: "2026-07-20T10:00:00.000Z" },
    { direcao: "entrada", criado_em: "data inventada" },
    { direcao: "entrada", criado_em: null },
  ];
  assert.deepEqual(bucketizarMensagens(msgs, janelas), [{ rotulo: "seg 20/07", entrada: 0, saida: 0 }]);
});

test("F24a · entrega: base/entregues/falhas == os 3 head-counts que ela substitui", () => {
  const linhas = [
    { status_entrega: "enviado" },
    { status_entrega: "entregue" },
    { status_entrega: "lido" },
    { status_entrega: "falhou" },
    { status_entrega: "na_fila" },  // estado NÃO conhecido: fora da base (era o filtro do .in())
    { status_entrega: "enviando" }, // idem
    { status_entrega: null },       // idem
  ];
  // head-counts antigos: base in(enviado,entregue,lido,falhou)=4; entregues in(entregue,lido)=2;
  // falhas eq(falhou)=1
  assert.deepEqual(contarEntrega(linhas), { base: 4, entregues: 2, falhas: 1 });
});

test("F24a · 'enviado' NÃO é entregue — confundir os dois infla a taxa do painel", () => {
  assert.deepEqual(contarEntrega([{ status_entrega: "enviado" }]), {
    base: 1,
    entregues: 0,
    falhas: 0,
  });
});

// ─────────────── R19 · Trilha 2 — as contas novas do painel ───────────────

test("R19 · percentualChegouAteAqui: cumulativo, monotônico, 1ª etapa = 100%", () => {
  // 10 no topo, 6 no meio, 4 no fim → total 20; "até aqui" = 100%, 50%, 20%
  assert.deepEqual(percentualChegouAteAqui([10, 6, 4]), [100, 50, 20]);
});

test("R19 · percentualChegouAteAqui: etapa vazia no meio não quebra a monotonia", () => {
  assert.deepEqual(percentualChegouAteAqui([8, 0, 2]), [100, 20, 20]);
});

test("R19 · percentualChegouAteAqui: QUALQUER null → tudo null (total desconhecido não vira %)", () => {
  assert.deepEqual(percentualChegouAteAqui([10, null, 4]), [null, null, null]);
});

test("R19 · percentualChegouAteAqui: funil todo zerado → null, nunca 0% inventado", () => {
  assert.deepEqual(percentualChegouAteAqui([0, 0]), [null, null]);
});

test("R19 · taxaFechamento: razão dos fechados, com a base junto", () => {
  assert.deepEqual(taxaFechamento(3, 1), { pct: 75, base: 4 });
});

test("R19 · taxaFechamento: base zero ou contagem indisponível → pct null", () => {
  assert.deepEqual(taxaFechamento(0, 0), { pct: null, base: 0 });
  assert.deepEqual(taxaFechamento(null, 5), { pct: null, base: null });
  assert.deepEqual(taxaFechamento(5, null), { pct: null, base: null });
});

test("R19 · resumirSugestoes: total, quebra por agente (maior primeiro) e a mais antiga", () => {
  const r = resumirSugestoes([
    { agente: "clara", criado_em: "2026-07-16T20:35:12+00:00" },
    { agente: "clara", criado_em: "2026-08-01T10:00:00+00:00" },
    { agente: "jarvis", criado_em: "2026-07-16T14:21:59+00:00" },
  ]);
  assert.equal(r.pendentes, 3);
  assert.deepEqual(r.porAgente, [
    { agente: "clara", qtd: 2 },
    { agente: "jarvis", qtd: 1 },
  ]);
  assert.equal(r.maisAntigaEm, "2026-07-16T14:21:59+00:00");
});

test("R19 · resumirSugestoes: empate ordena por nome; agente vazio vira 'sem agente'", () => {
  const r = resumirSugestoes([{ agente: "b" }, { agente: "a" }, { agente: null }]);
  assert.deepEqual(r.porAgente, [
    { agente: "a", qtd: 1 },
    { agente: "b", qtd: 1 },
    { agente: "sem agente", qtd: 1 },
  ]);
  assert.equal(r.maisAntigaEm, null); // sem criado_em não se inventa idade
});

test("R19 · resumirSugestoes: fila vazia é 0 medido (o teste cria o sujeito — §17 do MÉTODO)", () => {
  assert.deepEqual(resumirSugestoes([]), { pendentes: 0, porAgente: [], maisAntigaEm: null });
});

test("R19 · idadeCurta: faixas de exibição e honestidade no inválido", () => {
  const agora = new Date("2026-08-04T12:00:00Z");
  assert.equal(idadeCurta("2026-08-04T11:59:30Z", agora), "30s");
  assert.equal(idadeCurta("2026-08-04T11:15:00Z", agora), "45min");
  assert.equal(idadeCurta("2026-08-04T03:00:00Z", agora), "9h");
  assert.equal(idadeCurta("2026-07-16T14:21:59Z", agora), "18d");
  assert.equal(idadeCurta(null, agora), null);
  assert.equal(idadeCurta("nao-e-data", agora), null);
});
