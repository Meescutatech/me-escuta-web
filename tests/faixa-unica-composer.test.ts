import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * 15/09/2026 — UMA FAIXA, E ELA FALA DO NÚMERO QUE VAI ENVIAR.
 *
 * Relato do Diogo, com print: *"ta esse trem feio na hora de enviar"* — e depois, quando eu troquei
 * só o texto de baixo: *"aqui não mudou nada"*. Ele estava certo: eu mexi na tarja errada.
 *
 * O composer desenha DUAS tarjas âmbar quando você escolhe outro número:
 *   · a de cima (`origem`, prop `VereditoEnvio`) fala do canal por onde a CONVERSA entrou;
 *   · a de baixo (`fioNovo`) fala do canal ESCOLHIDO, que é por onde a mensagem vai sair.
 *
 * Não é só poluição visual: com fio novo, a de cima descreve o número ERRADO. No print, ela avisa
 * "este número é de teste e só entrega a destinatários em lista de permissão" (o `teste_meta`)
 * enquanto o envio ia sair pelo `Oficial`, que é de produção e não tem lista de permissão nenhuma.
 * Aviso que descreve outro canal é pior que aviso nenhum — ele ensina a ignorar avisos.
 *
 * A guarda: com `fioNovo`, a tarja de `origem` NÃO é desenhada.
 */

const composer = readFileSync(new URL("../components/conversas/composer.tsx", import.meta.url), "utf8");

/**
 * A condição de exibição da tarja de cima, isolada do resto do arquivo.
 *
 * ⚠️ A âncora é `origem.motivo || origem.aviso` — o MIOLO da condição, que descreve a regra e não
 * muda quando alguém acrescenta um termo na frente. A primeira versão deste helper ancorava em
 * `{!interno && origem &&`, a sequência exata que o próprio conserto ia alterar: bastou entrar o
 * `!fioNovo` para o `indexOf` devolver −1 e DOIS testes ficarem vermelhos por defeito do teste, não
 * do código. Foi o segundo caso desta noite (o primeiro casou com um comentário em `actions.ts`).
 * Guarda por texto-fonte precisa se ancorar no que ela protege, nunca na linha que ela vigia.
 */
function condicaoDaTarjaDeOrigem(): string {
  const i = composer.indexOf("origem.motivo || origem.aviso");
  assert.notEqual(i, -1, "a tarja de origem sumiu do composer — este teste precisa ser reescrito");
  // recua o suficiente para pegar os termos que vêm ANTES de `origem` na mesma condição
  return composer.slice(Math.max(0, i - 120), i + 120);
}

test("com fio novo, a tarja do número da CONVERSA não aparece", () => {
  assert.match(
    condicaoDaTarjaDeOrigem(),
    /!fioNovo/,
    "sem `!fioNovo` as duas faixas empilham e a de cima fala do canal errado",
  );
});

test("sem fio novo, a tarja de origem CONTINUA aparecendo", () => {
  // o aviso de número de teste é o que faz a pessoa não descobrir depois (CA-13). Ele só perde o
  // sentido quando o envio vai por OUTRO número — fora disso, tem de continuar lá.
  const cond = condicaoDaTarjaDeOrigem();
  assert.match(cond, /origem\.motivo \|\| origem\.aviso/, "a regra de quando avisar não muda");
});

test("a faixa de fio novo diz o número de destino e traz a saída curta", () => {
  assert.match(composer, /Abre um fio novo com/);
  assert.match(composer, />\s*voltar\s*</, "a saída é curta — a frase comprida era parte do 'trem feio'");
});

test("REGRESSÃO · o bloqueio continua bloqueando — aviso some, impedimento não", () => {
  // `origem.motivo` desabilita o envio (número não cadastrado, canal desligado). Isso NÃO pode
  // sumir por causa de fio novo: seria trocar um aviso feio por um envio que falha permanente.
  assert.match(composer, /origem\.motivo\s*\?/, "o ramo de impedimento segue desenhado");
});
