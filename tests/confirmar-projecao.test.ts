import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avaliarProjecao,
  MOTIVO_NAO_PROJETADO,
  posicaoParaConferir,
} from "../lib/eventos/confirmar-projecao.ts";

/*
 * Read-back do limite de escrita (R15): o ledger aceitar não é sucesso — sucesso
 * é a projeção existir. O caso real que motivou isto: dispatcher sem o ramo
 * template_* aceitou `template_criado` e a UI fechou o form "com sucesso"
 * enquanto core.template_mensagem ficava intacta (verificação clicada, item 5).
 */

// ── posicaoParaConferir: quando HÁ o que conferir ────────────────────────────

test("resposta normal expõe a posicao_global para conferência", () => {
  assert.equal(
    posicaoParaConferir({ duplicado: false, evento_id: "e1", posicao_global: 42 }),
    42,
  );
});

test("duplicado:true é idempotência, não falha — nada a conferir", () => {
  assert.equal(
    posicaoParaConferir({ duplicado: true, evento_id: "e1", posicao_global: 42 }),
    null,
  );
});

test("resposta sem posicao_global (contrato antigo) não inventa falha", () => {
  assert.equal(posicaoParaConferir({ duplicado: false, evento_id: "e1" }), null);
  assert.equal(posicaoParaConferir(null), null);
  assert.equal(posicaoParaConferir(undefined), null);
});

// ── avaliarProjecao: o veredito ──────────────────────────────────────────────

test("projeção encontrada → ok", () => {
  assert.deepEqual(avaliarProjecao(true), { ok: true });
});

test("REGISTRADO MAS NÃO PROJETADO → ok:false com motivo honesto (o caso da R15)", () => {
  const r = avaliarProjecao(false);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_NAO_PROJETADO);
});

test("nada a conferir (duplicado ou contrato antigo) → ok", () => {
  assert.deepEqual(avaliarProjecao(null), { ok: true });
});

// ── o fio inteiro, como a action usa ─────────────────────────────────────────

test("fio duplicado: no-op idempotente nunca chega a ler a projeção e termina ok", () => {
  const resposta = { duplicado: true, evento_id: "e9", posicao_global: 7 };
  const posicao = posicaoParaConferir(resposta);
  assert.equal(posicao, null); // a action pula a leitura
  assert.deepEqual(avaliarProjecao(null), { ok: true });
});

test("fio da colisão futura: evento aceito, leitura volta vazia, sucesso é negado", () => {
  const resposta = { duplicado: false, evento_id: "e9", posicao_global: 7 };
  const posicao = posicaoParaConferir(resposta);
  assert.equal(posicao, 7);
  const encontrou = false; // select ... where ultima_posicao = 7 → 0 linhas
  const veredito = avaliarProjecao(encontrou);
  assert.equal(veredito.ok, false);
  assert.match(veredito.motivo ?? "", /não apareceu/);
});
