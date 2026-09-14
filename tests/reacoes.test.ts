import { test } from "node:test";
import assert from "node:assert/strict";
import { ehReacao, resolverReacoes, textoDoSelo } from "../lib/conversas/reacoes.ts";
import type { Mensagem } from "../lib/dados/conversas.ts";

/*
 * Testes da lógica pura das reações na thread (E2) — roda com `npm test`
 * (node --test com type stripping, sem framework externo).
 *
 * O teto que estes testes encarnam foi medido contra produção em 10/09: das 31 reações com alvo,
 * só 4 apontam para mensagens que estão no nosso ledger. As outras 27 reagiram a mensagens que a
 * Sara mandou pelo Kommo. Por isso a regra tem DOIS caminhos, e os dois são testados.
 */

let seq = 0;
function msg(over: Partial<Mensagem> & { corpo?: string | null }): Mensagem {
  seq += 1;
  return {
    id: over.id ?? `id-${seq}`,
    direcao: over.direcao ?? "entrada",
    tipo_conteudo: over.tipo_conteudo ?? "texto",
    corpo: over.corpo ?? "oi",
    criado_em: over.criado_em ?? `2026-09-10T10:00:${String(seq).padStart(2, "0")}Z`,
    wamid: over.wamid ?? `wamid.${seq}`,
    reacao_alvo_wamid: over.reacao_alvo_wamid ?? null,
  } as Mensagem;
}
const reacao = (emoji: string, alvo: string | null, extra: Partial<Mensagem> = {}) =>
  msg({ tipo_conteudo: "reacao", corpo: emoji, reacao_alvo_wamid: alvo, ...extra });

// ─────────── ehReacao ───────────

test("reação é reconhecida em PT (ingestor) e EN (histórico)", () => {
  for (const t of ["reacao", "reaction", "REACAO"]) assert.equal(ehReacao(t), true, t);
  for (const t of ["texto", "botao", null, undefined, ""]) assert.equal(ehReacao(t), false, String(t));
});

// ─────────── regra 1: alvo presente → selo, sai da linha do tempo ───────────

test("reação com alvo PRESENTE vira selo no alvo e sai da linha do tempo — é o 'colar na mensagem'", () => {
  const alvo = msg({ direcao: "saida", corpo: "Consegue vir quinta?", wamid: "wamid.ALVO" });
  const r = reacao("👍🏻", "wamid.ALVO");
  const { linhaDoTempo, selos } = resolverReacoes([alvo, r]);

  assert.deepEqual(linhaDoTempo.map((m) => m.id), [alvo.id], "a reação NÃO é mais uma bolha");
  assert.deepEqual(selos.get(alvo.id), ["👍🏻"]);
});

test("duas reações no mesmo alvo empilham na ordem em que chegaram", () => {
  const alvo = msg({ wamid: "wamid.A" });
  const { selos } = resolverReacoes([alvo, reacao("👍", "wamid.A"), reacao("❤️", "wamid.A")]);
  assert.deepEqual(selos.get(alvo.id), ["👍", "❤️"]);
});

// ─────────── regra 2: desfazer ───────────

test("reação DESFEITA (emoji vazio) tira o último selo do alvo e não vira bolha", () => {
  // A Meta manda `reaction` sem emoji quando a pessoa desfaz. Mostrar "reagiu com nada" seria
  // ruído; manter o selo antigo seria mentira.
  const alvo = msg({ wamid: "wamid.A" });
  const { linhaDoTempo, selos } = resolverReacoes([alvo, reacao("👍", "wamid.A"), reacao("", "wamid.A")]);
  assert.equal(selos.has(alvo.id), false, "o selo sumiu");
  assert.deepEqual(linhaDoTempo.map((m) => m.id), [alvo.id]);
});

// ─────────── regra 3: alvo ausente → bolha honesta ───────────

test("reação cujo alvo NÃO está na conversa fica na linha do tempo — é o caso dos 27 de produção", () => {
  // O alvo foi uma mensagem que a Sara mandou pelo Kommo. Não temos a linha. Não se inventa.
  const outra = msg({ wamid: "wamid.X" });
  const r = reacao("🙏", "wamid.MANDADA-PELO-KOMMO");
  const { linhaDoTempo, selos } = resolverReacoes([outra, r]);
  assert.deepEqual(linhaDoTempo.map((m) => m.id), [outra.id, r.id], "a reação continua visível");
  assert.equal(selos.size, 0, "nenhum selo inventado");
});

test("reação SEM alvo (anterior ao RF-4.5, ou ambiente sem a coluna 0333) fica na linha do tempo", () => {
  // É também o comportamento quando a `0333` ainda não foi aplicada: o select degrada, a coluna
  // chega ausente, e toda reação cai aqui — honesto, nunca um selo no lugar errado.
  const r = reacao("👍", null);
  const { linhaDoTempo, selos } = resolverReacoes([msg({}), r]);
  assert.ok(linhaDoTempo.some((m) => m.id === r.id));
  assert.equal(selos.size, 0);
});

// ─────────── regra 4: nada a dizer ───────────

test("reação sem alvo E sem emoji some — não há nada a dizer sobre ela", () => {
  const r = reacao("", null);
  const { linhaDoTempo } = resolverReacoes([msg({}), r]);
  assert.equal(linhaDoTempo.some((m) => m.id === r.id), false);
});

// ─────────── o alvo é por WAMID, não por id ───────────

test("o alvo é resolvido por wamid — mensagem sem wamid nunca recebe selo", () => {
  const semWamid = msg({ wamid: null });
  const { selos } = resolverReacoes([semWamid, reacao("👍", "wamid.qualquer")]);
  assert.equal(selos.size, 0);
});

test("mensagens que não são reação passam intactas e na mesma ordem", () => {
  const a = msg({}), b = msg({ tipo_conteudo: "botao", corpo: "SIM" }), c = msg({ direcao: "saida" });
  const { linhaDoTempo } = resolverReacoes([a, b, c]);
  assert.deepEqual(linhaDoTempo.map((m) => m.id), [a.id, b.id, c.id]);
});

// ─────────── textoDoSelo ───────────

test("emojis repetidos viram contagem, como no WhatsApp", () => {
  assert.equal(textoDoSelo(["👍"]), "👍");
  assert.equal(textoDoSelo(["👍", "👍"]), "👍 2");
  assert.equal(textoDoSelo(["👍", "❤️", "👍"]), "👍 2 ❤️");
});
