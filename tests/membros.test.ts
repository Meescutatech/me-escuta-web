import { test } from "node:test";
import assert from "node:assert/strict";
import {
  convidadoHa,
  ehPapel,
  emailConviteValido,
  iniciaisMembro,
  opcoesDePapel,
  ordenarTabela,
  PAPEIS,
  PAPEIS_CONVIDAVEIS,
  papelConvidavelOuPadrao,
  podeEditarFuncao,
  podeGerirMembros,
  podeMudarPapel,
  podeRevogar,
  rotuloPapel,
  rotuloPapelBruto,
  type ConviteLinha,
  type MembroLinha,
} from "../lib/membros.ts";

/*
 * A UI espelha a matriz §3 da SPEC-WORKSPACE-USUARIOS pra habilitar controles — a defesa
 * real é a porta (0035). Estes testes garantem que o espelho NÃO diverge da matriz:
 * owner gere admins, admin gere membros, membro só a própria função.
 */

test("gestão de membros (convidar/reenviar/revogar convite): admin e owner sim, membro e não-membro não", () => {
  assert.equal(podeGerirMembros("owner"), true);
  assert.equal(podeGerirMembros("admin"), true);
  assert.equal(podeGerirMembros("membro"), false);
  assert.equal(podeGerirMembros(null), false);
});

test("papel: ninguém edita o próprio; o owner é intocável", () => {
  assert.equal(podeMudarPapel("owner", { papel: "admin", souEu: true }), false);
  assert.equal(podeMudarPapel("admin", { papel: "admin", souEu: true }), false);
  assert.equal(podeMudarPapel("owner", { papel: "owner", souEu: false }), false);
  assert.equal(podeMudarPapel("admin", { papel: "owner", souEu: false }), false);
});

test("papel: owner muda o papel de qualquer não-owner", () => {
  assert.equal(podeMudarPapel("owner", { papel: "admin", souEu: false }), true);
  assert.equal(podeMudarPapel("owner", { papel: "membro", souEu: false }), true);
  assert.equal(podeMudarPapel("owner", { papel: "marketing", souEu: false }), true);
  assert.deepEqual(opcoesDePapel("owner", "admin"), ["admin", "membro", "marketing"]);
});

test("opcoesDePapel: a opção do papel ATUAL sempre existe — senão o select fica com valor órfão", () => {
  // Este é o defeito que a lista `["admin","membro"]` do owner causava: para um alvo que JÁ era
  // `marketing`, o `<select value="marketing">` não tinha `<option>` correspondente e a tela
  // exibia o papel ERRADO de quem já era marketing. Itera PAPEIS: o quinto papel cai aqui.
  for (const alvo of PAPEIS) {
    if (alvo === "owner") continue; // owner não tem select, vira texto fixo
    assert.ok(
      opcoesDePapel("owner", alvo).includes(alvo),
      `owner: sem <option> para alvo ${alvo} — valor órfão no select`,
    );
    if (podeMudarPapel("admin", { papel: alvo, souEu: false })) {
      assert.ok(opcoesDePapel("admin", alvo).includes(alvo), `admin: sem <option> para alvo ${alvo}`);
    }
  }
});

test("quem JÁ é marketing só o owner alcança — mas o admin PROMOVE membro→marketing", () => {
  // A regra NÃO é "marketing é do owner". Lida do corpo vivo de `api.registrar_evento` em produção
  // (31/08): para `v_meu_papel = 'admin'` o banco exige
  //     v_alvo_papel = 'membro' and v_papel_para in ('admin','marketing')
  // Ou seja, o que trava o admin é o alvo já ter SAÍDO de `membro` — a mesma regra que sempre valeu
  // para `admin`, e não uma proteção especial do dado de mídia.
  assert.equal(podeMudarPapel("admin", { papel: "marketing", souEu: false }), false);
  assert.equal(podeRevogar("admin", { papel: "marketing", souEu: false }), false);
  assert.equal(podeRevogar("owner", { papel: "marketing", souEu: false }), true);
  // sem select para o admin, o papel vira texto — e o texto tem que estar certo
  assert.deepEqual(opcoesDePapel("admin", "marketing"), ["marketing"]);
  // ⭐ o caso que o BANCO AUTORIZA e a tela tem que oferecer: admin promovendo um membro a marketing.
  // Sem esta asserção, tirar `marketing` da lista do admin passa despercebido e o Fernando volta a
  // depender do owner para uma coisa que qualquer admin já pode fazer.
  assert.ok(opcoesDePapel("admin", "membro").includes("marketing"));
});

test("papel: admin SÓ promove membro (rebaixar admin é do owner); membro nada", () => {
  assert.equal(podeMudarPapel("admin", { papel: "membro", souEu: false }), true);
  assert.equal(podeMudarPapel("admin", { papel: "admin", souEu: false }), false);
  assert.equal(podeMudarPapel("membro", { papel: "membro", souEu: false }), false);
  assert.equal(podeMudarPapel(null, { papel: "membro", souEu: false }), false);
});

test("revogar: owner qualquer não-owner; admin só membro; nunca a si mesmo nem o owner", () => {
  assert.equal(podeRevogar("owner", { papel: "admin", souEu: false }), true);
  assert.equal(podeRevogar("owner", { papel: "membro", souEu: false }), true);
  assert.equal(podeRevogar("owner", { papel: "owner", souEu: false }), false);
  assert.equal(podeRevogar("admin", { papel: "membro", souEu: false }), true);
  assert.equal(podeRevogar("admin", { papel: "admin", souEu: false }), false);
  assert.equal(podeRevogar("admin", { papel: "membro", souEu: true }), false);
  assert.equal(podeRevogar("membro", { papel: "membro", souEu: false }), false);
});

test("função: a própria qualquer um edita; a de outro só admin/owner (§3 + D9)", () => {
  assert.equal(podeEditarFuncao("membro", true), true);
  assert.equal(podeEditarFuncao("membro", false), false);
  assert.equal(podeEditarFuncao("admin", false), true);
  assert.equal(podeEditarFuncao("owner", false), true);
});

test("rótulos PT-BR (nunca a palavra proibida) — os QUATRO papéis, sem buraco", () => {
  assert.equal(rotuloPapel("owner"), "Proprietário");
  assert.equal(rotuloPapel("admin"), "Admin");
  assert.equal(rotuloPapel("membro"), "Membro");
  assert.equal(rotuloPapel("marketing"), "Marketing");
  // Itera PAPEIS de propósito: um quinto papel entrando na união FAZ ESTE TESTE FALHAR sozinho, em
  // vez de sair silenciosamente rotulado "Membro" — que é como `marketing` passou despercebido.
  const rotulos = new Set(PAPEIS.map(rotuloPapel));
  assert.equal(rotulos.size, PAPEIS.length, "papel sem rótulo próprio caiu no fallback 'Membro'");
});

test("papel vindo de FORA do type-system: peneira antes de rotular (tela pública de aceite)", () => {
  for (const p of PAPEIS) {
    assert.ok(ehPapel(p), p);
    assert.equal(rotuloPapelBruto(p), rotuloPapel(p), p);
  }
  assert.equal(ehPapel("gerente"), false);
  assert.equal(ehPapel(null), false);
  // Valor fora do domínio degrada para o de MENOR acesso — nunca para "Admin", nunca para o cru.
  assert.equal(rotuloPapelBruto("gerente"), "Membro");
  assert.equal(rotuloPapelBruto(undefined), "Membro");
});

test("convite: o vocabulário convidável tem marketing e NÃO tem owner", () => {
  assert.deepEqual([...PAPEIS_CONVIDAVEIS], ["membro", "admin", "marketing"]);
  // proprietário não nasce de convite: oferecer a opção seria montar ação que a porta recusa
  assert.ok(!(PAPEIS_CONVIDAVEIS as readonly string[]).includes("owner"));
});

test("leitura do select de convite: toda opção convidável sobrevive à ida e volta", () => {
  // O defeito era `(value === "admin" ? "admin" : "membro")`: escolher Marketing devolvia Membro
  // SEM erro nenhum. Iterar a lista garante que a próxima opção acrescentada seja lida de verdade.
  for (const p of PAPEIS_CONVIDAVEIS) assert.equal(papelConvidavelOuPadrao(p), p, p);
  assert.equal(papelConvidavelOuPadrao("owner"), "membro", "owner não é convidável");
  assert.equal(papelConvidavelOuPadrao(undefined), "membro");
  assert.equal(papelConvidavelOuPadrao("gerente"), "membro");
});

test("iniciais: nome composto usa primeira+última; sem nome cai no email", () => {
  assert.equal(iniciaisMembro("Diogo Fonseca", "x@y.com"), "DF");
  assert.equal(iniciaisMembro("Sara", "x@y.com"), "SA");
  assert.equal(iniciaisMembro(null, "camila.fono@meescuta.com"), "CF");
});

test("convidadoHa: agora / horas / dias (singular e plural)", () => {
  const agora = new Date("2026-07-22T12:00:00-03:00");
  assert.equal(convidadoHa("2026-07-22T11:59:00-03:00", agora), "convidado agora");
  assert.equal(convidadoHa("2026-07-22T10:30:00-03:00", agora), "convidado há 1 hora");
  assert.equal(convidadoHa("2026-07-22T06:00:00-03:00", agora), "convidado há 6 horas");
  assert.equal(convidadoHa("2026-07-21T11:00:00-03:00", agora), "convidado há 1 dia");
  assert.equal(convidadoHa("2026-07-16T12:00:00-03:00", agora), "convidado há 6 dias");
});

test("email de convite: valida forma mínima e recusa lixo", () => {
  assert.equal(emailConviteValido("sara@meescuta.com"), true);
  assert.equal(emailConviteValido("  x@y.co "), true);
  assert.equal(emailConviteValido("sem-arroba"), false);
  assert.equal(emailConviteValido("@dominio.com"), false);
  assert.equal(emailConviteValido("a@"), false);
  assert.equal(emailConviteValido("com espaco@x.com"), false);
});

test("tabela única: owner primeiro, revogados fora dos ativos, pendentes+expirados no fim", () => {
  const membros: MembroLinha[] = [
    { id: "1", nome: "Sara", email: "s@x.com", papel: "membro", funcao: null, ativo: true, ultimo_acesso_em: null },
    { id: "2", nome: "Dono", email: "d@x.com", papel: "owner", funcao: null, ativo: true, ultimo_acesso_em: null },
    { id: "3", nome: "Ex", email: "e@x.com", papel: "membro", funcao: null, ativo: false, ultimo_acesso_em: null },
    { id: "4", nome: "Ana Admin", email: "a@x.com", papel: "admin", funcao: null, ativo: true, ultimo_acesso_em: null },
  ];
  const convites: ConviteLinha[] = [
    { id: "c1", email: "novo@x.com", papel: "membro", funcao: null, criado_em: "2026-07-20", expira_em: "2026-07-27", status: "pendente" },
    { id: "c2", email: "aceito@x.com", papel: "membro", funcao: null, criado_em: "2026-07-19", expira_em: "2026-07-26", status: "aceito" },
    { id: "c3", email: "velho@x.com", papel: "admin", funcao: null, criado_em: "2026-07-10", expira_em: "2026-07-17", status: "expirado" },
  ];
  const { ativos, pendentes } = ordenarTabela(membros, convites);
  assert.deepEqual(ativos.map((m) => m.id), ["2", "4", "1"]); // owner > admin > membro
  assert.deepEqual(pendentes.map((c) => c.id), ["c3", "c1"]); // aceito NÃO aparece
});
