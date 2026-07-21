import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCEPT_ANEXO,
  LIMITE_AUDIO_BYTES,
  LIMITE_IMAGEM_BYTES,
  caminhoSaida,
  escolherMimeGravacao,
  mimeBase,
  validarAnexo,
} from "../lib/conversas/anexo.ts";

/*
 * Testes da lógica pura do anexo do composer (rodada 6, D1/D3/D5) — roda com `npm test`
 * (node --test com type stripping, sem framework externo).
 */

// ─────────── validarAnexo — imagem (D3: 5MB, jpeg/png/webp) ───────────

test("imagem aceita (jpeg/png/webp) dentro do limite, com extensão certa", () => {
  const casos: [string, string][] = [
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ];
  for (const [mime, ext] of casos) {
    const r = validarAnexo({ type: mime, size: 1024 });
    assert.deepEqual(r, { ok: true, categoria: "imagem", mime, ext }, mime);
  }
});

test("imagem exatamente no limite passa; 1 byte a mais é recusada com motivo PT-BR", () => {
  assert.equal(validarAnexo({ type: "image/jpeg", size: LIMITE_IMAGEM_BYTES }).ok, true);
  const r = validarAnexo({ type: "image/jpeg", size: LIMITE_IMAGEM_BYTES + 1 });
  assert.equal(r.ok, false);
  assert.match((r as { motivo: string }).motivo, /5MB/);
});

test("gif/heic/pdf não passam como imagem", () => {
  for (const mime of ["image/gif", "image/heic", "application/pdf", "video/mp4"]) {
    assert.equal(validarAnexo({ type: mime, size: 1024 }).ok, false, mime);
  }
});

// ─────────── validarAnexo — áudio (D3: 16MB; webm do gravador passa, D1) ───────────

test("áudio aceito (mp3/m4a/ogg/aac) com extensão certa", () => {
  const casos: [string, string][] = [
    ["audio/mpeg", "mp3"],
    ["audio/mp4", "m4a"],
    ["audio/x-m4a", "m4a"],
    ["audio/ogg", "ogg"],
    ["audio/aac", "aac"],
  ];
  for (const [mime, ext] of casos) {
    const r = validarAnexo({ type: mime, size: 1024 });
    assert.deepEqual(r, { ok: true, categoria: "audio", mime, ext }, mime);
  }
});

test("webm do gravador do Chrome passa (quem transcodifica é o sender, D1)", () => {
  const r = validarAnexo({ type: "audio/webm;codecs=opus", size: 1024 });
  assert.deepEqual(r, { ok: true, categoria: "audio", mime: "audio/webm", ext: "webm" });
});

test("áudio acima de 16MB é recusado com motivo PT-BR", () => {
  assert.equal(validarAnexo({ type: "audio/mpeg", size: LIMITE_AUDIO_BYTES }).ok, true);
  const r = validarAnexo({ type: "audio/mpeg", size: LIMITE_AUDIO_BYTES + 1 });
  assert.equal(r.ok, false);
  assert.match((r as { motivo: string }).motivo, /16MB/);
});

test("arquivo vazio e mime desconhecido são recusados", () => {
  assert.equal(validarAnexo({ type: "image/png", size: 0 }).ok, false);
  assert.equal(validarAnexo({ type: "", size: 1024 }).ok, false);
  assert.equal(validarAnexo({ type: "text/plain", size: 10 }).ok, false);
});

// ─────────── mimeBase / ACCEPT ───────────

test("mimeBase corta parâmetros e normaliza caixa", () => {
  assert.equal(mimeBase("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(mimeBase("Audio/MP4"), "audio/mp4");
  assert.equal(mimeBase(null), "");
});

test("accept do input não oferece webm (gravador entra por outro caminho)", () => {
  assert.ok(ACCEPT_ANEXO.includes("image/jpeg"));
  assert.ok(ACCEPT_ANEXO.includes("audio/mpeg"));
  assert.ok(!ACCEPT_ANEXO.includes("audio/webm"));
});

// ─────────── escolherMimeGravacao (D1: preferir o que a Meta aceita direto) ───────────

test("Safari-like (audio/mp4 suportado) grava mp4 — sem remux no sender", () => {
  assert.equal(
    escolherMimeGravacao((m) => m === "audio/mp4"),
    "audio/mp4",
  );
});

test("Firefox-like (ogg suportado) prefere ogg a webm", () => {
  assert.equal(
    escolherMimeGravacao((m) => m.startsWith("audio/ogg") || m.startsWith("audio/webm")),
    "audio/ogg;codecs=opus",
  );
});

test("Chrome-like (só webm) cai no webm;codecs=opus", () => {
  assert.equal(
    escolherMimeGravacao((m) => m.startsWith("audio/webm")),
    "audio/webm;codecs=opus",
  );
});

test("nenhum suportado (ou predicado que lança) → null, sem explodir", () => {
  assert.equal(escolherMimeGravacao(() => false), null);
  assert.equal(
    escolherMimeGravacao(() => {
      throw new Error("navegador estranho");
    }),
    null,
  );
});

// ─────────── caminhoSaida (D5) ───────────

test("caminho do upload é saida/<uuid>.<ext>", () => {
  assert.equal(caminhoSaida("abc-123", "jpg"), "saida/abc-123.jpg");
});
