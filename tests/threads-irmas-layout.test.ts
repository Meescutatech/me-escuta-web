import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * 16/09/2026 — O ACABAMENTO DAS THREADS IRMÃS: dois defeitos de LAYOUT, nenhum de dado.
 *
 * Medidos na tela viva (produção `4ec6780`), com o DOM na mão — porque nesta feature dez
 * instrumentos já deram conclusão errada e só o screenshot acertou:
 *
 *   caixa da irmã  `max-h-[420px]`  scrollTop 61 de 61  → rolada até o FIM
 *   fio principal  `rolagemRef`     scrollTop 1087 de 1104 → rolada até o FIM
 *
 * DEFEITO 1 · a primeira bolha da irmã fica cortada atrás do cabeçalho. O `FioLead` abre "no
 * presente": sobe até o primeiro ancestral rolável e faz `scrollTop = scrollHeight`. No drawer do
 * funil isso é o certo. Dentro da caixa de 420px da irmã, come os 61px de cima — e a prova por
 * efeito é direta: zerar o `scrollTop` na tela viva devolve a bolha inteira.
 *
 * DEFEITO 2 · a conversa aberta sai de vista por cima. NÃO é ordem de markup: a seção das irmãs
 * já está depois das mensagens, no mesmo contêiner. O errado é a ÂNCORA — o `<div ref={fimRef} />`
 * ficou DEPOIS do bloco das irmãs, então "rolar para o fim" aterrissa nas irmãs. Os cinco
 * consumidores do `fimRef` (abertura, mensagem nova, envio, "ver no fio", proposta do Jarvis)
 * querem o fim DO FIO ABERTO — nenhum quer o fim do documento. Por isso se move a âncora, e não a
 * seção: um `<div/>` de lugar conserta os cinco de uma vez, sem tocar em quem chama.
 *
 * ⚠️ Estas guardas foram vistas REPROVANDO antes de virarem guarda. Em 15-16/09, seis guardas
 * minhas passaram no estado quebrado (o registro está no CLAUDE.md), e os três padrões do erro
 * eram sempre os mesmos: ancorar no NOME, ancorar na LINHA que o conserto altera, e janela FIXA de
 * N caracteres. Aqui: ancora-se no USO dentro da tag, na ORDEM entre dois pontos do arquivo, e
 * toda janela é delimitada pelo fechamento real.
 */

const inbox = readFileSync(new URL("../components/conversas/inbox.tsx", import.meta.url), "utf8");
const fioLead = readFileSync(new URL("../components/funil/fio-lead.tsx", import.meta.url), "utf8");
const drawer = readFileSync(new URL("../components/funil/drawer-card.tsx", import.meta.url), "utf8");

/** A tag `<FioLead …/>` que o bloco das irmãs desenha, delimitada pelo fechamento REAL. */
function tagDoFioIrmao(): string {
  const i = inbox.indexOf("irmaos.map(");
  assert.notEqual(i, -1, "o map dos irmãos sumiu — este teste precisa ser reescrito");
  const fimDaSecao = inbox.indexOf("</section>", i);
  assert.notEqual(fimDaSecao, -1, "não achei o fim do bloco da thread irmã");
  const j = inbox.indexOf("<FioLead", i);
  assert.ok(j !== -1 && j < fimDaSecao, "o FioLead saiu do bloco das irmãs");
  const fecha = inbox.indexOf("/>", j);
  assert.notEqual(fecha, -1, "a tag do FioLead não fecha");
  return inbox.slice(j, fecha);
}

test("DEFEITO 1 · a thread irmã pede para NÃO auto-rolar", () => {
  assert.match(
    tagDoFioIrmao(),
    /autoRolar=\{false\}/,
    "sem isto a caixa de 420px abre rolada ao fim e a primeira bolha some atrás do cabeçalho",
  );
});

test("DEFEITO 1 · o FioLead OBEDECE — a saída vem ANTES de mexer no scroll", () => {
  // ancorar em "o arquivo cita autoRolar" deixaria passar a prop que chega e MORRE (foi o erro nº 4
  // de 15/09). O que prova obediência é a ORDEM: a saída tem de estar entre o início do efeito e a
  // linha que rola. Mover o `if` para depois da atribuição deixa este teste vermelho, como deve.
  const rola = fioLead.indexOf("scrollTop = pai");
  assert.notEqual(rola, -1, "a linha que rola sumiu — este teste precisa ser reescrito");
  const inicioDoEfeito = fioLead.lastIndexOf("useEffect(", rola);
  assert.notEqual(inicioDoEfeito, -1, "não achei o efeito que rola");
  assert.match(
    fioLead.slice(inicioDoEfeito, rola),
    /if\s*\(\s*!\s*autoRolar\s*\)\s*return/,
    "a prop chegou e morreu: o efeito rola de qualquer jeito",
  );
});

test("DEFEITO 2 · a âncora do fim do fio vem ANTES do bloco das irmãs", () => {
  // A ordem é a regra inteira, e são TRÊS pontos: a âncora tem de estar dentro do contêiner de
  // rolagem e antes das irmãs. Pôr o `<div ref={fimRef}/>` antes do contêiner passaria num teste
  // de dois pontos e continuaria rolando a coisa errada.
  const container = inbox.indexOf("ref={rolagemRef}");
  const ancora = inbox.indexOf("ref={fimRef}");
  // ⚠️ `irmaos.length > 0` NÃO serve mais de âncora: desde o divisor do fio aberto (16/09) ele
  // aparece DUAS vezes, e a primeira está acima das mensagens. O que marca o bloco das irmãs, e
  // só ele, é o `map`. Oitavo caso da série: âncora que envelhece porque o arquivo cresceu à
  // volta dela — o teste acusou na hora, que é para o que ele existe.
  const irmas = inbox.indexOf("irmaos.map(");
  assert.notEqual(container, -1, "o contêiner de rolagem sumiu — este teste precisa ser reescrito");
  assert.notEqual(ancora, -1, "a âncora do fim do fio sumiu");
  assert.notEqual(irmas, -1, "o bloco das irmãs sumiu");
  assert.ok(container < ancora, "a âncora ficou fora do contêiner de rolagem");
  assert.ok(
    ancora < irmas,
    "com a âncora depois das irmãs, abrir a conversa rola até as irmãs e o fio aberto sai de vista",
  );
});

test("DEFEITO 2 · a ABERTURA mira o fim do fio, não o fim do documento", () => {
  // ⚠️ ESTA GUARDA NASCEU FURADA E A MUTAÇÃO A PEGOU — 16/09, sétimo caso da sessão.
  // A primeira janela ia até `totalAnteriorRef.current = total` e ENGOLIA O RAMO `else`, onde
  // `fimRef.current` aparece outra vez (mensagem nova rola se já estava no fim). Trocar o alvo da
  // ABERTURA por `null` deixava o teste verde: o `fimRef` do outro ramo respondia por ele.
  // A janela certa é só o ramo da abertura — do `if` até o `} else if` que o fecha.
  const i = inbox.indexOf("if (totalAnteriorRef.current === -1)");
  assert.notEqual(i, -1, "o efeito de abertura mudou — este teste precisa ser reescrito");
  const fim = inbox.indexOf("} else if", i);
  assert.notEqual(fim, -1, "não achei o fim do ramo de abertura");
  assert.match(
    inbox.slice(i, fim),
    /fimRef\.current/,
    "a abertura deixou de mirar a âncora do fio; se for de propósito, reescreva esta guarda",
  );
});

/*
 * ── DIVISÃO SIMPLES, NO MESMO FIO (16/09, decisão do Diogo pelo print do Kommo) ───────────────
 *
 * A caixa com borda, cabeçalho e rolagem própria foi recusada: *"gostaria que fosse uma divisão
 * mais simples na mesma tela de conversa… uma linha que mostra onde acabou a conversa de um número
 * e onde começou do novo"*. O fio passa a ser UM só, e cada número abre com um divisor.
 *
 * E há uma dependência dura entre isto e o DEFEITO 1: sem a caixa, o ancestral rolável mais
 * próximo do `FioLead` deixa de ser a caixa de 420px e passa a ser o contêiner do fio inteiro. Se
 * o `autoRolar={false}` cair, o fio irmão rola a TELA TODA ao montar — o dano sobe de "bolha
 * cortada" para "a conversa da Sara salta sozinha".
 */

/** O bloco de UM fio irmão, delimitado pelo fechamento real da `<section>`. */
function blocoDoIrmao(): string {
  const i = inbox.indexOf("irmaos.map(");
  assert.notEqual(i, -1, "o map dos irmãos sumiu — este teste precisa ser reescrito");
  const fim = inbox.indexOf("</section>", i);
  assert.notEqual(fim, -1, "não achei o fim do bloco da thread irmã");
  return inbox.slice(i, fim);
}

test("DIVISÃO · a thread irmã corre no MESMO fio — sem caixa de rolagem própria", () => {
  const bloco = blocoDoIrmao();
  assert.doesNotMatch(bloco, /max-h-\[/, "a caixa de altura fixa voltou: rolagem dentro de rolagem");
  assert.doesNotMatch(bloco, /overflow-y-auto/, "o fio irmão voltou a ter rolagem própria");
});

test("DIVISÃO · cada número irmão abre com o divisor", () => {
  assert.match(
    blocoDoIrmao(),
    /<DivisorDeNumero/,
    "sem o divisor não se vê onde acabou um número e começou o outro",
  );
});

test("DIVISÃO · o fio ABERTO também é rotulado, e só quando há irmãos", () => {
  // o divisor do fio aberto vive FORA do map (é o primeiro do fio) e é condicionado: lead de um
  // número só — a esmagadora maioria — não ganha rótulo nenhum, que viraria ruído permanente.
  const i = inbox.indexOf("<DivisorDeNumero");
  assert.notEqual(i, -1, "o divisor sumiu — este teste precisa ser reescrito");
  const mapDosIrmaos = inbox.indexOf("irmaos.map(");
  assert.ok(i < mapDosIrmaos, "o único divisor é o dos irmãos; o fio aberto ficou sem rótulo");
  // a condição tem de estar coladinha nele, não em qualquer lugar do arquivo
  assert.match(
    inbox.slice(Math.max(0, i - 260), i),
    /irmaos\.length > 0/,
    "o rótulo do fio aberto apareceria também para quem só tem um número",
  );
});

/** O corpo do `DivisorDeNumero`, delimitado pela função seguinte — não por janela fixa. */
function corpoDoDivisor(): string {
  const i = inbox.indexOf("function DivisorDeNumero");
  assert.notEqual(i, -1, "o divisor sumiu — este teste precisa ser reescrito");
  const fim = inbox.indexOf("\nfunction ", i + 1);
  assert.notEqual(fim, -1, "não achei o fim do componente do divisor");
  return inbox.slice(i, fim);
}

test("IDENTIDADE · a régua mostra o NÚMERO, não só o apelido", () => {
  assert.match(
    corpoDoDivisor(),
    /\{identidade\.numero\}/,
    "a identidade chegou e morreu: a régua voltou a dizer só 'CLARA'",
  );
});

test("IDENTIDADE · o hover explica por onde a mensagem sai", () => {
  const corpo = corpoDoDivisor();
  assert.match(corpo, /identidade\.detalhe/, "o hover perdeu o número e a via (oficial × Lite)");
  assert.match(corpo, /title=\{/, "o texto existe mas não está pendurado em lugar nenhum");
});

test("REGRESSÃO · o drawer do funil continua abrindo no presente", () => {
  // o default é `true` e o drawer NÃO passa a prop: consertar a irmã não pode calar o fio do
  // drawer, onde abrir no fim é a decisão certa desde sempre.
  assert.match(fioLead, /autoRolar\s*=\s*true/, "o default deixou de auto-rolar — quebra o drawer");
  const i = drawer.indexOf("<FioLead");
  assert.notEqual(i, -1, "o drawer parou de usar o FioLead — este teste precisa ser reescrito");
  assert.doesNotMatch(
    drawer.slice(i, drawer.indexOf("/>", i)),
    /autoRolar/,
    "o drawer passou a mandar na rolagem; se for de propósito, reescreva esta guarda",
  );
});
