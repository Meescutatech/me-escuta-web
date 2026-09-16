import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * 16/09/2026 — DIVISÃO DE THREAD DE VERDADE.
 *
 * Primeira entrega (`5f94416`): cada irmão virou UMA LINHA com a prévia. O Diogo: *"eu ainda não
 * gostei, teria que ter realmente uma divisão de thread de onde foi cada conversa"*. Ele está certo
 * — o print do Kommo que ele mandou mostra os BLOCOS DE MENSAGENS empilhados, cada um com a
 * etiqueta do canal no topo e o histórico daquele número dentro. Resumo de uma linha não é thread.
 *
 * O que muda: a página passa a ler as mensagens de cada fio irmão, e o inbox desenha cada um como
 * fio de verdade, reusando o `FioLead` (o mesmo componente do drawer do funil — bolhas, blocos por
 * dia, áudio, imagem e estado de entrega já resolvidos ali).
 *
 * ── O TETO, e por que ele existe ─────────────────────────────────────────────────────────────
 * `lerMensagens` traz até 500 linhas. Sem teto, abrir a conversa de um lead com 3 fios passaria a
 * custar até 1.500 mensagens numa tela que já lê o fio aberto inteiro. Cada bloco irmão mostra as
 * ÚLTIMAS 20 e oferece "ver a conversa inteira" — o mesmo desenho do drawer, onde isso já provou
 * servir.
 *
 * ⚠️ E o que estas guardas protegem, aprendido no 1b: a prop chegar e MORRER. Três guardas minhas
 * passaram no estado quebrado em 15/09, uma delas com o render inteiro desligado por `{false && …}`.
 * Por isso aqui a condição de render é asserção própria, e cada uma vai ser vista reprovando.
 */

const pagina = readFileSync(new URL("../app/(app)/conversas/page.tsx", import.meta.url), "utf8");
const inbox = readFileSync(new URL("../components/conversas/inbox.tsx", import.meta.url), "utf8");

/*
 * ⚠️ ESTAS DUAS GUARDAS NASCERAM FURADAS E FORAM REESCRITAS PELA MUTAÇÃO — 16/09.
 *
 * A primeira versão procurava o NOME (`mensagensDosIrmaos`) na página e `/FioLead/` no arquivo do
 * inbox. As duas passaram 7/0 com o defeito aplicado:
 *   · trocar a leitura real por `Promise.resolve({})` mantém o nome da variável;
 *   · tirar o `<FioLead …/>` do render mantém o IMPORT do `FioLead` no topo.
 * Ancorar em nome não é ancorar em efeito. Quinta vez nesta sessão — por isso as duas agora exigem
 * a CHAMADA de leitura dentro do bloco dos irmãos, e o `FioLead` dentro do `.map` que o desenha.
 */

test("a página LÊ as mensagens de cada fio irmão", () => {
  // não basta existir a variável: tem de haver `lerMensagens(` sobre os ids dos irmãos
  assert.match(
    pagina,
    /idsIrmaos\.map\(\s*\(?id\)?\s*=>\s*lerMensagens\(/,
    "sem a chamada real, a prop vira objeto vazio e a thread irmã volta a ser prévia",
  );
});

test("a leitura dos irmãos entra no Promise.all que já existe", () => {
  // ⚠️ A âncora procura o Promise.all QUE CONTÉM `lerMensagens`, não o primeiro do arquivo: a
  // página tem TRÊS (linhas 200, 221 e 269), e a primeira versão deste teste lia o de
  // `lerConversas`/`lerEtapasReais`, onde "irmaos" nunca apareceria. Foi a quarta guarda minha por
  // texto-fonte ancorada no lugar errado em 15-16/09 — daí a regra: ancore no conteúdo que
  // identifica o trecho, nunca na primeira ocorrência de um padrão comum.
  const blocos = pagina.split("await Promise.all(").slice(1);
  const oDaConversa = blocos.find((b) => b.slice(0, 1200).includes("lerMensagens"));
  assert.ok(oDaConversa, "não achei o Promise.all que lê as mensagens da conversa");
  assert.match(
    oDaConversa.slice(0, 1200),
    /[Ii]rmaos/,
    "serializar mais uma ida ao banco atrasaria a abertura de TODA conversa",
  );
});

test("há TETO por fio irmão — `lerMensagens` traz até 500 e são N irmãos", () => {
  assert.match(
    inbox + pagina,
    /ULTIMAS_DO_IRMAO|slice\(-\s*\d+\s*\)/,
    "sem teto, um lead de 3 fios pede até 1.500 mensagens numa tela que já lê o fio aberto",
  );
});

test("o inbox DESENHA a thread de cada irmão com o FioLead — não uma linha de prévia", () => {
  // o import sobrevive a qualquer mutação do render; o que prova o desenho é o USO dentro do
  // `.map` dos irmãos, depois da linha onde ele começa.
  const i = inbox.indexOf("irmaos.map(");
  assert.notEqual(i, -1, "o map dos irmãos sumiu — este teste precisa ser reescrito");
  // ⚠️ janela FIXA foi o erro anterior: eu usei 2600 e a distância real era 2689 — 89 caracteres, e
  // a guarda deixou de distinguir (a mutação que tirava o FioLead dava o MESMO resultado que o
  // controle). O corpo do map termina onde a seção termina, então o fim é o `</section>`, não um
  // número que envelhece a cada comentário novo.
  const fim = inbox.indexOf("</section>", i);
  assert.notEqual(fim, -1, "não achei o fim do bloco da thread irmã");
  const corpoDoMap = inbox.slice(i, fim);
  assert.match(
    corpoDoMap,
    /<FioLead\s+mensagens=\{/,
    "thread de verdade é o FioLead com as mensagens daquele número, não um resumo",
  );
  assert.match(corpoDoMap, /mensagensDosIrmaos\[/, "cada bloco usa as mensagens DAQUELE fio");
});

test("cada thread tem o cabeçalho do número, pelo chip (M7)", () => {
  assert.match(inbox, /rotuloDoFio\(/);
});

/** o que vem ANTES da condição de render — no estado certo é só `{`. */
function guardaAntesDaCondicao(): string {
  const i = inbox.indexOf("irmaos.length > 0");
  assert.notEqual(i, -1, "a condição de render sumiu — este teste precisa ser reescrito");
  return inbox.slice(inbox.lastIndexOf("{", i), i);
}

test("o render das threads não está desligado por constante", () => {
  assert.equal(guardaAntesDaCondicao().trim(), "{");
});

test("REGRESSÃO · sem irmãos, nada é desenhado", () => {
  assert.match(inbox, /\{irmaos\.length > 0 && \(/);
});
