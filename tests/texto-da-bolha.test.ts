import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { textoDaBolha } from "../lib/conversas/texto-da-bolha.ts";

/*
 * TEMPLATE NO DRAWER DO FUNIL — 25/09/2026.
 *
 * O inbox ganhou o galho de `template` em 21/09 (28db5c0), mas o `FioLead` do funil tem um ESPELHO
 * do `ConteudoBolha` que não ganhou: lá o template continuava escorrendo até o fallback de mídia e
 * saía `Mensagem (template)` com o corpo embaixo. Espelho de regra diverge — então a regra saiu dos
 * dois componentes para `textoDaBolha`, e os dois chamam a mesma função.
 *
 * Duas camadas: (1) COMPORTAMENTO da função pura; (2) FONTE dos dois componentes, provando que eles
 * a chamam ANTES do fallback. A (2) é mais fraca que um render (o repo não monta React em teste) e
 * foi verificada por mutação no próprio fio-lead.
 */

test("template com corpo mostra o corpo", () => {
  assert.deepEqual(textoDaBolha("template", "Olá, Ana! Sua consulta é amanhã."), {
    tipo: "corpo",
    texto: "Olá, Ana! Sua consulta é amanhã.",
  });
});

test("template sem corpo diz que o texto não ficou registrado", () => {
  for (const corpo of [null, undefined, ""]) {
    assert.deepEqual(textoDaBolha("template", corpo), {
      tipo: "aviso",
      texto: "Template enviado — o texto não ficou registrado nesta mensagem.",
    });
  }
});

test("template nunca vira `Mensagem (template)`", () => {
  for (const corpo of ["oi", null]) {
    const r = textoDaBolha("TEMPLATE", corpo);
    assert.ok(r, "template não pode cair no fallback de mídia");
    assert.doesNotMatch(r.texto, /Mensagem \(template\)/);
  }
});

test("texto segue igual: corpo, ou [mensagem vazia]", () => {
  assert.deepEqual(textoDaBolha("text", "oi"), { tipo: "corpo", texto: "oi" });
  assert.deepEqual(textoDaBolha("texto", "oi"), { tipo: "corpo", texto: "oi" });
  assert.deepEqual(textoDaBolha(null, "oi"), { tipo: "corpo", texto: "oi" });
  assert.deepEqual(textoDaBolha("text", ""), { tipo: "aviso", texto: "[mensagem vazia]" });
});

test("mídia e tipo desconhecido não são decididos aqui — seguem para as bolhas tipadas", () => {
  for (const tipo of ["image", "audio", "video", "documento", "reaction", "botao", "xyz"]) {
    assert.equal(textoDaBolha(tipo, "legenda"), null, tipo);
  }
});

const fonte = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

for (const [nome, caminho] of [
  ["fio-lead (drawer do funil)", "../components/funil/fio-lead.tsx"],
  ["inbox", "../components/conversas/inbox.tsx"],
] as const) {
  test(`${nome} decide texto/template por textoDaBolha, ANTES do fallback de mídia`, () => {
    const src = fonte(caminho);
    const chamada = src.indexOf("textoDaBolha(m.tipo_conteudo, m.corpo)");
    const fallback = src.indexOf("`Mensagem (${tipo})`");
    assert.ok(chamada > -1, "o componente não chama textoDaBolha — voltou a ter espelho próprio");
    assert.ok(fallback > -1, "âncora do fallback sumiu — reescreva este teste junto com o render");
    assert.ok(chamada < fallback, "textoDaBolha vem depois do fallback: template nunca chega nela");
    // o resultado tem de ser USADO, sem condição em volta — mutação de 25/09: `tipo === "template"
    // ? null : textoDaBolha(...)` passava numa âncora que só olhava a chamada
    assert.match(
      src,
      /const texto = textoDaBolha\(m\.tipo_conteudo, m\.corpo\);\s*if \(texto\) \{/,
      "textoDaBolha chamada com condição, ou o resultado é ignorado",
    );
    // entre a chamada e o fallback, o componente não decide nada sobre template por conta própria
    const inicioDaLinha = src.lastIndexOf("\n", chamada);
    assert.doesNotMatch(src.slice(inicioDaLinha, fallback), /"template"/, "o componente voltou a decidir template");
    // o galho antigo não pode sobreviver ao lado da função: dois lugares são o defeito
    assert.doesNotMatch(src, /tipo === "text" \|\| tipo === "texto"/);
  });
}
