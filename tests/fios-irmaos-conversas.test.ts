import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * 15/09/2026 — OS FIOS IRMÃOS NA TELA DE CONVERSAS.
 *
 * Pedido do COO, com print do Kommo: *"Abrimos um fio novo mas bem dividido e parecido com o kommo
 * mesma página em threads diferentes"*. Eu li "tela do lead" e construí no drawer do funil (1b,
 * `5f4c0c0`). O teste dele é outro: `/conversas?c=23084abc…`. Escopo errado, erro meu.
 *
 * ⚠️ E ESTE ARQUIVO EXISTE POR CAUSA DE UMA LACUNA QUE CUSTOU UM DEPLOY INVISÍVEL.
 *
 * O 1b subiu com 10 testes verdes, 4 mutações reprovando, typecheck e `next build` limpos — e a
 * tela mostrava um bloco só. Nenhuma das camadas que testei olhava o que é RENDERIZADO: testei a
 * ordem (regra pura), o rótulo (regra pura) e o contrato da action (texto-fonte). O buraco era
 * exatamente o meio: o componente.
 *
 * Então aqui a guarda é sobre a MONTAGEM: que o inbox receba os fios irmãos e os desenhe. Continua
 * sendo asserção sobre texto-fonte — o runner não monta React —, mas sobre o ponto certo, e cada
 * uma vai ser vista reprovando por mutação antes de contar como guarda.
 *
 * O que estes testes protegem, em ordem de dano:
 *  1. o fio irmão não chegar à tela — a conversa existe, foi respondida, e a pessoa não vê;
 *  2. a leitura carregar TODAS as mensagens de TODOS os fios — na `/conversas` isso é caro e
 *     inútil: o fio aberto já vem por `lerMensagens`, e o irmão só precisa de prévia;
 *  3. o irmão aparecer sem dizer de qual número é — é a informação que o §5.2 exige;
 *  4. REGRESSÃO: o lead de um fio só (a esmagadora maioria) ganhar seção vazia na tela.
 */

const pagina = readFileSync(new URL("../app/(app)/conversas/page.tsx", import.meta.url), "utf8");
const inbox = readFileSync(new URL("../components/conversas/inbox.tsx", import.meta.url), "utf8");

test("a página LÊ os fios irmãos do lead selecionado", () => {
  assert.match(
    pagina,
    /lerFiosIrmaos\(/,
    "sem leitura no servidor o inbox não tem o que desenhar — e foi assim que o 1b subiu invisível",
  );
});

test("a leitura entra no Promise.all que já existe — não serializa mais uma ida ao banco", () => {
  const bloco = pagina.split("await Promise.all(")[1] ?? "";
  assert.match(bloco.slice(0, 700), /lerFiosIrmaos/);
});

test("o Inbox RECEBE os fios irmãos como prop", () => {
  assert.match(pagina, /fiosIrmaos=\{/, "a prop precisa ser passada, não só calculada");
  assert.match(inbox, /fiosIrmaos/, "o componente precisa declarar e usar a prop");
});

test("o inbox DESENHA um bloco por fio irmão", () => {
  // `.map(` sobre os irmãos é o que transforma dado em tela. Sem isto a prop chega e morre —
  // exatamente o modo de falha do 1b.
  assert.match(inbox, /fiosIrmaos[\s\S]{0,400}\.map\(/);
});

test("cada bloco irmão diz de qual NÚMERO é, pelo chip (M7) — sem rótulo inventado", () => {
  assert.match(inbox, /rotuloDoFio\(/, "a etiqueta vem da regra do chip, não de string solta");
});

test("REGRESSÃO · sem irmãos, nada é desenhado — nem seção vazia", () => {
  assert.match(
    inbox,
    /fiosIrmaos[\s\S]{0,200}length\s*>\s*0|fiosIrmaos\?\.length/,
    "lead de um fio só é a maioria; seção vazia é ruído permanente para quase todo mundo",
  );
});
