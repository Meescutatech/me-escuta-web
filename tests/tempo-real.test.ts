import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASSENTAMENTO_MS,
  deveRefazer,
  estadoDoSelo,
  fmtAtras,
  montarFontesConversa,
  novosIds,
  problemasNasFontes,
} from "../lib/tempo-real.ts";

/*
 * Testes da lógica pura do tempo real (Rodada 9, fase 1) — `npm test` (node --test).
 */

test("deveRefazer: respeita a folga mínima entre refetches (rajada vira UMA releitura)", () => {
  assert.equal(deveRefazer(0, 1200, 1200), true);
  assert.equal(deveRefazer(1000, 2100, 1200), false);
  assert.equal(deveRefazer(1000, 2200, 1200), true);
});

test("novosIds: detecta só quem ENTROU; primeira leitura nunca pulsa", () => {
  const prev = new Set(["a", "b"]);
  assert.deepEqual(novosIds(prev, ["a", "b", "c"], false), ["c"]);
  assert.deepEqual(novosIds(prev, ["a"], false), []); // saída não pulsa
  assert.deepEqual(novosIds(new Set(), ["a", "b"], true), []); // primeira leitura
  assert.deepEqual(novosIds(new Set(), ["a"], false), ["a"]);
});

/*
 * F5 (Rodada 16) — a regra que conserta o inbox mudo: `canal` (Broadcast, exige canal privado) e
 * `tabela` (postgres_changes) NUNCA na mesma entrada. Juntas, elas compartilham um canal só, e o
 * privado morre com `CHANNEL_ERROR: Unauthorized` sem política em `realtime.messages` — levando o
 * postgres_changes junto. Medido: /conversas aberto, ZERO assinatura em core.conversa/core.mensagem.
 */

test("montarFontesConversa: nenhuma fonte abre canal privado", () => {
  for (const fontes of [montarFontesConversa(null), montarFontesConversa("abc-123")]) {
    assert.equal(
      fontes.filter((f) => f.canal).length,
      0,
      "canal privado é assinatura garantidamente morta enquanto não houver política",
    );
  }
});

test("montarFontesConversa: PROIBIDO 'canal' e 'tabela' na mesma entrada", () => {
  const fontes = montarFontesConversa("abc-123");
  assert.deepEqual(problemasNasFontes(fontes), []);
  for (const f of fontes) assert.ok(!(f.canal && f.tabela));
});

test("problemasNasFontes: acusa a fiação antiga e a fonte vazia", () => {
  const antiga = [{ canal: "conversas", tabela: { schema: "core", table: "conversa" } }];
  assert.equal(problemasNasFontes(antiga).length, 1);
  assert.match(problemasNasFontes(antiga)[0], /mesma entrada/);
  assert.equal(problemasNasFontes([{}]).length, 1);
});

test("montarFontesConversa: sem conversa aberta assina só a lista; com conversa, também a thread filtrada", () => {
  assert.deepEqual(montarFontesConversa(null), [
    { tabela: { schema: "core", table: "conversa" } },
  ]);
  assert.deepEqual(montarFontesConversa("abc-123"), [
    { tabela: { schema: "core", table: "conversa" } },
    { tabela: { schema: "core", table: "mensagem", filter: "conversa_id=eq.abc-123" } },
  ]);
});

test("fmtAtras: agora / segundos / minutos / horas", () => {
  assert.equal(fmtAtras(0), "agora");
  assert.equal(fmtAtras(4.9), "agora");
  assert.equal(fmtAtras(32), "há 32s");
  assert.equal(fmtAtras(59.9), "há 59s");
  assert.equal(fmtAtras(60), "há 1min");
  assert.equal(fmtAtras(59 * 60), "há 59min");
  assert.equal(fmtAtras(3600), "há 1h");
});

/*
 * R16-06bis — o selo só acende com EVIDÊNCIA de entrega.
 * Medido: o cliente diz SUBSCRIBED em ~40 ms, mas o servidor leva de 2 ms (quente) a 2782 ms
 * (frio) para registrar a assinatura, e escrita feita nessa janela SE PERDE (2 de 4 rodadas).
 * Acender no SUBSCRIBED faria a tela mentir exatamente na janela em que ela está mais cega.
 */

test("estadoDoSelo: SUBSCRIBED sozinho NÃO é 'ao vivo' — é 'conectando'", () => {
  assert.equal(
    estadoDoSelo({ todosSubscribed: true, recebeuEvento: false, assentou: false }),
    "conectando",
  );
});

test("estadoDoSelo: um evento que chegou é prova direta — acende na hora", () => {
  assert.equal(
    estadoDoSelo({ todosSubscribed: true, recebeuEvento: true, assentou: false }),
    "ao-vivo",
  );
});

test("estadoDoSelo: passado o assentamento, acende mesmo em tela parada", () => {
  assert.equal(
    estadoDoSelo({ todosSubscribed: true, recebeuEvento: false, assentou: true }),
    "ao-vivo",
  );
});

test("estadoDoSelo: sem assinatura é degradado, com ou sem relógio", () => {
  assert.equal(
    estadoDoSelo({ todosSubscribed: false, recebeuEvento: false, assentou: false }),
    "degradado",
  );
  assert.equal(
    estadoDoSelo({ todosSubscribed: false, recebeuEvento: false, assentou: true }),
    "degradado",
  );
  // caso de borda honesto: o canal caiu DEPOIS de ter entregue. Não é mais "ao vivo".
  assert.equal(
    estadoDoSelo({ todosSubscribed: false, recebeuEvento: true, assentou: true }),
    "degradado",
  );
});

test("o assentamento tem folga sobre a pior janela medida (2782 ms a frio)", () => {
  assert.ok(ASSENTAMENTO_MS > 2782, "o relógio não pode ser mais curto que a janela observada");
  assert.equal(ASSENTAMENTO_MS, 5_000);
});
