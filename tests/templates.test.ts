import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atalhoDeTitulo,
  atalhoValido,
  CATALOGO_VARIAVEIS,
  filtrarTemplates,
  LIMITE_CORPO,
  placeholdersPendentes,
  podeGerirTemplates,
  substituirVariaveis,
  validarFormTemplate,
  variaveisForaDoCatalogo,
  type TemplateMensagem,
} from "../lib/templates.ts";

/*
 * SPEC-TEMPLATES-MENSAGENS — a lógica pura dos templates.
 * §5.2: substituição na escolha, nunca inventa valor. §5.3: o que não resolve fica literal
 * (e trava o envio — provado em composer-modo.test.ts). §4: quem gere é admin/owner.
 */

function tpl(parcial: Partial<TemplateMensagem>): TemplateMensagem {
  return {
    id: "t1",
    titulo: "Boas-vindas",
    atalho: "boas_vindas",
    corpo: "Oi {{nome}}!",
    ativo: true,
    autor_id: null,
    atualizado_em: null,
    arquivado_em: null,
    motivo_arquivo: null,
    ...parcial,
  };
}

// ═══════════ §5.2 — substituição ═══════════

test("substitui as variáveis do catálogo que têm valor", () => {
  const r = substituirVariaveis("Oi {{nome}}, aqui é a {{atendente}}!", {
    nome: "Maria",
    atendente: "Sara",
  });
  assert.equal(r, "Oi Maria, aqui é a Sara!");
});

test("variável sem valor fica LITERAL — nunca se inventa valor", () => {
  const r = substituirVariaveis("Oi {{nome}}, seu telefone é {{telefone}}", { nome: "Maria" });
  assert.equal(r, "Oi Maria, seu telefone é {{telefone}}");
});

test("variável fora do catálogo fica literal mesmo com valor por perto", () => {
  const r = substituirVariaveis("Olá {{apelido}}", { nome: "Maria" });
  assert.equal(r, "Olá {{apelido}}");
});

test("espaço interno é tolerado: {{ nome }} resolve como {{nome}}", () => {
  assert.equal(substituirVariaveis("Oi {{ nome }}", { nome: "Maria" }), "Oi Maria");
});

test("valor vazio ou só espaço NÃO substitui — vazio não é valor", () => {
  assert.equal(substituirVariaveis("Oi {{nome}}", { nome: "  " }), "Oi {{nome}}");
});

// ═══════════ §5.3 — placeholders pendentes ═══════════

test("placeholder que sobrou é detectado, sem duplicar", () => {
  const p = placeholdersPendentes("Oi {{nome}}, {{nome}} — ligo {{quando}}?");
  assert.deepEqual(p, ["{{nome}}", "{{quando}}"]);
});

test("caixa errada ({{Nome}}) também conta como pendente — vai literal, tem de travar", () => {
  assert.deepEqual(placeholdersPendentes("Oi {{Nome}}"), ["{{Nome}}"]);
});

test("texto sem placeholder não tem pendência", () => {
  assert.deepEqual(placeholdersPendentes("Oi Maria, tudo bem?"), []);
});

test("variaveisForaDoCatalogo aponta só o que o catálogo não conhece", () => {
  assert.deepEqual(variaveisForaDoCatalogo("{{nome}} {{apelido}} {{telefone}}"), ["apelido"]);
});

// ═══════════ atalho ═══════════

test("atalho válido: [a-z0-9_]{2,32}", () => {
  assert.equal(atalhoValido("boas_vindas"), true);
  assert.equal(atalhoValido("Boas-Vindas"), false);
  assert.equal(atalhoValido("a"), false);
  assert.equal(atalhoValido("x".repeat(33)), false);
});

test("comando fixo do composer não é atalho válido (V5 da porta, espelhado)", () => {
  assert.equal(atalhoValido("nota"), false);
  assert.equal(atalhoValido("tarefa"), false);
});

test("atalhoDeTitulo derruba acento e vira slug", () => {
  assert.equal(atalhoDeTitulo("Boas-vindas à Me Escuta"), "boas_vindas_a_me_escuta");
  assert.equal(atalhoDeTitulo("Valores (36x)"), "valores_36x");
});

// ═══════════ filtro do menu ═══════════

const LISTA = [
  tpl({ id: "a", titulo: "Boas-vindas", atalho: "boas_vindas" }),
  tpl({ id: "b", titulo: "Valores 36x", atalho: "valores_36x", corpo: "36x de R$249" }),
  tpl({ id: "c", titulo: "Endereço da loja", atalho: "endereco", ativo: false }),
];

test("filtra por prefixo do atalho, sem acento/caixa", () => {
  assert.deepEqual(filtrarTemplates(LISTA, "BOA").map((t) => t.id), ["a"]);
});

test("filtra também por substring do título", () => {
  assert.deepEqual(filtrarTemplates(LISTA, "36").map((t) => t.id), ["b"]);
});

test("template arquivado NUNCA aparece no menu", () => {
  assert.deepEqual(filtrarTemplates(LISTA, "ende").map((t) => t.id), []);
});

test("termo vazio lista todos os ativos", () => {
  assert.deepEqual(filtrarTemplates(LISTA, "").map((t) => t.id), ["a", "b"]);
});

// ═══════════ §4 — permissão (ergonomia; a defesa real é a porta 0046) ═══════════

test("admin e owner gerem templates; membro e não-membro não", () => {
  assert.equal(podeGerirTemplates("owner"), true);
  assert.equal(podeGerirTemplates("admin"), true);
  assert.equal(podeGerirTemplates("membro"), false);
  assert.equal(podeGerirTemplates(null), false);
});

// ═══════════ form — os mesmos V2/V3/V8 da porta, para recusa instantânea ═══════════

test("form recusa titulo/corpo vazios e atalho fora da gramática", () => {
  assert.notEqual(validarFormTemplate({ titulo: " ", atalho: "ok_2", corpo: "x" }), null);
  assert.notEqual(validarFormTemplate({ titulo: "T", atalho: "ok_2", corpo: "  " }), null);
  assert.notEqual(validarFormTemplate({ titulo: "T", atalho: "Ruim!", corpo: "x" }), null);
  assert.notEqual(validarFormTemplate({ titulo: "T", atalho: "nota", corpo: "x" }), null);
  assert.equal(validarFormTemplate({ titulo: "T", atalho: "ok_2", corpo: "x" }), null);
});

test("form recusa corpo acima do limite do WhatsApp (4096, Meta text.body)", () => {
  assert.equal(LIMITE_CORPO, 4096);
  assert.notEqual(
    validarFormTemplate({ titulo: "T", atalho: "ok_2", corpo: "a".repeat(4097) }),
    null,
  );
});

// ═══════════ catálogo v1 (GO 10.3) ═══════════

test("catálogo v1 é exatamente nome, telefone e atendente", () => {
  assert.deepEqual(
    CATALOGO_VARIAVEIS.map((v) => v.slug),
    ["nome", "telefone", "atendente"],
  );
});
