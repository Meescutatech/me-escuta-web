import { test } from "node:test";
import assert from "node:assert/strict";
import { caminhoValido, ehAudio, temPlayerDeAudio } from "../lib/conversas/midia.ts";

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
