import { test } from "node:test";
import assert from "node:assert/strict";
import {
  caminhosParaAssinar,
  ehDocumento,
  nomeDoDocumento,
  temDocumentoBaixavel,
} from "../lib/conversas/midia.ts";

/*
 * B1 · A BOLHA DE DOCUMENTO BAIXA DE VERDADE.
 *
 * ┌── O QUE ESTAVA ERRADO, E NÃO ERA UMA COISA SÓ ────────────────────────────────────────────────┐
 * │ 1. `bolha-tipada.tsx:147-171` desenha um botão com ícone de download e ZERO `onClick`. Ele    │
 * │    parece um download e não é um: clicar não faz nada. Decoração que promete função.          │
 * │ 2. Ele só desenha com o campo tipado `m.documento`, que só é populado em                      │
 * │    `lib/ensaio/fixtures/conversas.ts` — a projeção real nunca o preenche. Então nem a         │
 * │    decoração aparecia: todo documento caía no rótulo "Documento recebido".                    │
 * │ 3. `caminhosParaAssinar` só junta áudio e imagem, então o caminho do documento nunca entrava  │
 * │    no batch de signed URLs.                                                                   │
 * │                                                                                               │
 * │ Isto conserta os três — e conserta JUNTO os 15 documentos do canal OFICIAL, que estão no      │
 * │ mesmo buraco (é o item 5 do card, e a razão de a Daniela não abrir o PDF por canal nenhum).   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * D-B1-c: o nome sai do CAMINHO (`<id>.pdf`), sem migration. O `fileName` original existe no
 * WhatsApp e o parser passou a retê-lo, mas guardá-lo exigiria coluna nova — e isso ficou medido
 * no card para depois. Nome derivado é feio e honesto; nome inventado seria bonito e mentiroso.
 */

const base = { tipo_conteudo: "documento", midia_caminho: "3EB0LITE_DOC.pdf" };

// ─────────── ehDocumento — PT do contrato do ingestor + EN das linhas históricas ───────────

test("ehDocumento aceita PT e EN, e recusa o resto", () => {
  for (const t of ["documento", "document", "DOCUMENTO", "Document"]) {
    assert.equal(ehDocumento(t), true, `${t} devia ser documento`);
  }
  for (const t of ["audio", "imagem", "image", "texto", "video", "", null, undefined]) {
    assert.equal(ehDocumento(t), false, `${String(t)} NÃO devia ser documento`);
  }
});

// ─────────── temDocumentoBaixavel — a mesma régua do player de áudio ───────────

test("baixável só com tipo documento E caminho presente", () => {
  assert.equal(temDocumentoBaixavel(base), true);
});

test("sem caminho NÃO é baixável — o degrade honesto continua sendo o certo", () => {
  // É o ponto do card: o rótulo "Documento recebido" não é um bug, é a guarda funcionando.
  // Um botão de download que aponta para lugar nenhum seria pior que o rótulo.
  for (const caminho of [null, undefined, "", "   "]) {
    assert.equal(temDocumentoBaixavel({ ...base, midia_caminho: caminho }), false, `caminho ${JSON.stringify(caminho)}`);
  }
});

test("áudio e imagem NÃO viram documento — cada bolha continua na sua", () => {
  assert.equal(temDocumentoBaixavel({ tipo_conteudo: "audio", midia_caminho: "x.ogg" }), false);
  assert.equal(temDocumentoBaixavel({ tipo_conteudo: "imagem", midia_caminho: "x.jpg" }), false);
});

// ─────────── nomeDoDocumento — D-B1-c, derivado do caminho ───────────

test("o nome é o basename do caminho", () => {
  assert.equal(nomeDoDocumento("3EB0LITE_DOC.pdf"), "3EB0LITE_DOC.pdf");
  assert.equal(nomeDoDocumento("2050562992220931.pdf"), "2050562992220931.pdf");
});

test("caminho com pasta usa só o último segmento", () => {
  assert.equal(nomeDoDocumento("saida/abc-123.pdf"), "abc-123.pdf");
});

test("caminho vazio ou só espaço cai num nome genérico, nunca em string vazia", () => {
  // Um `download=""` faz o navegador salvar como "download" sem extensão. Nome genérico com
  // extensão é o pior caso aceitável; nome vazio é defeito.
  for (const c of ["", "   ", null, undefined]) {
    const n = nomeDoDocumento(c as string);
    assert.ok(n.length > 0, `nome vazio para ${JSON.stringify(c)}`);
    assert.ok(!n.includes("/"), "nome não pode carregar caminho");
  }
});

test("o nome NUNCA carrega caminho — é atributo `download`, e `../` ali é travessia", () => {
  for (const c of ["../../etc/passwd", "/absoluto/x.pdf", "a/b/c/d.pdf"]) {
    const n = nomeDoDocumento(c);
    assert.ok(!n.includes("/"), `${c} vazou barra: ${n}`);
    assert.ok(!n.includes(".."), `${c} vazou travessia: ${n}`);
  }
});

// ─────────── caminhosParaAssinar — o documento entra no batch ───────────

test("o caminho do documento entra no batch de signed URLs", () => {
  // VERMELHO ANTES DO CONSERTO: `caminhosParaAssinar` só juntava áudio e imagem, então a bolha de
  // documento teria de pedir a URL sozinha ao montar — 1 round-trip por documento, em série.
  const caminhos = caminhosParaAssinar([
    { tipo_conteudo: "audio", midia_caminho: "a.ogg" },
    { tipo_conteudo: "documento", midia_caminho: "d.pdf" },
    { tipo_conteudo: "imagem", midia_caminho: "i.jpg" },
  ]);
  assert.deepEqual(caminhos, ["a.ogg", "d.pdf", "i.jpg"]);
});

test("documento SEM caminho não entra no batch — não se pede URL do que não existe", () => {
  const caminhos = caminhosParaAssinar([
    { tipo_conteudo: "documento", midia_caminho: null },
    { tipo_conteudo: "documento", midia_caminho: "  " },
  ]);
  assert.deepEqual(caminhos, []);
});

test("o batch continua sem repetir caminho", () => {
  const caminhos = caminhosParaAssinar([
    { tipo_conteudo: "documento", midia_caminho: "d.pdf" },
    { tipo_conteudo: "documento", midia_caminho: "d.pdf" },
  ]);
  assert.deepEqual(caminhos, ["d.pdf"]);
});
