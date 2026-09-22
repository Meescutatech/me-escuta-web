import { test } from "node:test";
import assert from "node:assert/strict";
import {
  podeTransicionar,
  temPortao,
  ehEtapaDeSaida,
  PORTOES_PADRAO,
  type Portao,
  type LeadParaPortao,
} from "../lib/funil/portoes.ts";
import type { EtapaFunil } from "../lib/dados/funil-etapas.ts";

// ── piloto: audiometria antes de proposta ──────────────────────────────────────

test("bloqueia proposta quando audiometria não foi feita", () => {
  const r = podeTransicionar("qualificando", "proposta", { audiometria: "nao_fez" });
  assert.equal(r.permitido, false);
  assert.equal(r.exige, "audiometria realizada");
  assert.equal(r.etapaAlvo, "proposta");
});

test("bloqueia proposta quando a ficha não tem audiometria (null = prova de ausência)", () => {
  const r = podeTransicionar("qualificando", "proposta", { audiometria: null });
  assert.equal(r.permitido, false);
});

test("libera proposta quando audiometria foi feita", () => {
  const r = podeTransicionar("qualificando", "proposta", { audiometria: "fez" });
  assert.equal(r.permitido, true);
  assert.equal(r.exige, undefined);
});

test("NUNCA bloqueia no escuro: audiometria undefined libera (projeção não expôs)", () => {
  const r = podeTransicionar("qualificando", "proposta", { audiometria: undefined });
  assert.equal(r.permitido, true);
});

// ── só protege ENTRADA na etapa-alvo ───────────────────────────────────────────

test("etapa sem portão passa sempre (novo -> qualificando)", () => {
  const r = podeTransicionar("novo", "qualificando", { audiometria: "nao_fez" });
  assert.equal(r.permitido, true);
});

test("mesma etapa (de === para) sempre permitido", () => {
  const r = podeTransicionar("proposta", "proposta", { audiometria: "nao_fez" });
  assert.equal(r.permitido, true);
});

test("recuar de proposta para qualificando não exige pré-requisito", () => {
  // o portão protege a ENTRADA em proposta, não a saída dela
  const r = podeTransicionar("proposta", "qualificando", { audiometria: "nao_fez" });
  assert.equal(r.permitido, true);
});

// ── extensibilidade: regras injetáveis ─────────────────────────────────────────

test("aceita conjunto de regras customizado (config futura)", () => {
  const regras: Portao[] = [
    {
      etapaAlvo: "negociacao",
      exige: "valor definido",
      avaliar: (l: LeadParaPortao) => (l.audiometria === "fez" ? "ok" : "bloqueia"),
    },
  ];
  // com regras custom, proposta deixa de ter portão
  assert.equal(podeTransicionar("qualificando", "proposta", { audiometria: "nao_fez" }, regras).permitido, true);
  // e negociacao passa a ter
  assert.equal(podeTransicionar("proposta", "negociacao", { audiometria: "nao_fez" }, regras).permitido, false);
});

test("lista vazia de regras = nada bloqueia (fundação sem piloto)", () => {
  const r = podeTransicionar("novo", "proposta", { audiometria: "nao_fez" }, []);
  assert.equal(r.permitido, true);
});

// ── helpers ────────────────────────────────────────────────────────────────────

test("temPortao reconhece a etapa protegida", () => {
  assert.equal(temPortao("proposta"), true);
  assert.equal(temPortao("qualificando"), false);
});

test("PORTOES_PADRAO tem exatamente o piloto hoje", () => {
  assert.equal(PORTOES_PADRAO.length, 1);
  assert.equal(PORTOES_PADRAO[0].etapaAlvo, "proposta");
});

test("ehEtapaDeSaida classifica perdido/ganho/arquivado", () => {
  const mk = (tipo: EtapaFunil["tipo"]): EtapaFunil => ({ chave: "x", nome: "X", cor: "#000", tipo, ordem: 1, no_board: false });
  assert.equal(ehEtapaDeSaida(mk("perdido")), true);
  assert.equal(ehEtapaDeSaida(mk("ganho")), true);
  assert.equal(ehEtapaDeSaida(mk("arquivado")), true);
  assert.equal(ehEtapaDeSaida(mk("aberto")), false);
  assert.equal(ehEtapaDeSaida(undefined), false);
});
