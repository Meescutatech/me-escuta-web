import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ERRO_FORA_DA_JANELA,
  MAX_CORPO,
  explicarFalha,
  fraseLinha,
  montarPayloadProgramar,
  podeCancelar,
  previa,
  visiveisNaConversa,
  type EnvioProgramadoLinha,
} from "../lib/conversas/envios-programados.ts";
import { MAX_DIAS_PROGRAMACAO, instante } from "../lib/conversas/programar-envio.ts";

/*
 * R27/F1 — a metade que GRAVA do "enviar agora ou programar". O que estes testes travam:
 * o payload que vai para a porta (contrato 0290), o que a conversa mostra da view, e a voz
 * da tela quando o runtime devolve `falhou`.
 */

const AGORA = instante(2025, 8, 13, 14, 30);
const HORA = 3_600_000;

function linha(p: Partial<EnvioProgramadoLinha>): EnvioProgramadoLinha {
  return {
    id: "x",
    conversa_id: "c",
    corpo: "oi",
    enviar_em: new Date(AGORA + HORA).toISOString(),
    status: "agendado",
    erro: null,
    criado_por: null,
    ...p,
  };
}

test("montarPayloadProgramar: payload no contrato 0290, enviar_em em ISO", () => {
  const r = montarPayloadProgramar({
    conversaId: "conv-1",
    leadId: "lead-1",
    corpo: "  Bom dia!  ",
    quandoMs: AGORA + HORA,
    agoraMs: AGORA,
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.payload, {
    conversa_id: "conv-1",
    lead_id: "lead-1",
    corpo: "Bom dia!",
    enviar_em: new Date(AGORA + HORA).toISOString(),
    canal_id: null,
  });
});

test("montarPayloadProgramar: recusa sem conversa, corpo vazio, hora passada, alem do teto", () => {
  const base = { conversaId: "c", leadId: null, corpo: "x", quandoMs: AGORA + HORA, agoraMs: AGORA };
  assert.equal(montarPayloadProgramar({ ...base, conversaId: null }).ok, false);
  assert.equal(montarPayloadProgramar({ ...base, corpo: "   " }).ok, false);
  assert.equal(montarPayloadProgramar({ ...base, corpo: "a".repeat(MAX_CORPO + 1) }).ok, false);
  assert.equal(montarPayloadProgramar({ ...base, quandoMs: AGORA }).ok, false);
  assert.equal(montarPayloadProgramar({ ...base, quandoMs: AGORA - 1 }).ok, false);
  assert.equal(montarPayloadProgramar({ ...base, quandoMs: NaN }).ok, false);
  assert.equal(
    montarPayloadProgramar({ ...base, quandoMs: AGORA + (MAX_DIAS_PROGRAMACAO + 1) * 86_400_000 }).ok,
    false,
  );
  // o motivo tem a voz da tela, nao a do Postgres
  const r = montarPayloadProgramar({ ...base, quandoMs: AGORA - 1 });
  assert.equal(r.ok === false && r.motivo, "Esse horário já passou.");
});

test("visiveisNaConversa: agendados por horario, depois falhados (recente por cima); enviado/cancelado somem", () => {
  const v = visiveisNaConversa([
    linha({ id: "f1", status: "falhou", enviar_em: new Date(AGORA - 2 * HORA).toISOString() }),
    linha({ id: "a2", enviar_em: new Date(AGORA + 5 * HORA).toISOString() }),
    linha({ id: "e", status: "enviado" }),
    linha({ id: "a1", enviar_em: new Date(AGORA + HORA).toISOString() }),
    linha({ id: "c", status: "cancelado" }),
    linha({ id: "f2", status: "falhou", enviar_em: new Date(AGORA - HORA).toISOString() }),
  ]);
  assert.deepEqual(
    v.map((l) => l.id),
    ["a1", "a2", "f2", "f1"],
  );
});

test("podeCancelar: so agendado", () => {
  assert.equal(podeCancelar({ status: "agendado" }), true);
  assert.equal(podeCancelar({ status: "enviado" }), false);
  assert.equal(podeCancelar({ status: "falhou" }), false);
  assert.equal(podeCancelar({ status: "cancelado" }), false);
});

test("explicarFalha: fora da janela tem titulo e acao; erro cru vem curto; nulo nao some", () => {
  const j = explicarFalha(ERRO_FORA_DA_JANELA);
  assert.match(j.titulo, /janela de 24h/);
  assert.ok(j.acao && /template/.test(j.acao));
  const cru = explicarFalha("conversa sem identidade externa");
  assert.equal(cru.titulo, "Não saiu: conversa sem identidade externa");
  assert.equal(cru.acao, null);
  assert.equal(explicarFalha("x".repeat(300)).titulo.length, "Não saiu: ".length + 140);
  assert.equal(explicarFalha(null).titulo, "Não saiu.");
});

test("fraseLinha e previa", () => {
  assert.equal(fraseLinha({ enviar_em: "nao-e-data" }, AGORA), "horário indisponível");
  assert.match(fraseLinha({ enviar_em: new Date(AGORA + HORA).toISOString() }, AGORA), /15:30/);
  assert.equal(previa("  a   b  "), "a b");
  assert.equal(previa("x".repeat(100)).length, 72);
  assert.ok(previa("x".repeat(100)).endsWith("…"));
});
