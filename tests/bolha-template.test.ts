import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * TEMPLATE É TEXTO, NÃO MÍDIA — reportado em produção, 21/09/2026.
 *
 * *"Os templates ainda não aparecem no chat"*. A bolha saía com ÍCONE DE FOTO, o rótulo
 * `Mensagem (template)` e a frase "visualização chega com a pipeline de mídia". A causa não era a
 * pipeline: `ConteudoBolha` não tinha galho para `template`, então a mensagem escorria até o
 * fallback lá embaixo, que é de mídia e cujo rótulo genérico é `Mensagem (${tipo})`.
 *
 * MEDIDO em `core.mensagem` no mesmo dia, nos dois templates enviados (18:38 e 18:39):
 * `tipo_conteudo='template'`, `corpo` VAZIO, `status_entrega='lido'` — chegaram e foram lidos.
 * O runtime passou a gravar o corpo montado a partir daí; as linhas ANTERIORES ficam vazias para
 * sempre, e é por isso que o galho tem dois lados e o lado vazio diz o que houve.
 *
 * ── Por que asserção de FONTE ────────────────────────────────────────────────────────────────
 * `ConteudoBolha` é um componente dentro de `inbox.tsx` e a decisão é uma cadeia de `if` sobre
 * `tipo`; não há função pura para chamar, e este repo não monta React nos testes. Então o que dá
 * para provar aqui é a ORDEM da cadeia — que é exatamente o que estava errado. É guarda mais fraca
 * que um render de verdade, e está escrito assim de propósito para ninguém confundir as duas.
 * VERIFICADA POR MUTAÇÃO em 21/09: apagar o galho deixa estes testes vermelhos.
 */

const inbox = readFileSync(new URL("../components/conversas/inbox.tsx", import.meta.url), "utf8");

test("existe um galho para `template` em ConteudoBolha", () => {
  assert.match(inbox, /if \(tipo === "template"\) \{/, "template não tem galho — cai no fallback de mídia");
});

test("o galho do template vem ANTES do fallback de mídia — ordem é a causa do defeito", () => {
  const galho = inbox.indexOf('if (tipo === "template") {');
  const fallback = inbox.indexOf("`Mensagem (${tipo})`");
  assert.ok(galho > -1 && fallback > -1, "âncoras sumiram — reescreva este teste junto com o render");
  assert.ok(galho < fallback, "o galho está DEPOIS do fallback: a mensagem nunca chega nele");
});

test("com corpo mostra o corpo; sem corpo DIZ que o texto não ficou registrado", () => {
  const trecho = inbox.slice(inbox.indexOf('if (tipo === "template") {'));
  assert.match(trecho.slice(0, 700), /m\.corpo \?/, "não distingue a linha com corpo da sem corpo");
  assert.match(
    trecho.slice(0, 700),
    /Template enviado — o texto não ficou registrado/,
    "o lado vazio não explica o que houve",
  );
});

test("o fallback de mídia continua existindo para tipo DESCONHECIDO de verdade", () => {
  // não é para o conserto virar um `if` por tipo: o rótulo honesto segue sendo o degrade certo
  // para o que a tela realmente não conhece.
  assert.match(inbox, /`Mensagem \(\$\{tipo\}\)`/);
});
