import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirArquivamento, ETAPA_ARQUIVADO } from "../lib/funil/arquivar.ts";

test("arquiva um lead ativo: monta etapa_alterada para 'arquivado'", () => {
  const d = decidirArquivamento("lead-1", "qualificando");
  assert.equal(d.ok, true);
  if (d.ok) {
    assert.equal(d.payload.lead_id, "lead-1");
    assert.equal(d.payload.etapa_de, "qualificando");
    assert.equal(d.payload.etapa_para, ETAPA_ARQUIVADO);
    assert.equal(d.payload.motivo, undefined);
  }
});

test("inclui o motivo aparado quando informado", () => {
  const d = decidirArquivamento("lead-1", "novo", "  duplicado  ");
  assert.equal(d.ok, true);
  if (d.ok) assert.equal(d.payload.motivo, "duplicado");
});

test("motivo só de espaços NÃO entra no payload", () => {
  const d = decidirArquivamento("lead-1", "novo", "   ");
  assert.equal(d.ok, true);
  if (d.ok) assert.equal(d.payload.motivo, undefined);
});

test("recusa lead_id vazio (não gravar evento órfão)", () => {
  assert.equal(decidirArquivamento("", "novo").ok, false);
  assert.equal(decidirArquivamento("   ", "novo").ok, false);
});

test("recusa arquivar quem JÁ está arquivado (evento sem efeito)", () => {
  const d = decidirArquivamento("lead-1", ETAPA_ARQUIVADO);
  assert.equal(d.ok, false);
  if (!d.ok) assert.match(d.motivo, /já está arquivado/i);
});

test("é reversível por natureza: arquivar não é delete, é etapa_alterada", () => {
  // o valor de etapa_para prova que o lead não some — vira etapa, e a ingestão (0029) desarquiva
  // sozinha quando ele volta a falar.
  const d = decidirArquivamento("lead-1", "proposta");
  assert.equal(d.ok, true);
  if (d.ok) assert.equal(d.payload.etapa_para, "arquivado");
});
