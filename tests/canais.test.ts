import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVISO_APLICACAO_RUNTIME,
  AVISO_RISCO_BAN,
  PREFIXO_LITE,
  avisoDesativacao,
  canalIdDoForm,
  canalIdNaoOficial,
  colunasVisiveis,
  ehCanalNaoOficialId,
  envelopeCanal,
  estadoDoCanal,
  numeroE164Valido,
  ordenarCanais,
  payloadCanalAtivado,
  payloadCanalAtualizado,
  payloadCanalRegistrado,
  podeGerirCanais,
  provedorValido,
  semProblemas,
  slugApelido,
  validarAtivacao,
  validarRegistroCanal,
  type Canal,
  type FormCanal,
} from "../components/configuracoes/regras/canais.ts";

/*
 * F9 — registro de números. O que estes testes protegem, em ordem de dano:
 *  1. ativar sem corte de inbox (despeja o histórico inteiro no inbox de todo mundo);
 *  2. ligar canal não oficial sem consentimento da titular (o dano é de terceiro e não volta);
 *  3. segredo entrando no payload de um ledger append-only;
 *  4. o id `lite:<slug>` sair errado (é chave primária e id determinístico de conversa).
 */

function form(p: Partial<FormCanal> = {}): FormCanal {
  return {
    canalId: "",
    nome: "Jade",
    provedor: "nao_oficial",
    numeroE164: "",
    wabaId: "",
    area: "",
    ...p,
  };
}

function canal(p: Partial<Canal> = {}): Canal {
  return {
    canal_id: "lite:jade",
    nome: "Jade",
    provedor: "nao_oficial",
    ativo: false,
    numero: null,
    waba_id: null,
    area_efetiva: "comercial",
    pareado_em: null,
    consentimento_em: null,
    consentimento_titular: null,
    consentimento_texto_versao: null,
    risco_ban_aceito: true,
    desativado_em: null,
    criado_em: null,
    inbox_desde: null,
    ...p,
  };
}

// ═══════════════════════ id do canal não oficial ═══════════════════════

test("o id do canal não oficial sai do apelido, sem acento e legível", () => {
  assert.equal(canalIdNaoOficial("Jade"), "lite:jade");
  assert.equal(canalIdNaoOficial("Sarah Müller"), "lite:sarah-muller");
  assert.equal(canalIdNaoOficial("  Daniela   Souza  "), "lite:daniela-souza");
});

test("slug não deixa lixo nas pontas nem repete separador", () => {
  assert.equal(slugApelido("--Jade!!--"), "jade");
  assert.equal(slugApelido("a  b"), "a-b");
});

test("nome sem letra nem número não produz id — e o form recusa antes", () => {
  assert.equal(slugApelido("!!!"), "");
  const p = validarRegistroCanal(form({ nome: "!!!" }));
  assert.match(p.nome!, /ao menos uma letra ou número/);
});

test("prefixo lite: é reconhecível nos dois sentidos", () => {
  assert.ok(ehCanalNaoOficialId("lite:jade"));
  assert.ok(!ehCanalNaoOficialId("627327023793464"));
  assert.equal(PREFIXO_LITE, "lite:");
});

test("o id do WABA é declarado, o do não oficial é derivado", () => {
  assert.equal(canalIdDoForm(form({ provedor: "waba", canalId: "627327023793464" })), "627327023793464");
  assert.equal(canalIdDoForm(form({ provedor: "nao_oficial", nome: "Jade", canalId: "ignorado" })), "lite:jade");
});

// ═══════════════════════ validação do registro ═══════════════════════

test("não oficial SEM numero_e164 é válido — o número é da fono e pode não ser conhecido", () => {
  assert.ok(semProblemas(validarRegistroCanal(form({ provedor: "nao_oficial", numeroE164: "" }))));
});

test("WABA sem phone_number_id é recusado, e o motivo diz por quê", () => {
  const p = validarRegistroCanal(form({ provedor: "waba", canalId: "", numeroE164: "+5511999998888" }));
  assert.match(p.canalId!, /phone_number_id/);
});

test("WABA exige E.164 e a recusa mostra o formato", () => {
  const p = validarRegistroCanal(form({ provedor: "waba", canalId: "123", numeroE164: "11 99999-8888" }));
  assert.match(p.numeroE164!, /E\.164/);
});

test("id com prefixo lite: é reservado — WABA não pode usá-lo", () => {
  const p = validarRegistroCanal(form({ provedor: "waba", canalId: "lite:x", numeroE164: "+5511999998888" }));
  assert.match(p.canalId!, /reservado/);
});

test("provedor fora do domínio é recusado (é o valor que liga o filtro da borda)", () => {
  const p = validarRegistroCanal(form({ provedor: "meta" as never }));
  assert.match(p.provedor!, /oficial|não oficial/);
  assert.ok(!provedorValido("meta"));
  assert.ok(!provedorValido("lite"));
  assert.ok(provedorValido("waba") && provedorValido("nao_oficial"));
});

test("nome vazio é recusado", () => {
  assert.ok(validarRegistroCanal(form({ nome: "  " })).nome);
});

test("E.164 aceita o real e recusa o quase", () => {
  assert.ok(numeroE164Valido("+5511999998888"));
  assert.ok(!numeroE164Valido("5511999998888")); // sem +
  assert.ok(!numeroE164Valido("+0511999998888")); // começa com zero
  assert.ok(!numeroE164Valido("+55119"));
});

// ═══════════════════════ ativação: os dois portões que doem ═══════════════════════

test("ativar sem inbox_desde é RECUSADO — é o que despeja o histórico no inbox", () => {
  const p = validarAtivacao({ canal: canal({ consentimento_em: "2026-07-26T10:00:00Z" }), inboxDesde: "", papel: "admin" });
  assert.match(p.inboxDesde!, /corte/);
});

test("canal que JÁ tem corte pode ser ligado sem informar de novo", () => {
  const c = canal({ consentimento_em: "2026-07-26T10:00:00Z", inbox_desde: "2026-07-20T00:00:00Z" });
  assert.ok(semProblemas(validarAtivacao({ canal: c, inboxDesde: "", papel: "owner" })));
});

test("corte desconhecido (view sem a coluna) é tratado como AUSENTE — exige a data", () => {
  const c = canal({ consentimento_em: "2026-07-26T10:00:00Z", inbox_desde: null });
  assert.ok(validarAtivacao({ canal: c, inboxDesde: "", papel: "admin" }).inboxDesde);
});

test("não oficial SEM consentimento não liga, e o motivo diz que o banco também recusa", () => {
  const p = validarAtivacao({ canal: canal({ consentimento_em: null }), inboxDesde: "2026-07-26", papel: "admin" });
  assert.match(p.consentimento!, /consentimento/);
  assert.match(p.consentimento!, /banco/);
});

test("membro não liga nem desliga canal", () => {
  const c = canal({ consentimento_em: "2026-07-26T10:00:00Z", inbox_desde: "2026-07-20T00:00:00Z" });
  assert.ok(validarAtivacao({ canal: c, inboxDesde: "", papel: "membro" }).papel);
  assert.ok(validarAtivacao({ canal: c, inboxDesde: "", papel: null }).papel);
  assert.ok(!podeGerirCanais("membro"));
  assert.ok(podeGerirCanais("admin") && podeGerirCanais("owner"));
});

test("data de corte inválida é recusada com motivo", () => {
  const c = canal({ consentimento_em: "2026-07-26T10:00:00Z" });
  assert.match(validarAtivacao({ canal: c, inboxDesde: "ontem", papel: "admin" }).inboxDesde!, /inválida/);
});

// ═══════════════════════ avisos que a tela é obrigada a dar ═══════════════════════

test("sem saber quantas mensagens estão em voo, o aviso ADMITE isso e ainda exige confirmação", () => {
  const t = avisoDesativacao(null);
  assert.match(t, /PERMANENTE/);
  assert.match(t, /não consegue contar/);
});

test("com contagem conhecida, o aviso mostra o número", () => {
  assert.match(avisoDesativacao(7), /7 mensagens pendentes/);
  assert.match(avisoDesativacao(1), /1 mensagem pendente/);
  assert.match(avisoDesativacao(0), /Nenhuma mensagem pendente/);
});

test("o aviso do runtime diz os 60 s E que a falha não volta sozinha", () => {
  assert.match(AVISO_APLICACAO_RUNTIME, /60 segundos/);
  assert.match(AVISO_APLICACAO_RUNTIME, /permanente/i);
});

test("o aviso de ban nomeia o dano e diz de quem é", () => {
  assert.match(AVISO_RISCO_BAN, /PESSOAL/);
  assert.match(AVISO_RISCO_BAN, /não é reversível/);
});

// ═══════════════════════ payloads e a guarda antissegredo ═══════════════════════

test("canal_registrado leva só o que foi preenchido", () => {
  const { canalId, payload } = payloadCanalRegistrado(form({ nome: "Jade", provedor: "nao_oficial" }));
  assert.equal(canalId, "lite:jade");
  assert.deepEqual(payload, { canal_id: "lite:jade", nome: "Jade", provedor: "nao_oficial" });
});

test("canal_registrado do WABA leva número, waba e área quando existem", () => {
  const { payload } = payloadCanalRegistrado(
    form({ provedor: "waba", canalId: "627327023793464", nome: "Produção", numeroE164: "+5511999998888", wabaId: "9", area: "comercial" }),
  );
  assert.deepEqual(payload, {
    canal_id: "627327023793464",
    nome: "Produção",
    provedor: "waba",
    numero_e164: "+5511999998888",
    waba_id: "9",
    area: "comercial",
  });
});

test("canal_atualizado NUNCA carrega provedor — a porta recusa a alteração", () => {
  const p = payloadCanalAtualizado("lite:jade", { nome: "Jade S." });
  assert.deepEqual(p, { canal_id: "lite:jade", nome: "Jade S." });
  assert.ok(!("provedor" in p));
});

test("canal_ativado carrega o corte quando informado", () => {
  assert.deepEqual(payloadCanalAtivado("lite:jade", "2026-07-26T00:00:00Z"), {
    canal_id: "lite:jade",
    inbox_desde: "2026-07-26T00:00:00Z",
  });
  assert.deepEqual(payloadCanalAtivado("lite:jade", ""), { canal_id: "lite:jade" });
});

test("envelope de canal tem a forma exata que a porta espera", () => {
  const r = envelopeCanal("canal_registrado", "id-externo", { canal_id: "lite:jade", nome: "Jade" });
  assert.ok(r.ok);
  assert.deepEqual(r.envelope, {
    tipo: "canal_registrado",
    id_externo: "id-externo",
    versao_payload: 1,
    payload: { canal_id: "lite:jade", nome: "Jade" },
  });
  // ator e origem NÃO vão: a porta os força do JWT
  assert.ok(!("ator" in r.envelope));
  assert.ok(!("origem" in r.envelope));
});

test("payload com cara de segredo é RECUSADO antes de sair da máquina", () => {
  const r = envelopeCanal("canal_registrado", "x", { canal_id: "lite:jade", access_token: "EAAxxxx" });
  assert.ok(!r.ok);
  assert.match((r as { motivo: string }).motivo, /segredo/);
});

test("a guarda antissegredo desce em objeto aninhado (mais estrita que a da porta)", () => {
  const r = envelopeCanal("canal_atualizado", "x", { canal_id: "lite:jade", extra: { instanceToken: "abc" } });
  assert.ok(!r.ok);
});

// ═══════════════════════ apresentação ═══════════════════════

test("canal não oficial sem consentimento tem estado próprio — não é só 'desligado'", () => {
  assert.equal(estadoDoCanal(canal({ ativo: false, consentimento_em: null })), "bloqueado_sem_consentimento");
  assert.equal(estadoDoCanal(canal({ ativo: false, consentimento_em: "2026-07-26T10:00:00Z" })), "inativo");
  assert.equal(estadoDoCanal(canal({ ativo: true, consentimento_em: "2026-07-26T10:00:00Z" })), "ativo");
  assert.equal(estadoDoCanal(canal({ provedor: "waba", ativo: false })), "inativo");
});

test("ordenação põe os ligados na frente e é estável por nome", () => {
  const lista = ordenarCanais([
    canal({ canal_id: "b", nome: "Zulu", ativo: false }),
    canal({ canal_id: "a", nome: "Alfa", ativo: true }),
    canal({ canal_id: "c", nome: "Bravo", ativo: false }),
  ]);
  assert.deepEqual(lista.map((c) => c.nome), ["Alfa", "Bravo", "Zulu"]);
});

// ═══════════════════════ coluna com valor único some (decisão sobre o r10) ═══════════════════════

test("enquanto TODOS forem comerciais e oficiais, ÁREA e PROVEDOR somem da tabela", () => {
  const cols = colunasVisiveis([
    canal({ canal_id: "a", provedor: "waba", area_efetiva: "comercial" }),
    canal({ canal_id: "b", provedor: "waba", area_efetiva: "comercial" }),
  ]);
  assert.deepEqual(cols, { provedor: false, area: false });
});

test("a coluna VOLTA no instante em que passa a significar alguma coisa", () => {
  assert.equal(
    colunasVisiveis([
      canal({ canal_id: "a", provedor: "waba", area_efetiva: "comercial" }),
      canal({ canal_id: "b", provedor: "nao_oficial", area_efetiva: "comercial" }),
    ]).provedor,
    true,
  );
  assert.equal(
    colunasVisiveis([
      canal({ canal_id: "a", provedor: "waba", area_efetiva: "comercial" }),
      canal({ canal_id: "b", provedor: "waba", area_efetiva: "clinica" }),
    ]).area,
    true,
  );
});

test("área ausente conta como 'comercial' — nulo não inventa uma segunda área", () => {
  assert.equal(
    colunasVisiveis([
      canal({ canal_id: "a", area_efetiva: null }),
      canal({ canal_id: "b", area_efetiva: "comercial" }),
    ]).area,
    false,
  );
});

test("tabela vazia não mostra coluna nenhuma dessas", () => {
  assert.deepEqual(colunasVisiveis([]), { provedor: false, area: false });
});
