import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chaveLeitura,
  criadaPorAgente,
  ehTarefa,
  fraseF8,
  textoVenceEm,
} from "../components/notificacoes/regras.ts";
import type { Notificacao } from "../lib/notificacoes.ts";

/*
 * Sino, F8 (0306/0307): a espécie nova `tarefa_vencendo`, a tarefa criada pelo Jarvis com nome
 * próprio na frase, e a CHAVE de leitura que carrega a espécie (ler "atribuída" não lê
 * "vence em breve"). Espécie que o cliente não conhece nunca vira frase vazia.
 */

// `especie` alargada: a view devolve valores que a uniao de lib/notificacoes.ts ainda nao lista
function n(p: Omit<Partial<Notificacao>, "especie"> & { especie: string }): Notificacao {
  return {
    id: "n1",
    quando: "2026-08-27T10:00:00Z",
    lida_em: null,
    lead_id: null,
    trecho: null,
    titulo: "Confirmar exame",
    ator: null,
    ator_nome: null,
    origem_tipo: null,
    origem_id: null,
    mencao_id: null,
    tarefa_id: "t1",
    prazo: null,
    respondida_em: null,
    ...(p as Partial<Notificacao>),
  } as Notificacao;
}

test("vence em breve: frase própria com o título", () => {
  assert.deepEqual(fraseF8(n({ especie: "tarefa_vencendo" })), {
    forte: "Tarefa vence em breve",
    resto: " — Confirmar exame",
  });
});

test("tarefa do Jarvis: o nome dele na frase, pela origem (0298) ou pelo ator agente", () => {
  assert.deepEqual(fraseF8(n({ especie: "tarefa_atribuida", origem_tipo: "jarvis_conversa", ator: "agente:jarvis" })), {
    forte: "Jarvis",
    resto: " criou uma tarefa para você",
  });
  assert.ok(criadaPorAgente(n({ especie: "tarefa_atribuida", ator: "agente:jarvis" })));
  assert.equal(fraseF8(n({ especie: "tarefa_atribuida", ator: "agente:levindo" })).forte, "Levindo");
  // humano continua com a frase antiga
  assert.equal(fraseF8(n({ especie: "tarefa_atribuida", ator_nome: "Sarah" })).forte, "Sarah");
});

test("espécie desconhecida não vira frase vazia", () => {
  const f = fraseF8(n({ especie: "cobertura_atribuicao_degradada", titulo: "Cobertura caiu", tarefa_id: null }));
  assert.equal(f.forte, "Cobertura caiu");
});

test("chave de leitura carrega a espécie; menção não tem chave (usa mencao_lida)", () => {
  assert.equal(chaveLeitura(n({ especie: "tarefa_vencendo", tarefa_id: "abc" })), "tarefa:abc:tarefa_vencendo");
  assert.equal(chaveLeitura(n({ especie: "tarefa_atribuida", tarefa_id: "abc" })), "tarefa:abc:tarefa_atribuida");
  assert.equal(chaveLeitura(n({ especie: "mencao", mencao_id: "m", tarefa_id: null })), null);
  assert.ok(!ehTarefa(n({ especie: "mencao", tarefa_id: null })));
});

test("vence em: minutos, horas, e vazio quando já passou ou não há prazo", () => {
  const agora = Date.UTC(2026, 7, 27, 12, 0, 0);
  assert.equal(textoVenceEm("2026-08-27T12:40:00Z", agora), "vence em 40 min");
  assert.equal(textoVenceEm("2026-08-27T13:00:00Z", agora), "vence em 1 h");
  assert.equal(textoVenceEm("2026-08-27T13:30:00Z", agora), "vence em 1 h 30 min");
  assert.equal(textoVenceEm("2026-08-27T11:00:00Z", agora), "");
  assert.equal(textoVenceEm(null, agora), "");
});
