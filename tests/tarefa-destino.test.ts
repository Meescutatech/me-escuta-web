import { test } from "node:test";
import assert from "node:assert/strict";
import { destinoDaTarefa, idDaAncora } from "../lib/tarefas/destino.ts";

/**
 * O clique numa tarefa abre A CONVERSA na altura em que a tarefa nasceu (31/08). O que estes
 * testes protegem não é a string da URL: é a PROMESSA de cair no ponto certo do fio — e o caso
 * chato é a tarefa mais antiga que tudo o que foi carregado, onde a tela tem de dizer que é
 * aproximação em vez de rolar para o fim como se tivesse achado.
 */

const CRIADA = "2026-08-30T14:00:00.000Z";

test("tarefa com lead leva para a conversa, com o instante como âncora", () => {
  const d = destinoDaTarefa({ lead_id: "abc", criado_em: CRIADA });
  assert.ok(d);
  const u = new URL(d, "http://x");
  assert.equal(u.pathname, "/conversas");
  assert.equal(u.searchParams.get("lead"), "abc");
  assert.equal(u.searchParams.get("em"), CRIADA);
});

test("tarefa interna (sem lead) não vira link — não há conversa para abrir", () => {
  assert.equal(destinoDaTarefa({ lead_id: null, criado_em: CRIADA }), null);
});

test("tarefa sem criado_em ainda abre a conversa, só sem âncora", () => {
  const d = destinoDaTarefa({ lead_id: "abc", criado_em: null });
  assert.equal(d, "/conversas?lead=abc");
});

test("lead_id com caracteres especiais é codificado", () => {
  const d = destinoDaTarefa({ lead_id: "a b&c", criado_em: null });
  assert.equal(new URL(d!, "http://x").searchParams.get("lead"), "a b&c");
});

const FIO = [
  { id: "m1", criado_em: "2026-08-30T12:00:00.000Z" },
  { id: "m2", criado_em: "2026-08-30T13:59:00.000Z" },
  { id: "m3", criado_em: "2026-08-30T14:30:00.000Z" },
];

test("âncora é a última mensagem ANTERIOR ao instante da tarefa", () => {
  assert.deepEqual(idDaAncora(FIO, CRIADA), { id: "m2", exata: true });
});

test("mensagem exatamente no instante conta como a âncora", () => {
  assert.deepEqual(idDaAncora(FIO, "2026-08-30T13:59:00.000Z"), { id: "m2", exata: true });
});

test("fio fora de ordem não confunde a escolha", () => {
  const embaralhado = [FIO[2], FIO[0], FIO[1]];
  assert.deepEqual(idDaAncora(embaralhado, CRIADA), { id: "m2", exata: true });
});

test("tarefa anterior a tudo que carregou: cai na mais antiga e SE DECLARA aproximada", () => {
  assert.deepEqual(idDaAncora(FIO, "2026-08-01T00:00:00.000Z"), { id: "m1", exata: false });
});

test("sem âncora, sem fio ou com data inválida: não força ponto nenhum", () => {
  assert.equal(idDaAncora(FIO, null), null);
  assert.equal(idDaAncora(FIO, "banana"), null);
  assert.equal(idDaAncora([], CRIADA), null);
});

test("mensagem com data corrompida é ignorada, não derruba a busca", () => {
  const comLixo = [...FIO, { id: "mx", criado_em: "sem data" }];
  assert.deepEqual(idDaAncora(comLixo, CRIADA), { id: "m2", exata: true });
});

/**
 * Guarda de REGRESSÃO na página (o corpo é server component, não dá para importar aqui): o
 * fallback silencioso `conversas[0]` quando alguém PEDIU uma conversa foi o bug que abria o fio
 * errado — e, com a âncora, abriria o fio errado com uma bolha anelada dizendo "é aqui".
 */
test("página de conversas não volta a cair na primeira conversa quando o alvo foi pedido", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../app/(app)/conversas/page.tsx", import.meta.url), "utf8");
  assert.match(src, /const alvoPedido =/);
  assert.match(src, /alvoPedido \? null : conversas\[0\]\?\.id/);
  assert.match(src, /alvoNaoEncontrado=\{alvoNaoEncontrado\}/);
  assert.match(src, /ancoraEm=\{searchParams\.em \?\? null\}/);
});
