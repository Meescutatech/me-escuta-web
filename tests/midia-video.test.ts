import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  caminhoValido,
  caminhosParaAssinar,
  ehVideo,
  temFigurinhaVisivel,
  temVideoVisivel,
} from "../lib/conversas/midia.ts";

/*
 * VÍDEO RECEBIDO NÃO APARECE NO CHAT — reportado em produção, 21/09/2026.
 *
 * ┌── O QUE ESTÁ ERRADO, E NÃO É UMA COISA SÓ ────────────────────────────────────────────────────┐
 * │ 1. `caminhosParaAssinar` junta áudio, imagem e documento — vídeo e figurinha ficam FORA, e    │
 * │    então `midia_url` nunca é preenchida para eles.                                            │
 * │ 2. O portão em `inbox.tsx` é `tipo === "video" && m.midia_url`. Sem o item 1, ele é falso      │
 * │    sempre, a mensagem escorre até o fallback de mídia e a tela escreve "Vídeo recebido /       │
 * │    visualização chega com a pipeline de mídia" — sobre um arquivo que ESTÁ no bucket.         │
 * │ 3. `BolhaVideo` não toca vídeo: ela põe a URL num `<img>` e o `onClick` só alterna um estado  │
 * │    local. Nasceu no ensaio (`4888fe7`, 10/09), onde `midia_url` era um POSTER .svg. Assinar   │
 * │    o caminho sem consertar isto troca o rótulo honesto por uma imagem quebrada.               │
 * │ 4. A galeria do painel do lead (`painel-lead.tsx`) filtra por `midia_url` e desenha `<img>`   │
 * │    com selo de play — o mesmo defeito do item 3, um andar acima.                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MEDIDO em 21/09/2026, conversa `ba52c2d3-862d-35af-5ee1-81f0c7bff556`:
 *   · ledger `midia_armazenada` 18:49:41Z → `midia-whatsapp/1504463128372791.mp4`, `video/mp4`,
 *     1.518.458 bytes;
 *   · projeção `core.mensagem` → `entrada · video · midia_caminho=1504463128372791.mp4`;
 *   · a tela, no mesmo instante: "Vídeo recebido — visualização chega com a pipeline de mídia".
 * O runtime fez a parte dele. O buraco é só aqui.
 *
 * É A MESMA CLASSE DE DEFEITO DE `98de376` (18/09, bolha de documento) — três itens, os mesmos
 * três. Este arquivo é o irmão de `midia-documento.test.ts` de propósito.
 *
 * ── Por que parte é asserção de FONTE ────────────────────────────────────────────────────────────
 * `ConteudoBolha` e `AbaMidias` vivem dentro de componentes e este repo não monta React nos testes
 * (mesma ressalva de `bolha-template.test.ts`). O que dá para provar aqui é a ORDEM da cadeia de
 * `if` e o ELEMENTO escolhido — que é exatamente o que está errado. Guarda mais fraca que um render
 * de verdade, e está dito assim para ninguém confundir as duas.
 */

const base = { tipo_conteudo: "video", midia_caminho: "1504463128372791.mp4" };

const inbox = readFileSync(new URL("../components/conversas/inbox.tsx", import.meta.url), "utf8");
const bolhas = readFileSync(new URL("../components/conversas/bolha-tipada.tsx", import.meta.url), "utf8");
const painel = readFileSync(new URL("../components/conversas/painel-lead.tsx", import.meta.url), "utf8");
const fio = readFileSync(new URL("../components/funil/fio-lead.tsx", import.meta.url), "utf8");

// ─────────── ehVideo — vocabulário do ingestor (TIPO_PT: video→video, sticker→figurinha) ───────────

test("ehVideo aceita o tipo do ingestor e as linhas históricas, e recusa o resto", () => {
  for (const t of ["video", "VIDEO", "Video", "vídeo"]) {
    assert.equal(ehVideo(t), true, `${t} devia ser vídeo`);
  }
  for (const t of ["audio", "imagem", "image", "documento", "figurinha", "texto", "", null, undefined]) {
    assert.equal(ehVideo(t), false, `${String(t)} NÃO devia ser vídeo`);
  }
});

// ─────────── temVideoVisivel — a mesma régua do player de áudio e da foto ───────────

test("visível só com tipo vídeo E caminho presente", () => {
  assert.equal(temVideoVisivel(base), true);
});

test("sem caminho NÃO é visível — o rótulo 'Vídeo recebido' é a guarda funcionando", () => {
  // Enquanto o runtime não baixou a mídia, o rótulo honesto é o certo. Um <video> apontando para
  // lugar nenhum seria pior: é o defeito que estamos consertando, do outro lado.
  for (const caminho of [null, undefined, "", "   "]) {
    assert.equal(temVideoVisivel({ ...base, midia_caminho: caminho }), false, `caminho ${JSON.stringify(caminho)}`);
  }
});

test("áudio, foto e documento NÃO viram vídeo — cada bolha continua na sua", () => {
  assert.equal(temVideoVisivel({ tipo_conteudo: "audio", midia_caminho: "x.ogg" }), false);
  assert.equal(temVideoVisivel({ tipo_conteudo: "imagem", midia_caminho: "x.jpg" }), false);
  assert.equal(temVideoVisivel({ tipo_conteudo: "documento", midia_caminho: "x.pdf" }), false);
});

// ─────────── temFigurinhaVisivel — o mesmo buraco, o mesmo conserto ───────────

test("figurinha aceita PT do ingestor e EN histórico, e exige caminho", () => {
  assert.equal(temFigurinhaVisivel({ tipo_conteudo: "figurinha", midia_caminho: "x.webp" }), true);
  assert.equal(temFigurinhaVisivel({ tipo_conteudo: "sticker", midia_caminho: "x.webp" }), true);
  assert.equal(temFigurinhaVisivel({ tipo_conteudo: "figurinha", midia_caminho: null }), false);
  assert.equal(temFigurinhaVisivel({ tipo_conteudo: "imagem", midia_caminho: "x.jpg" }), false);
});

// ─────────── caminhosParaAssinar — vídeo e figurinha entram no batch ───────────

test("o caminho do vídeo e o da figurinha entram no batch de signed URLs", () => {
  // VERMELHO ANTES DO CONSERTO: o batch só juntava áudio, imagem e documento, então `midia_url`
  // do vídeo era `undefined` e o portão do inbox NUNCA abria.
  const caminhos = caminhosParaAssinar([
    { tipo_conteudo: "audio", midia_caminho: "a.ogg" },
    { tipo_conteudo: "video", midia_caminho: "v.mp4" },
    { tipo_conteudo: "figurinha", midia_caminho: "f.webp" },
    { tipo_conteudo: "documento", midia_caminho: "d.pdf" },
    { tipo_conteudo: "imagem", midia_caminho: "i.jpg" },
  ]);
  assert.deepEqual(caminhos, ["a.ogg", "v.mp4", "f.webp", "d.pdf", "i.jpg"]);
});

test("vídeo SEM caminho não entra no batch — não se pede URL do que não existe", () => {
  assert.deepEqual(
    caminhosParaAssinar([
      { tipo_conteudo: "video", midia_caminho: null },
      { tipo_conteudo: "video", midia_caminho: "  " },
    ]),
    [],
  );
});

test("o batch continua sem repetir caminho e com trim", () => {
  assert.deepEqual(
    caminhosParaAssinar([
      { tipo_conteudo: "video", midia_caminho: " v.mp4 " },
      { tipo_conteudo: "video", midia_caminho: "v.mp4" },
    ]),
    ["v.mp4"],
  );
});

test("REGRESSÃO: tipo que a tela não conhece continua fora do batch", () => {
  // O conserto não pode virar "assina tudo": reação, botão e template não têm mídia, e pedir
  // signed URL para eles é round-trip no Storage por nada.
  assert.deepEqual(
    caminhosParaAssinar([
      { tipo_conteudo: "reacao", midia_caminho: "r.bin" },
      { tipo_conteudo: "template", midia_caminho: "t.bin" },
      { tipo_conteudo: "texto", midia_caminho: "x.txt" },
    ]),
    [],
  );
});

// ─────────── caminho do vídeo passa pela MESMA guarda defensiva ───────────

test("caminho de vídeo malformado é recusado antes de virar pedido de URL", () => {
  assert.equal(caminhoValido("1504463128372791.mp4"), true);
  for (const c of ["../../etc/passwd", "/absoluto/v.mp4", "https://evil.tld/v.mp4", "", "   "]) {
    assert.equal(caminhoValido(c), false, `${c} devia ser recusado`);
  }
});

// ─────────── inbox.tsx — o portão deixa de depender de `midia_url` ───────────

test("o portão do vídeo no inbox usa temVideoVisivel, não `midia_url`", () => {
  // VERMELHO ANTES: `if (tipo === "video" && m.midia_url)`. Com o batch consertado isso até
  // funcionaria, mas amarra a bolha ao caminho rápido: se o batch falhar (e ele tem `catch` que
  // segue em frente), a bolha precisa poder pedir a URL sozinha, como a foto e o documento fazem.
  assert.match(inbox, /if \(temVideoVisivel\(m\)\) return <BolhaVideo m=\{m\} \/>;/);
  assert.doesNotMatch(inbox, /tipo === "video" && m\.midia_url/, "o portão ainda depende do batch");
});

test("o portão da figurinha no inbox também deixa de depender de `midia_url`", () => {
  assert.match(inbox, /temFigurinhaVisivel\(m\)/);
});

test("o galho do vídeo vem ANTES do fallback de mídia — ordem é metade do defeito", () => {
  const galho = inbox.indexOf("temVideoVisivel(m)");
  const fallback = inbox.indexOf("`Mensagem (${tipo})`");
  assert.ok(galho > -1 && fallback > -1, "âncoras sumiram — reescreva este teste junto com o render");
  assert.ok(galho < fallback, "o galho está DEPOIS do fallback: a mensagem nunca chega nele");
});

test("REGRESSÃO: o rótulo 'Vídeo recebido' continua existindo para vídeo SEM caminho", () => {
  // O degrade não sai de cena; ele passa a valer só para quem o merece.
  assert.match(inbox, /"Vídeo recebido"/);
  assert.match(inbox, /visualização chega com a pipeline de mídia/);
});

// ─────────── bolha-tipada.tsx — a bolha toca vídeo de verdade ───────────

test("BolhaVideo usa <video> com controles — não um <img> com play decorativo", () => {
  // VERMELHO ANTES: a bolha punha `m.midia_url` num `<img>`. Com um .mp4 real isso é imagem
  // quebrada, e o `onClick` só alternava `tocando` — play que não toca é o defeito do documento
  // (`98de376`) outra vez.
  const trecho = bolhas.slice(bolhas.indexOf("export function BolhaVideo"));
  const corpo = trecho.slice(0, trecho.indexOf("\n}\n") + 3);
  assert.match(corpo, /<video/, "BolhaVideo não monta um <video>");
  assert.match(corpo, /controls/, "o <video> não tem controles nativos");
  assert.doesNotMatch(corpo, /<img/, "ainda desenha <img> — mp4 em <img> é imagem quebrada");
});

test("BolhaVideo pede a URL sozinha quando o batch não assinou (caminho lazy)", () => {
  const trecho = bolhas.slice(bolhas.indexOf("export function BolhaVideo"));
  const corpo = trecho.slice(0, trecho.indexOf("\n}\n") + 3);
  assert.match(corpo, /obterUrlMidia\(/, "sem fallback lazy: batch que falha vira bolha vazia");
});

test("BolhaVideo tem estado de ERRO em PT-BR — nunca player morto e silencioso", () => {
  const trecho = bolhas.slice(bolhas.indexOf("export function BolhaVideo"));
  const corpo = trecho.slice(0, trecho.indexOf("\n}\n") + 3);
  assert.match(corpo, /não deu pra (carregar|tocar) o vídeo/, "falha de assinatura não diz nada à pessoa");
});

test("BolhaFigurinha continua degradando para o rótulo quando não há imagem", () => {
  const trecho = bolhas.slice(bolhas.indexOf("export function BolhaFigurinha"));
  assert.match(trecho.slice(0, 500), /figurinha/);
});

// ─────────── painel-lead.tsx — a galeria não põe .mp4 dentro de <img> ───────────

/*
 * Duas âncoras DISTINTAS, e não um `<video` qualquer dentro de `AbaMidias`: a aba tem dois lugares
 * que desenham mídia — a miniatura da grade e o lightbox. Um `<video` só provava que UM dos dois
 * foi consertado. Medido: a primeira versão deste teste SOBREVIVEU à mutação que devolvia o `<img>`
 * na miniatura, porque o `<video` do lightbox a mantinha verde. Guarda que não distingue os dois
 * casos não é guarda.
 */
test("a MINIATURA da galeria desenha vídeo com <video>, não com <img>", () => {
  // VERMELHO ANTES (e é a REGRESSÃO que o conserto do batch criaria sozinho): `AbaMidias` filtra
  // por `midia_url` + tipo `imagem|image|video` e desenha `<img src={m.midia_url}>` com selo de
  // play. Enquanto vídeo não era assinado, esse galho era inalcançável; assinar o caminho o
  // acorda — e ele nasce quebrado.
  const aba = painel.slice(painel.indexOf("function AbaMidias"));
  const corpo = aba.slice(0, aba.indexOf("\n}\n") + 3);
  const tile = corpo.slice(0, corpo.indexOf("{aberta &&"));
  // Âncoras de CÓDIGO, não de prosa: a primeira versão deste teste casava com o comentário logo
  // acima do JSX, e a mutação que tirava o fragmento do `src` seguiu verde.
  assert.match(tile, /<video\n/, "a miniatura de vídeo ainda é <img>");
  assert.match(tile, /src=\{`\$\{m\.midia_url!\}#t=/, "sem fragmento de tempo a miniatura é caixa preta");
});

test("o LIGHTBOX da galeria toca o vídeo em vez de mostrá-lo como foto", () => {
  const aba = painel.slice(painel.indexOf("function AbaMidias"));
  const corpo = aba.slice(0, aba.indexOf("\n}\n") + 3);
  const lightbox = corpo.slice(corpo.indexOf("{aberta &&"));
  assert.match(lightbox, /<video/, "o lightbox ainda é <img>");
  assert.match(lightbox, /controls/, "vídeo ampliado sem controles não toca");
});

// ─────────── fio-lead.tsx — o espelho do inbox anda junto ───────────

test("o fio do lead usa o mesmo portão do inbox (espelho não pode divergir)", () => {
  assert.match(fio, /temVideoVisivel\(m\)/);
  assert.doesNotMatch(fio, /tipo === "video" && m\.midia_url/);
});
