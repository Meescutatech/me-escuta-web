import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarMencao,
  avisoSemAcesso,
  gatilhoMencao,
  mencoesVivas,
  payloadMencaoCriada,
  segmentosComMencao,
  separarMencionaveis,
  type Mencionavel,
} from "../lib/conversas/mencao.ts";

/*
 * Rodada 13 / Bloco C — C4/C5/C8. O teste que importa: o DADO GRAVADO É UUID, nunca string.
 * O erro do Kommo (`@Dani` ≠ `@DANI`, menção como substring sem alvo) nasce de resolver o
 * alvo por parsing depois; aqui o alvo é resolvido no momento da escrita.
 */

const CAMILA: Mencionavel = {
  id: "3f9a1c62-7c4e-4a15-9b0f-2d5e8a7c1b44",
  tipo: "humano",
  nome: "Camila Rocha",
  papel: "Fonoaudióloga",
  ativo: true,
};
const DANI: Mencionavel = {
  id: "8c21e7d4-5b93-4f8a-a6c1-9e0b3d7f2a58",
  tipo: "humano",
  nome: "Dani Alves",
  papel: "Atendimento",
  ativo: true,
};
const REVOGADA: Mencionavel = {
  id: "b7e4f210-3a68-4c9d-8f15-6d2a0e9b4c73",
  tipo: "humano",
  nome: "Sara Almeida",
  papel: "Atendimento",
  ativo: false,
};
const LEVINDO: Mencionavel = {
  id: "levindo",
  tipo: "agente",
  nome: "Levindo",
  papel: "Crédito",
  ativo: true,
};
const TODOS = [CAMILA, DANI, REVOGADA, LEVINDO];

// ═══════════ C4 — o dado gravado é o id, não o texto ═══════════

test("mencionar grava o uuid da pessoa, nunca o nome digitado", () => {
  const texto = "Audiometria veio pior à direita. @cam";
  const g = gatilhoMencao(texto, texto.length);
  assert.ok(g);
  const { mencao, texto: final } = aplicarMencao(texto, texto.length, g, CAMILA);

  assert.equal(mencao.id, CAMILA.id);
  assert.match(mencao.id, /^[0-9a-f-]{36}$/, "o alvo tem de ser uuid");
  assert.ok(final.includes("@Camila Rocha"), "o texto exibe o nome");

  const p = payloadMencaoCriada(mencao, "nota", "11111111-2222-3333-4444-555555555555", final);
  assert.equal(p.mencionado_id, CAMILA.id);
  assert.notEqual(p.mencionado_id, "Camila Rocha");
  assert.notEqual(p.mencionado_id, "@Camila Rocha");
  assert.equal(p.origem_tipo, "nota");
  assert.equal(p.origem_id, "11111111-2222-3333-4444-555555555555");
  assert.ok(p.trecho.length > 0);
});

test("payload de mencao_criada tem exatamente as 4 chaves do contrato §5.2", () => {
  const g = gatilhoMencao("@dan", 4)!;
  const { mencao } = aplicarMencao("@dan", 4, g, DANI);
  const p = payloadMencaoCriada(mencao, "tarefa", "aaaa", "avisar @Dani Alves");
  assert.deepEqual(Object.keys(p).sort(), ["mencionado_id", "origem_id", "origem_tipo", "trecho"]);
});

test("caixa diferente do mesmo nome não cria alvo diferente — os dois viram o mesmo uuid", () => {
  // o bug do Kommo: @Dani e @DANI eram duas coisas
  const a = aplicarMencao("@dani", 5, gatilhoMencao("@dani", 5)!, DANI).mencao;
  const b = aplicarMencao("@DANI", 5, gatilhoMencao("@DANI", 5)!, DANI).mencao;
  assert.equal(a.id, b.id);
  assert.equal(a.rotulo, b.rotulo);
});

test("mencionar agente grava o id do agente igual ao humano (D4: grava, não age)", () => {
  const g = gatilhoMencao("pergunta pro @lev", 17)!;
  const { mencao } = aplicarMencao("pergunta pro @lev", 17, g, LEVINDO);
  assert.equal(mencao.id, "levindo");
  assert.equal(mencao.tipo, "agente");
  assert.equal(payloadMencaoCriada(mencao, "nota", "x", "pergunta pro @Levindo").mencionado_id, "levindo");
});

// ═══════════ gatilho ═══════════

test("arroba de e-mail não abre autocomplete", () => {
  assert.equal(gatilhoMencao("mandei pro joao@meescuta.com", 27), null);
});

test("arroba no início do campo abre autocomplete", () => {
  assert.deepEqual(gatilhoMencao("@ca", 3), { inicio: 0, termo: "ca" });
});

test("espaço depois da arroba fecha o autocomplete", () => {
  assert.equal(gatilhoMencao("@ ola", 5), null);
});

test("o gatilho é o da arroba mais próxima do cursor", () => {
  const t = "@Camila Rocha viu? @dan";
  assert.deepEqual(gatilhoMencao(t, t.length), { inicio: 19, termo: "dan" });
});

// ═══════════ C5 — agentes em categoria separada ═══════════

test("humanos e agentes saem em listas separadas", () => {
  const { humanos, agentes } = separarMencionaveis(TODOS, "");
  assert.deepEqual(humanos.map((m) => m.nome), ["Camila Rocha", "Dani Alves", "Sara Almeida"]);
  assert.deepEqual(agentes.map((m) => m.nome), ["Levindo"]);
});

test("o filtro casa por qualquer palavra do nome", () => {
  assert.deepEqual(separarMencionaveis(TODOS, "rocha").humanos.map((m) => m.id), [CAMILA.id]);
  assert.deepEqual(separarMencionaveis(TODOS, "cam").humanos.map((m) => m.id), [CAMILA.id]);
});

test("membro revogado continua mencionável (§6.1 nunca bloqueia)", () => {
  assert.ok(separarMencionaveis(TODOS, "sara").humanos.some((m) => m.id === REVOGADA.id));
});

// ═══════════ C8 — sem acesso avisa, não bloqueia ═══════════

test("mencionar quem não tem acesso marca a menção e gera aviso só pro autor", () => {
  const g = gatilhoMencao("@sar", 4)!;
  const { mencao } = aplicarMencao("@sar", 4, g, REVOGADA);
  assert.equal(mencao.semAcesso, true);
  assert.equal(mencao.id, REVOGADA.id, "sem acesso ainda assim resolve para uuid");
  const aviso = avisoSemAcesso([mencao]);
  assert.ok(aviso && aviso.includes("Sara Almeida"));
  assert.ok(aviso.includes("A nota foi salva."), "o aviso confirma que a escrita não foi bloqueada");
});

test("sem menção problemática não há aviso", () => {
  const g = gatilhoMencao("@cam", 4)!;
  const { mencao } = aplicarMencao("@cam", 4, g, CAMILA);
  assert.equal(avisoSemAcesso([mencao]), null);
});

// ═══════════ menções vivas ═══════════

test("menção apagada do rascunho não vira evento", () => {
  const g = gatilhoMencao("@cam", 4)!;
  const { mencao } = aplicarMencao("@cam", 4, g, CAMILA);
  assert.deepEqual(mencoesVivas("mudei de ideia, sem menção", [mencao]), []);
});

test("menção que continua no texto sobrevive", () => {
  const g = gatilhoMencao("@cam", 4)!;
  const { mencao, texto } = aplicarMencao("@cam", 4, g, CAMILA);
  assert.deepEqual(mencoesVivas(texto, [mencao]).map((m) => m.id), [CAMILA.id]);
});

test("mencionar duas vezes e apagar uma mantém exatamente uma", () => {
  const g = gatilhoMencao("@cam", 4)!;
  const { mencao } = aplicarMencao("@cam", 4, g, CAMILA);
  const duas = [mencao, { ...mencao }];
  assert.equal(mencoesVivas("@Camila Rocha vê isso?", duas).length, 1);
  assert.equal(mencoesVivas("@Camila Rocha e @Camila Rocha", duas).length, 2);
});

// ═══════════ destaque na leitura ═══════════

test("o destaque usa as menções resolvidas, não regex em texto livre", () => {
  const segs = segmentosComMencao("oi @Camila Rocha, vê isso", [
    { rotulo: "@Camila Rocha", tipo: "humano" },
  ]);
  assert.deepEqual(segs, [
    { tipo: "texto", texto: "oi " },
    { tipo: "mencao", texto: "@Camila Rocha", alvo: "humano" },
    { tipo: "texto", texto: ", vê isso" },
  ]);
});

test("nota sem menção resolvida não ganha menção inventada", () => {
  const segs = segmentosComMencao("falei com o @fulano de tal", []);
  assert.deepEqual(segs, [{ tipo: "texto", texto: "falei com o @fulano de tal" }]);
});
