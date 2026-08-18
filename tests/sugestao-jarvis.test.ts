import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HORAS_AUDIOMETRIA_PARADA,
  HORAS_PROMESSA_VENCIDA,
  HORAS_SEM_RESPOSTA,
  avaliarConversa,
  carimbo,
  ehPromessa,
  exameJaFeito,
  falouDeAudiometria,
  haQuantoTempo,
  proporTarefa,
  type FalaLida,
} from "../lib/conversas/sugestao-jarvis.ts";

/*
 * Contrato da proposta do Jarvis, revisto pela D10 (18/08).
 *
 * O que estes testes travam:
 *  1. nenhuma proposta sai sem POR QUE AGORA e sem evidência citável — nem as automáticas;
 *  2. `null` é resposta legítima, e a maioria das conversas cai nela;
 *  3. o modo NÃO vem da regra, vem da config de autonomia por tipo. Trocar a config troca o
 *     comportamento sem tocar na regra — é a prova de que "isto é config, não código".
 */

const AGORA = Date.parse("2025-08-13T17:30:00.000Z"); // qua 14:30 em SP
const HORA = 3_600_000;
const CTX = { nomeLead: "Antônio Ribeiro", responsavel: "Sarah" };

function fala(id: string, direcao: "entrada" | "saida", corpo: string | null, haHoras: number): FalaLida {
  return { id, direcao, corpo, criado_em: new Date(AGORA - haHoras * HORA).toISOString() };
}

// ───────────────────────── a regra ─────────────────────────

test("cliente falou por último e ninguém respondeu → follow-up, com motivo e citação", () => {
  const p = proporTarefa([fala("m1", "entrada", "Consegue me mandar o endereço?", 5)], AGORA, CTX);
  assert.ok(p);
  assert.equal(p!.tipoChave, "acompanhar_follow_up");
  assert.match(p!.fazer, /Responder Antônio Ribeiro/);
  assert.match(p!.porqueAgora, /há 5 horas/);
  assert.equal(p!.trecho.texto, "Consegue me mandar o endereço?");
});

test("audiometria em aberto ganha da regra genérica — é o gate do dia", () => {
  const p = proporTarefa(
    [
      fala("a", "entrada", "Quero marcar a audiometria da minha mãe", 30),
      fala("b", "saida", "Claro! Vou olhar a agenda", 29),
    ],
    AGORA,
    CTX,
  );
  assert.ok(p);
  assert.equal(p!.tipoChave, "confirmar_exame");
  assert.match(p!.fazer, /Cobrar a audiometria/);
});

test("exame já declarado feito desliga a cobrança — a UI leu a conversa", () => {
  const p = proporTarefa(
    [
      fala("a", "entrada", "Quero marcar a audiometria", 40),
      fala("b", "saida", "Vou ver a agenda", 39),
      fala("c", "entrada", "Na verdade já fiz o exame semana passada, segue o laudo", 38),
    ],
    AGORA,
    CTX,
  );
  // cai na regra do cliente sem resposta, não na de audiometria
  assert.ok(p);
  assert.notEqual(p!.tipoChave, "confirmar_exame");
});

test("promessa nossa que venceu → ligar, citando a última fala do CLIENTE", () => {
  const p = proporTarefa(
    [
      fala("a", "entrada", "Vocês atendem em Contagem?", 26),
      fala("b", "saida", "Deixa eu ver com a equipe e te falo", 25),
    ],
    AGORA,
    CTX,
  );
  assert.ok(p);
  assert.equal(p!.tipoChave, "ligar_lead");
  assert.equal(p!.trecho.texto, "Vocês atendem em Contagem?");
});

test("INVARIANTE: toda proposta tem porqueAgora, trecho e tipo — inclusive as automáticas", () => {
  const casos: FalaLida[][] = [
    [fala("a", "entrada", "oi, tudo bem?", 9)],
    [fala("a", "entrada", "quero marcar audiometria", 40), fala("b", "saida", "vou ver", 30)],
    [fala("a", "entrada", "atendem em Contagem?", 30), fala("b", "saida", "deixa eu ver e te falo", 28)],
  ];
  for (const c of casos) {
    const p = proporTarefa(c, AGORA, CTX)!;
    assert.ok(p, "esperava proposta");
    assert.ok(p.porqueAgora.trim().length > 30, "motivo curto demais para justificar");
    assert.ok(p.trecho.texto.trim().length > 0, "proposta sem evidência citada");
    assert.ok(p.tipoChave.trim().length > 0, "proposta sem tipo — o modo ficaria indefinido");
  }
});

test("nada a dizer: conversa fresca, vazia, sem texto ou com data no futuro", () => {
  assert.equal(proporTarefa([fala("m", "entrada", "oi", HORAS_SEM_RESPOSTA - 0.5)], AGORA, CTX), null);
  assert.equal(proporTarefa([], AGORA, CTX), null);
  assert.equal(proporTarefa([fala("a", "entrada", null, 9)], AGORA, CTX), null);
  assert.equal(proporTarefa([fala("a", "entrada", "   ", 9)], AGORA, CTX), null);
  assert.equal(proporTarefa([fala("a", "entrada", "oi", -3)], AGORA, CTX), null);
});

test("nós respondemos por último sem prometer nada → nada", () => {
  assert.equal(
    proporTarefa(
      [fala("a", "entrada", "quanto custa?", 30), fala("b", "saida", "Custa R$ 8.400 o par.", 29)],
      AGORA,
      CTX,
    ),
    null,
  );
});

test("promessa e audiometria ainda frescas não disparam", () => {
  assert.equal(proporTarefa([fala("b", "saida", "Vou ver e te confirmo", HORAS_PROMESSA_VENCIDA - 1)], AGORA, CTX), null);
  const fresca = proporTarefa(
    [fala("a", "entrada", "quero a audiometria", HORAS_AUDIOMETRIA_PARADA - 1)],
    AGORA,
    CTX,
  );
  assert.notEqual(fresca?.tipoChave, "confirmar_exame");
});

// ───────────────────────── o despacho (D10) ─────────────────────────

test("D10: follow-up e audiometria NASCEM CRIADAS — sem cartão, porque não há julgamento", () => {
  const semResposta = avaliarConversa([fala("m", "entrada", "e aí, conseguiu?", 28 * 24)], AGORA, CTX);
  assert.equal(semResposta?.modo, "criada");

  const audiometria = avaliarConversa(
    [fala("a", "entrada", "quero marcar a audiometria", 40), fala("b", "saida", "vou olhar a agenda", 30)],
    AGORA,
    CTX,
  );
  assert.equal(audiometria?.modo, "criada");
});

test("D10: ligar para o lead PEDE APROVAÇÃO — existe decisão real", () => {
  const d = avaliarConversa(
    [fala("a", "entrada", "atendem em Contagem?", 30), fala("b", "saida", "deixa eu ver e te falo", 28)],
    AGORA,
    CTX,
  );
  assert.equal(d?.modo, "propor");
  assert.ok(d && "fundamento" in d && d.fundamento.length > 20, "cartão sem justificar por que pede aprovação");
});

test("D10: todo despacho carrega o fundamento — a autonomia é auditável na tela", () => {
  for (const falas of [
    [fala("m", "entrada", "oi?", 9)],
    [fala("a", "entrada", "atendem em Contagem?", 30), fala("b", "saida", "deixa eu ver e te falo", 28)],
  ]) {
    const d = avaliarConversa(falas, AGORA, CTX)!;
    assert.ok(d, "esperava despacho");
    assert.ok(d.fundamento.trim().length > 20, "despacho sem fundamento");
  }
});

// ───────────────────────── utilitários ─────────────────────────

test("ehPromessa reconhece as marcas e não acusa onde não houve", () => {
  for (const t of ["Vou ver com a fono", "te confirmo amanhã", "Assim que abrir a agenda eu aviso", "Fico de retornar"])
    assert.equal(ehPromessa(t), true, t);
  for (const t of ["Custa R$ 8.400", "A audiometria é gratuita", null, ""])
    assert.equal(ehPromessa(t), false, String(t));
});

test("falouDeAudiometria e exameJaFeito leem o fio inteiro, não só a última", () => {
  const fio = [{ corpo: "oi" }, { corpo: "quero a AUDIOMETRIA" }, { corpo: "ok" }];
  assert.equal(falouDeAudiometria(fio), true);
  assert.equal(exameJaFeito(fio), false);
  assert.equal(exameJaFeito([{ corpo: "já fiz o exame ano passado" }]), true);
});

test("haQuantoTempo nunca arredonda para cima", () => {
  assert.equal(haQuantoTempo(AGORA - 0.5 * HORA, AGORA), "há menos de uma hora");
  assert.equal(haQuantoTempo(AGORA - 1 * HORA, AGORA), "há 1 hora");
  assert.equal(haQuantoTempo(AGORA - 5.9 * HORA, AGORA), "há 5 horas");
  assert.equal(haQuantoTempo(AGORA - 50 * HORA, AGORA), "há 2 dias");
});

test("carimbo: hoje e ontem relativos, resto com data, no fuso da operação", () => {
  assert.equal(carimbo(AGORA - 2 * HORA, AGORA), "hoje, 12:30");
  assert.equal(carimbo(AGORA - 23 * HORA, AGORA), "ontem, 15:30");
  assert.equal(carimbo(AGORA - 5 * 24 * HORA, AGORA), "08/08, 14:30");
});

test("o id da proposta é estável enquanto a última mensagem for a mesma", () => {
  const falas = [fala("m9", "entrada", "e aí, conseguiu?", 6)];
  const a = proporTarefa(falas, AGORA, CTX)!;
  const b = proporTarefa(falas, AGORA + 30 * 60_000, CTX)!;
  // sem isso a fila ganharia uma cópia da mesma tarefa a cada tique do relógio
  assert.equal(a.id, b.id);
});
