import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HORAS_PROMESSA_VENCIDA,
  HORAS_SEM_RESPOSTA,
  carimbo,
  ehPromessa,
  haQuantoTempo,
  sugerirTarefa,
  type FalaLida,
} from "../lib/conversas/sugestao-jarvis.ts";

/*
 * Contrato da sugestão do Jarvis (workshop 12/08): "ele faz a sugestão e ela só clica pra aprovar
 * ou não". O que estes testes travam é a única regra que não pode ceder:
 *
 *   nenhuma sugestão sai sem MOTIVO e sem EVIDÊNCIA citável.
 *
 * E o outro lado, que é igualmente importante: `null` é resposta legítima. Agente que sugere algo
 * em toda conversa vira ruído — o teste "conversa recém-respondida não gera nada" é o que impede
 * a regra de virar isso.
 */

const AGORA = Date.parse("2025-08-13T17:30:00.000Z"); // qua 14:30 em SP
const HORA = 3_600_000;
const CTX = { nomeLead: "Antônio Ribeiro", responsavel: "Sarah" };

function fala(id: string, direcao: "entrada" | "saida", corpo: string | null, haHoras: number): FalaLida {
  return { id, direcao, corpo, criado_em: new Date(AGORA - haHoras * HORA).toISOString() };
}

test("cliente falou por último e ninguém respondeu → tarefa de responder, com motivo e citação", () => {
  const s = sugerirTarefa([fala("m1", "entrada", "Consegue me mandar o endereço?", 5)], AGORA, CTX);
  assert.ok(s);
  assert.match(s!.titulo, /Responder Antônio Ribeiro/);
  assert.match(s!.motivo, /há 5 horas/);
  assert.equal(s!.trecho.texto, "Consegue me mandar o endereço?");
  assert.equal(s!.trecho.autor, "Antônio Ribeiro");
  assert.equal(s!.responsavelSugerido, "Sarah");
});

test("INVARIANTE: toda sugestão produzida tem motivo e trecho não vazios", () => {
  const casos: FalaLida[][] = [
    [fala("a", "entrada", "oi, tudo bem?", 9)],
    [fala("a", "entrada", "quero marcar", 40), fala("b", "saida", "Vou ver com a fono e te confirmo", 30)],
  ];
  for (const c of casos) {
    const s = sugerirTarefa(c, AGORA, CTX)!;
    assert.ok(s, "esperava sugestão");
    assert.ok(s.motivo.trim().length > 30, "motivo curto demais para justificar");
    assert.ok(s.trecho.texto.trim().length > 0, "sugestão sem evidência citada");
    assert.ok(s.trecho.quando.trim().length > 0);
  }
});

test("cliente falou agora há pouco → nada (a conversa está viva, não parada)", () => {
  const s = sugerirTarefa([fala("m1", "entrada", "oi", HORAS_SEM_RESPOSTA - 0.5)], AGORA, CTX);
  assert.equal(s, null);
});

test("nós respondemos por último sem prometer nada → nada", () => {
  const s = sugerirTarefa(
    [fala("a", "entrada", "quanto custa?", 30), fala("b", "saida", "Custa R$ 8.400 o par.", 29)],
    AGORA,
    CTX,
  );
  assert.equal(s, null);
});

test("promessa nossa que venceu → tarefa de ligar, citando a última fala do CLIENTE", () => {
  const s = sugerirTarefa(
    [
      fala("a", "entrada", "Só consigo levar na sexta de manhã", 26),
      fala("b", "saida", "Fechado, vou ver a agenda da fono e te confirmo", 25),
    ],
    AGORA,
    CTX,
  );
  assert.ok(s);
  assert.match(s!.titulo, /Ligar para Antônio Ribeiro/);
  assert.equal(s!.tipo, "Ligar");
  assert.equal(s!.trecho.texto, "Só consigo levar na sexta de manhã");
  assert.match(s!.motivo, /voltaria/);
});

test("promessa nossa ainda fresca → nada (ela tem o dia para cumprir)", () => {
  const s = sugerirTarefa(
    [fala("b", "saida", "Vou ver e te confirmo", HORAS_PROMESSA_VENCIDA - 1)],
    AGORA,
    CTX,
  );
  assert.equal(s, null);
});

test("conversa vazia, só mídia sem legenda, ou corpo em branco → nada para citar, nada a sugerir", () => {
  assert.equal(sugerirTarefa([], AGORA, CTX), null);
  assert.equal(sugerirTarefa([fala("a", "entrada", null, 9)], AGORA, CTX), null);
  assert.equal(sugerirTarefa([fala("a", "entrada", "   ", 9)], AGORA, CTX), null);
});

test("mensagem com data no futuro não vira urgência", () => {
  assert.equal(sugerirTarefa([fala("a", "entrada", "oi", -3)], AGORA, CTX), null);
});

test("ehPromessa reconhece as marcas e não acusa onde não houve", () => {
  for (const t of ["Vou ver com a fono", "te confirmo amanhã", "Assim que abrir a agenda eu aviso", "Fico de retornar"])
    assert.equal(ehPromessa(t), true, t);
  for (const t of ["Custa R$ 8.400", "A audiometria é gratuita", null, ""])
    assert.equal(ehPromessa(t), false, String(t));
});

test("haQuantoTempo nunca arredonda para cima", () => {
  assert.equal(haQuantoTempo(AGORA - 0.5 * HORA, AGORA), "há menos de uma hora");
  assert.equal(haQuantoTempo(AGORA - 1 * HORA, AGORA), "há 1 hora");
  assert.equal(haQuantoTempo(AGORA - 5.9 * HORA, AGORA), "há 5 horas");
  assert.equal(haQuantoTempo(AGORA - 47 * HORA, AGORA), "há 47 horas");
  assert.equal(haQuantoTempo(AGORA - 50 * HORA, AGORA), "há 2 dias");
});

test("carimbo: hoje e ontem relativos, resto com data, no fuso da operação", () => {
  assert.equal(carimbo(AGORA - 2 * HORA, AGORA), "hoje, 12:30");
  assert.equal(carimbo(AGORA - 23 * HORA, AGORA), "ontem, 15:30");
  assert.equal(carimbo(AGORA - 5 * 24 * HORA, AGORA), "08/08, 14:30");
});

test("o id da sugestão é estável enquanto a última mensagem for a mesma", () => {
  const falas = [fala("m9", "entrada", "e aí, conseguiu?", 6)];
  const a = sugerirTarefa(falas, AGORA, CTX)!;
  const b = sugerirTarefa(falas, AGORA + 30 * 60_000, CTX)!;
  assert.equal(a.id, b.id); // o cartão não renasce (e não perde a decisão) a cada tique do relógio
});
