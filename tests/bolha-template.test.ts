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
 * Desde 25/09 a decisão do texto é pura, em `lib/conversas/texto-da-bolha.ts`, e é provada em
 * `tests/texto-da-bolha.test.ts`. Este arquivo continua guardando a ORDEM no `inbox.tsx` — que o
 * template chega à função antes do fallback de mídia —, porque este repo não monta React nos testes.
 * É guarda mais fraca que um render de verdade, e está escrito assim de propósito.
 */

const inbox = readFileSync(new URL("../components/conversas/inbox.tsx", import.meta.url), "utf8");

// 25/09 · o galho saiu do componente para `textoDaBolha` (lib/conversas/texto-da-bolha.ts), que o
// inbox e o `FioLead` do funil chamam — o espelho do funil não tinha o galho. As guardas de
// comportamento e de ordem (chamada ANTES do fallback, nos dois componentes) moram agora em
// tests/texto-da-bolha.test.ts. Aqui fica só a âncora do inbox.
test("ConteudoBolha decide template por textoDaBolha, antes do fallback de mídia", () => {
  const galho = inbox.indexOf("textoDaBolha(m.tipo_conteudo, m.corpo)");
  const fallback = inbox.indexOf("`Mensagem (${tipo})`");
  assert.ok(galho > -1 && fallback > -1, "âncoras sumiram — reescreva este teste junto com o render");
  assert.ok(galho < fallback, "o galho está DEPOIS do fallback: a mensagem nunca chega nele");
});

test("o fallback de mídia continua existindo para tipo DESCONHECIDO de verdade", () => {
  // não é para o conserto virar um `if` por tipo: o rótulo honesto segue sendo o degrade certo
  // para o que a tela realmente não conhece.
  assert.match(inbox, /`Mensagem \(\$\{tipo\}\)`/);
});
