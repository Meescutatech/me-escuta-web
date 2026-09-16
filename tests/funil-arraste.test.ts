import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirAlvo } from "../lib/funil/decidir-alvo.ts";
import type { Snapshot } from "../lib/funil/decidir-alvo.ts";

/**
 * Fixture: 3 colunas regulares + 2 terminais empilhados (Venda ganha / Venda perdida).
 * Medidas em px, copiadas da estrutura real do quadro: os terminais compartilham a mesma
 * faixa de X (624–824) e se distinguem só pelo Y.
 */
function criarSnapshot(scrollLeft = 0): Snapshot {
  return {
    scrollLeft,
    colunas: [
      { etapa: "captacao", esquerda: 0, direita: 200, topo: 0, base: 600, cards: [] },
      { etapa: "qualificacao", esquerda: 208, direita: 408, topo: 0, base: 600, cards: [] },
      { etapa: "proposta", esquerda: 416, direita: 616, topo: 0, base: 600, cards: [] },
      { etapa: "venda_ganha", esquerda: 624, direita: 824, topo: 36, base: 120, cards: [] },
      { etapa: "venda_perdida", esquerda: 624, direita: 824, topo: 128, base: 212, cards: [] },
    ],
  };
}

/* ── Bug 1: terminais empilhados ────────────────────────────────────────────── */

test("ponteiro sobre o 2º terminal → alvo = venda_perdida", () => {
  const snap = criarSnapshot();
  const alvo = decidirAlvo(snap, 724, 170, 0, null);
  assert.equal(alvo?.etapa, "venda_perdida");
});

test("ponteiro sobre o 1º terminal → alvo = venda_ganha", () => {
  const snap = criarSnapshot();
  const alvo = decidirAlvo(snap, 724, 80, 0, null);
  assert.equal(alvo?.etapa, "venda_ganha");
});

test("ponteiro entre os terminais (gap) → mantém último alvo", () => {
  const snap = criarSnapshot();
  const anterior = { etapa: "proposta", indice: 0 };
  const alvo = decidirAlvo(snap, 724, 124, 0, anterior);
  assert.deepEqual(alvo, anterior);
});

/* ── Bug 2: scroll não descontado ───────────────────────────────────────────── */

test("snapshot com scroll 0, ponteiro após rolar 400px → alvo = coluna certa", () => {
  const snap = criarSnapshot(0);
  // "proposta" estava em 416–616 quando o snapshot foi tirado (scrollLeft=0).
  // Após rolar 400px, ela está visualmente em 16–216.
  // Ponteiro em clientX=100 deve acertar "proposta", não "captação".
  const alvo = decidirAlvo(snap, 100, 300, 400, null);
  assert.equal(alvo?.etapa, "proposta");
});

test("scroll não altera hit-test de coluna regular sem deslocamento", () => {
  const snap = criarSnapshot(0);
  // Sem scroll, ponteiro em x=100 acerta "captação" normalmente.
  const alvo = decidirAlvo(snap, 100, 300, 0, null);
  assert.equal(alvo?.etapa, "captacao");
});

test("scroll + terminais: ponteiro sobre terminal após scroll → alvo correto", () => {
  const snap = criarSnapshot(200);
  // Terminais em 624–824 no snapshot (scrollLeft=200).
  // Scroll atual = 600 → delta = 400 → terminais visualmente em 224–424.
  // Ponteiro em clientX=300, y=170 (faixa do 2º terminal).
  const alvo = decidirAlvo(snap, 300, 170, 600, null);
  assert.equal(alvo?.etapa, "venda_perdida");
});
