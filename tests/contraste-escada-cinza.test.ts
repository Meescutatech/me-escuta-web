import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./apoio/resolucao-alias.mjs", import.meta.url);

/*
 * ── A RÉGUA QUE FALTAVA PARA O CONTRASTE ──────────────────────────────────────────────────────
 *
 * Em 22/08 duas frentes escreveram sobre a mesma coisa e saíram desencontradas: uma pôs em
 * components/funil/quadro.tsx que "`mute` #9AA1AA dá 2,43:1 sobre o board, abaixo do piso"; outra,
 * horas depois, refez a escada de cinza em tailwind.config.ts e `mute` deixou de ser #9AA1AA. O
 * comentário virou registro durável de um número que não existe mais — e ninguém tinha como
 * perceber, porque contraste era afirmação escrita à mão, medida uma vez, em prosa.
 *
 * Este teste transforma a afirmação em execução: lê os tokens VIGENTES do próprio
 * tailwind.config.ts (não uma cópia dos hex neste arquivo, que seria a mesma suposição escrita
 * duas vezes) e calcula o contraste pela fórmula do WCAG 2.x. No dia em que alguém baixar de novo
 * o degrau de cinza, é aqui que aparece — e não numa auditoria manual seis semanas depois.
 *
 * Piso: 4,5:1 (SC 1.4.3, texto normal). Os dois tokens pintam TEXTO — `mute` pinta timer do card,
 * contagem de coluna e placeholder; `suave` pinta o secundário e o aviso de padrão declarado da
 * legenda do board.
 */

/** Luminância relativa — WCAG 2.x, definição literal. */
function luminancia(hex: string): number {
  const canais = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = canais.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** As TRÊS superfícies reais do app — não hipóteses: card/painel, board e hover. */
const SUPERFICIES = { branco: "#FFFFFF", board: "#F7F7F4", hover: "#EAE9E3" } as const;
const PISO_TEXTO = 4.5; // SC 1.4.3

test("a fórmula está certa antes de eu confiar nela: preto/branco = 21:1, e cor consigo = 1:1", () => {
  assert.equal(Math.round(contraste("#000000", "#FFFFFF")), 21);
  assert.equal(Math.round(contraste("#777777", "#777777")), 1);
});

test("os tokens VIGENTES de texto (`suave` e `mute`) passam AA nas três superfícies do app", async () => {
  const { default: config } = await import("../tailwind.config.ts");
  const cores = (config as any).theme.extend.colors as Record<string, any>;

  for (const token of ["suave", "mute"] as const) {
    const hex = cores[token] as string;
    assert.match(hex, /^#[0-9A-Fa-f]{6}$/, `${token} deveria ser um hex de 6 dígitos`);
    for (const [nome, fundo] of Object.entries(SUPERFICIES)) {
      const r = contraste(hex, fundo);
      assert.ok(
        r >= PISO_TEXTO,
        `${token} ${hex} sobre ${nome} ${fundo} dá ${r.toFixed(2)}:1 — abaixo do piso ${PISO_TEXTO}:1`,
      );
    }
  }
});

test("`suave` continua sendo um degrau ACIMA de `mute` — sem isso os dois viram a mesma cor", () => {
  // é o que impede o conserto de contraste de achatar secundário e terciário: se o `mute` subir a
  // ponto de encostar no `suave`, a hierarquia do card some e a régua tem de acusar
  return import("../tailwind.config.ts").then(({ default: config }) => {
    const cores = (config as any).theme.extend.colors as Record<string, any>;
    const l = { suave: luminancia(cores.suave), mute: luminancia(cores.mute) };
    assert.ok(l.mute > l.suave, "`mute` tem de ser mais claro que `suave` (é o degrau de baixo)");
    assert.ok(
      l.mute - l.suave > 0.005,
      `separação de luminância ${(l.mute - l.suave).toFixed(4)} — abaixo disso são a mesma cor na tela`,
    );
  });
});

test("os números que o comentário de quadro.tsx cita são os medidos AGORA, não os de antes do W4", async () => {
  // o comentário é registro durável e sobrevive ao contexto zerado: se ele citar número, o número
  // tem de continuar conferindo. Estes cinco são os que ele imprime na tabelinha.
  const { default: config } = await import("../tailwind.config.ts");
  const cores = (config as any).theme.extend.colors as Record<string, any>;
  const arred = (n: number) => Number(n.toFixed(2));

  assert.equal(arred(contraste(cores.mute, SUPERFICIES.branco)), 5.65);
  assert.equal(arred(contraste(cores.mute, SUPERFICIES.board)), 5.27);
  assert.equal(arred(contraste(cores.mute, SUPERFICIES.hover)), 4.65);
  assert.equal(arred(contraste(cores.suave, SUPERFICIES.branco)), 7.32);
  assert.equal(arred(contraste(cores.suave, SUPERFICIES.board)), 6.82);
  assert.equal(arred(contraste(cores.suave, SUPERFICIES.hover)), 6.02);
});
