import { test } from "node:test";
import assert from "node:assert/strict";
import {
  caminhoValido,
  caminhosParaAssinar,
  ehAudio,
  ehImagem,
  temImagemVisivel,
  temPlayerDeAudio,
} from "../lib/conversas/midia.ts";

/*
 * Testes da lógica pura da pipeline de mídia (rodada 5) — roda com `npm test`
 * (node --test com type stripping, sem framework externo).
 */

// ─────────── ehAudio ───────────

test("tipos de voz da Meta contam como áudio (case-insensitive)", () => {
  for (const tipo of ["audio", "voice", "ptt", "AUDIO", "Voice"]) {
    assert.equal(ehAudio(tipo), true, tipo);
  }
});

test("texto/imagem/nulo não são áudio", () => {
  for (const tipo of ["text", "texto", "image", "document", null, undefined, ""]) {
    assert.equal(ehAudio(tipo), false, String(tipo));
  }
});

// ─────────── temPlayerDeAudio (player vs degrade) ───────────

test("áudio COM midia_caminho ganha player", () => {
  assert.equal(
    temPlayerDeAudio({ tipo_conteudo: "audio", midia_caminho: "2050562992220931.ogg" }),
    true,
  );
});

test("áudio SEM midia_caminho mantém o degrade honesto", () => {
  assert.equal(temPlayerDeAudio({ tipo_conteudo: "audio", midia_caminho: null }), false);
  assert.equal(temPlayerDeAudio({ tipo_conteudo: "audio", midia_caminho: undefined }), false);
  assert.equal(temPlayerDeAudio({ tipo_conteudo: "audio", midia_caminho: "   " }), false);
});

test("midia_caminho em tipo não-áudio não vira player", () => {
  assert.equal(temPlayerDeAudio({ tipo_conteudo: "texto", midia_caminho: "x.ogg" }), false);
});

// ─────────── ehImagem / temImagemVisivel (bolha de foto, rodada 6) ───────────

test("image/imagem contam como foto; áudio/texto/figurinha não", () => {
  for (const tipo of ["image", "imagem", "IMAGEM"]) assert.equal(ehImagem(tipo), true, tipo);
  for (const tipo of ["audio", "texto", "sticker", "figurinha", null, undefined, ""]) {
    assert.equal(ehImagem(tipo), false, String(tipo));
  }
});

test("foto COM midia_caminho ganha <img>; sem caminho mantém o rótulo honesto", () => {
  assert.equal(temImagemVisivel({ tipo_conteudo: "imagem", midia_caminho: "abc.jpg" }), true);
  assert.equal(temImagemVisivel({ tipo_conteudo: "imagem", midia_caminho: "saida/x.jpg" }), true);
  assert.equal(temImagemVisivel({ tipo_conteudo: "imagem", midia_caminho: null }), false);
  assert.equal(temImagemVisivel({ tipo_conteudo: "imagem", midia_caminho: "  " }), false);
  assert.equal(temImagemVisivel({ tipo_conteudo: "audio", midia_caminho: "x.jpg" }), false);
});

// ─────────── caminhoValido (guarda da signed URL) ───────────

test("chave simples de bucket é válida", () => {
  assert.equal(caminhoValido("2050562992220931.ogg"), true);
  assert.equal(caminhoValido("conversa-x/áudio 01.ogg"), true);
});

test("traversal, caminho absoluto, URL e vazio são recusados", () => {
  for (const c of ["../segredo.ogg", "/etc/passwd", "https://x/y.ogg", "", "  ", "a/../b.ogg"]) {
    assert.equal(caminhoValido(c), false, c);
  }
});

// ─────────── caminhosParaAssinar (batch de signed URLs — perf/rotas) ───────────

test("só mídias renderizáveis entram no batch, únicas e com trim", () => {
  const caminhos = caminhosParaAssinar([
    { tipo_conteudo: "audio", midia_caminho: "a.ogg" },
    { tipo_conteudo: "image", midia_caminho: " foto.jpg " },
    { tipo_conteudo: "audio", midia_caminho: "a.ogg" }, // duplicada
    { tipo_conteudo: "audio", midia_caminho: null }, // sem caminho → degrade, não assina
    { tipo_conteudo: "text", midia_caminho: "b.ogg" }, // texto nunca assina
    { tipo_conteudo: "video", midia_caminho: "v.mp4" }, // 21/09: vídeo AGORA assina (tem bolha)
    { tipo_conteudo: "reacao", midia_caminho: "r.bin" }, // tipo sem bolha de mídia
  ]);
  assert.deepEqual(caminhos, ["a.ogg", "foto.jpg", "v.mp4"]);
});

test("thread sem mídia → batch vazio (nenhum round-trip de Storage)", () => {
  assert.deepEqual(
    caminhosParaAssinar([{ tipo_conteudo: "text", midia_caminho: null }]),
    [],
  );
});
