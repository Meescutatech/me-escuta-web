import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Departamento } from "../lib/departamentos/escopo.ts";
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
  opcoesDepartamento,
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
  ehFaixaTesteMeta,
  finalidadeValida,
  rotuloDepartamento,
  rotuloFinalidade,
  NIVEIS,
  NIVEL_PADRAO,
  consequenciaNivel,
  nivelAfrouxaOFiltro,
  nivelDoCanal,
  nivelValido,
  payloadNivelCanal,
  rotuloNivel,
  validarTrocaNivel,
  type Canal,
  type FormCanal,
  type NivelCanal,
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
    // o molde nasce COM dono: quase todo teste aqui é de canal não oficial, e a porta o exige.
    // Quem quiser exercer a ausência passa `responsavelId: ""` explicitamente — que é o caso do
    // teste da recusa, logo abaixo.
    responsavelId: "11111111-1111-4111-8111-111111111111",
    numeroE164: "",
    wabaId: "",
    departamento: "",
    // M7 · o fixture DECLARA a finalidade porque o formulário passou a exigi-la. O campo real
    // nasce vazio (`""`) de propósito — quem testa a exigência é o bloco M7 lá embaixo.
    finalidade: "teste",
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
    departamento: null,
    pareado_em: null,
    consentimento_em: null,
    consentimento_titular: null,
    consentimento_texto_versao: null,
    consentimento_por: null,
    risco_ban_aceito: true,
    desativado_em: null,
    criado_em: null,
    inbox_desde: null,
    finalidade: "teste",
    // D70 · o fixture nasce SEM nivel e SEM declaracao, que e o estado real de todo canal em
    // producao hoje (medido 08/09/2026: a view nao tem a coluna). `nivelDoCanal` cai em `estrito`.
    nivel: null,
    nivel_declarado: false,
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
  // Régua atualizada: `finalidade` entrou no payload (M7). O que este teste protege — "só o que
  // foi PREENCHIDO viaja" — continua protegido, e o invariante está no teste seguinte, nomeado.
  assert.deepEqual(payload, {
    canal_id: "lite:jade",
    nome: "Jade",
    provedor: "nao_oficial",
    finalidade: "teste",
    // 14/09 · o DONO entra no payload. A porta sempre o exigiu no não oficial e o formulário nunca
    // o mandava — o cadastro de número não oficial nunca funcionou em produção por causa disso.
    responsavel_id: "11111111-1111-4111-8111-111111111111",
  });
});

test("INVARIANTE · campo em branco NÃO vira chave no payload — inclusive finalidade", () => {
  // A proteção que a régua acima poderia ter apagado. Chave vazia num ledger append-only fica
  // para sempre, e `finalidade: \"\"` seria recusado pelo CHECK de domínio no melhor caso e
  // gravado como lixo no pior.
  const { payload } = payloadCanalRegistrado(
    form({ nome: "Jade", provedor: "nao_oficial", numeroE164: "", wabaId: "", departamento: "", finalidade: "", responsavelId: "" }),
  );
  assert.deepEqual(Object.keys(payload).sort(), ["canal_id", "nome", "provedor"]);
  assert.equal("finalidade" in payload, false);
  // o dono segue a mesma regra: em branco não vira chave. Quem barra o vazio é
  // `validarRegistroCanal`, ANTES de montar o payload — aqui se prova que o montador não inventa.
  assert.equal("responsavel_id" in payload, false);
});

test("canal_registrado do WABA leva número, waba e DEPARTAMENTO quando existem", () => {
  const { payload } = payloadCanalRegistrado(
    form({ provedor: "waba", canalId: "627327023793464", nome: "Produção", numeroE164: "+5511999998888", wabaId: "9", departamento: "pre_venda" }),
  );
  assert.deepEqual(payload, {
    canal_id: "627327023793464",
    nome: "Produção",
    provedor: "waba",
    departamento: "pre_venda",
    numero_e164: "+5511999998888",
    waba_id: "9",
    finalidade: "teste",
    responsavel_id: "11111111-1111-4111-8111-111111111111",
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

test("enquanto TODOS forem do mesmo departamento e oficiais, DEPARTAMENTO e PROVEDOR somem", () => {
  const cols = colunasVisiveis([
    canal({ canal_id: "a", provedor: "waba", departamento: "pre_venda" }),
    canal({ canal_id: "b", provedor: "waba", departamento: "pre_venda" }),
  ]);
  // A régua mudou porque a DEFINIÇÃO mudou (ARB-R18-05: `finalidade` entrou e nunca some). O que
  // este teste protegia — "valor único vira ruído e sai" — continua protegido nas duas colunas em
  // que ele vale, e o invariante que a mudança poderia ter apagado está logo abaixo, nomeado.
  assert.deepEqual(cols, { provedor: false, departamento: false, finalidade: true, consentimento: false });
});

test("ARB-R18-05 · `finalidade` NÃO some quando todas as linhas são iguais — valor único aqui é o ALARME", () => {
  // O estado de HOJE em produção, medido: dois canais, os dois `teste`. A regra genérica da casa
  // esconderia exatamente a informação que evita o engano. Este é o invariante que impede alguém
  // de "simplificar" aplicando a regra por coerência.
  const cols = colunasVisiveis([
    canal({ canal_id: "627327023793464", provedor: "waba", finalidade: "teste" }),
    canal({ canal_id: "608866985643828", provedor: "waba", finalidade: "teste" }),
  ]);
  assert.equal(cols.finalidade, true);
  // e continua verdadeiro no mundo oposto — todas de produção, que também é valor único
  assert.equal(
    colunasVisiveis([
      canal({ canal_id: "a", finalidade: "producao" }),
      canal({ canal_id: "b", finalidade: "producao" }),
    ]).finalidade,
    true,
  );
});

test("as 4 colunas de consentimento só aparecem onde existe titular terceiro", () => {
  // Para canal `waba` não há titular: a coluna ficaria vazia em 100% das linhas, e aí a regra de
  // valor único VALE — ao contrário do selo TESTE. É o contraste que prova que é a mesma regra.
  assert.equal(colunasVisiveis([canal({ canal_id: "a", provedor: "waba" })]).consentimento, false);
  assert.equal(
    colunasVisiveis([
      canal({ canal_id: "a", provedor: "waba" }),
      canal({ canal_id: "b", provedor: "nao_oficial" }),
    ]).consentimento,
    true,
  );
});

test("a coluna VOLTA no instante em que passa a significar alguma coisa", () => {
  assert.equal(
    colunasVisiveis([
      canal({ canal_id: "a", provedor: "waba", departamento: "pre_venda" }),
      canal({ canal_id: "b", provedor: "nao_oficial", departamento: "pre_venda" }),
    ]).provedor,
    true,
  );
  assert.equal(
    colunasVisiveis([
      canal({ canal_id: "a", provedor: "waba", departamento: "pre_venda" }),
      canal({ canal_id: "b", provedor: "waba", departamento: "clinico" }),
    ]).departamento,
    true,
  );
});

test("R22 · departamento AUSENTE é um valor próprio, e não vira `comercial` por conveniência", () => {
  // MUDANÇA DELIBERADA em relação ao que este teste dizia até a R22. A versão antiga fazia
  // `area_efetiva ?? "comercial"` e afirmava que nulo NÃO cria uma segunda área — o que apagava
  // justamente o contraste que a coluna precisa mostrar: um número declarado ao lado de um número
  // que ninguém declarou. `null` significa "nunca declarou", e essa é a linha que precisa de
  // conserto; escondê-la era o defeito, não a proteção.
  assert.equal(
    colunasVisiveis([
      canal({ canal_id: "a", departamento: null }),
      canal({ canal_id: "b", departamento: "pre_venda" }),
    ]).departamento,
    true,
  );
  // e continua sumindo quando TODOS são não-declarados — aí sim é valor único, e é redundância
  assert.equal(
    colunasVisiveis([
      canal({ canal_id: "a", departamento: null }),
      canal({ canal_id: "b", departamento: null }),
    ]).departamento,
    false,
  );
});

test("tabela vazia não mostra coluna nenhuma dessas", () => {
  // Inclusive `finalidade`: "sempre visível" é sobre linha existente. Cabeçalho de coluna sobre
  // zero linhas não é alarme, é moldura vazia.
  assert.deepEqual(colunasVisiveis([]), {
    provedor: false,
    departamento: false,
    finalidade: false,
    consentimento: false,
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// M7 · R18 — identidade e finalidade do número
//
// O que este bloco protege, em ordem de dano:
//  1. número oficial VIVO sem identidade — hoje é o estado real do `627327023793464`;
//  2. `+1 555` (faixa de teste da Meta) declarado como produção;
//  3. `waba_id` sumindo calado do payload de registro — a assinatura do evento gravado no ledger;
//  4. finalidade nascendo com default — o defeito exato que a coluna existe para evitar.
// ══════════════════════════════════════════════════════════════════════════════════════════════

// ─────────────────────────── faixa de teste da Meta ───────────────────────────

test("os DOIS números reais da Me Escuta caem na faixa de teste — medidos na Graph API", () => {
  assert.equal(ehFaixaTesteMeta("+15557252751"), true); // 627327023793464 · producao
  assert.equal(ehFaixaTesteMeta("+15556418435"), true); // 608866985643828 · teste_meta
});

test("número BR real NÃO cai na faixa — a guarda não pode barrar produção legítima", () => {
  // Controle negativo do detector. Sem ele a guarda poderia estar recusando tudo e parecendo boa.
  assert.equal(ehFaixaTesteMeta("+5531998626387"), false);
  assert.equal(ehFaixaTesteMeta("+5511999998888"), false);
});

test("o 555 tem de ser o CÓDIGO DE ÁREA, não um 555 em qualquer lugar do número", () => {
  assert.equal(ehFaixaTesteMeta("+15555550000"), true);   // +1 555 555 0000 — é da faixa
  assert.equal(ehFaixaTesteMeta("+12125557252"), false);  // +1 212 555 7252 — Nova York, não é
  assert.equal(ehFaixaTesteMeta("+5555555555555"), false);
  assert.equal(ehFaixaTesteMeta(null), false);
  assert.equal(ehFaixaTesteMeta(""), false);
});

// ─────────────────────────── finalidade: declarada ou não existe ───────────────────────────

test("finalidade é obrigatória no formulário, e NÃO tem valor pré-selecionado", () => {
  const p = validarRegistroCanal(form({ finalidade: "" }));
  assert.ok(p.finalidade, "form sem finalidade tem de acusar");
  assert.match(p.finalidade!, /não há valor padrão/i);
});

test("o domínio de finalidade é fechado — nada além de teste|producao", () => {
  assert.equal(finalidadeValida("teste"), true);
  assert.equal(finalidadeValida("producao"), true);
  assert.equal(finalidadeValida("homologacao"), false);
  assert.equal(finalidadeValida(""), false);
  assert.equal(finalidadeValida(null), false);
});

test("finalidade ausente NUNCA é apresentada como produção — a tela diz que não sabe", () => {
  // O engano do M7 é o dado se APRESENTAR como produção. Rotular nulo como "Produção" seria
  // reproduzir na tela exatamente o defeito que a coluna existe para desfazer.
  assert.equal(rotuloFinalidade(null), "Não declarada");
  assert.equal(rotuloFinalidade("teste"), "Teste");
  assert.equal(rotuloFinalidade("producao"), "Produção");
});

test("a porta da TELA recusa +1 555 declarado como produção, com o motivo nomeado", () => {
  const p = validarRegistroCanal(
    form({ provedor: "waba", canalId: "627327023793464", numeroE164: "+15557252751",
           wabaId: "966114259004051", finalidade: "producao" }),
  );
  assert.ok(p.finalidade);
  assert.match(p.finalidade!, /faixa de teste da Meta/i);
});

test("CONTROLE NEGATIVO · número BR declarado produção PASSA — senão a guarda barra o alvo", () => {
  // Sem este teste, uma guarda que recusasse tudo ficaria verde no teste anterior por vício.
  const p = validarRegistroCanal(
    form({ provedor: "waba", canalId: "111", numeroE164: "+5531998626387",
           wabaId: "966114259004051", finalidade: "producao" }),
  );
  assert.equal(p.finalidade, undefined);
  assert.equal(semProblemas(p), true);
});

test("a guarda NÃO vale ao contrário: número BR declarado TESTE é permitido", () => {
  // Declarar MENOS privilégio do que se tem é sempre seguro, e proibir atrapalharia ensaio real.
  const p = validarRegistroCanal(
    form({ provedor: "waba", canalId: "111", numeroE164: "+5531998626387",
           wabaId: "966114259004051", finalidade: "teste" }),
  );
  assert.equal(semProblemas(p), true);
});

// ─────────────────────────── waba_id obrigatório no registro ───────────────────────────

test("canal oficial SEM waba_id é recusado no registro — era o buraco que gravou o ledger torto", () => {
  const p = validarRegistroCanal(
    form({ provedor: "waba", canalId: "627327023793464", numeroE164: "+15557252751", wabaId: "" }),
  );
  assert.ok(p.wabaId);
  assert.match(p.wabaId!, /WABA id/i);
});

test("e o payload de registro CARREGA waba_id e finalidade quando o form é válido", () => {
  const { payload } = payloadCanalRegistrado(
    form({ provedor: "waba", canalId: "627327023793464", numeroE164: "+15557252751",
           wabaId: "966114259004051", finalidade: "teste" }),
  );
  assert.equal(payload.waba_id, "966114259004051");
  assert.equal(payload.numero_e164, "+15557252751");
  assert.equal(payload.finalidade, "teste");
});

test("canal NÃO OFICIAL continua sem waba_id, e isso não é problema", () => {
  // A exigência é do provedor `waba` só. Regressão fácil: exigir para todo mundo e travar o Lite.
  const p = validarRegistroCanal(form({ provedor: "nao_oficial", nome: "Jade", wabaId: "" }));
  assert.equal(p.wabaId, undefined);
  assert.equal(semProblemas(p), true);
});

// ─────────────────────────── identidade é pré-condição de VIDA ───────────────────────────

test("ativar canal oficial sem identidade é recusado — é o estado real do 627327023793464", () => {
  const p = validarAtivacao({
    canal: canal({ canal_id: "627327023793464", provedor: "waba", nome: "producao",
                   waba_id: null, numero: null, inbox_desde: "2026-07-20T00:30:17Z" }),
    inboxDesde: "2026-07-20T00:30:17Z",
    papel: "admin",
  });
  assert.ok(p.identidade);
  assert.match(p.identidade!, /WABA id e número em E\.164/);
});

test("o motivo NOMEIA o que falta — só o waba_id, só o número, ou os dois", () => {
  const soNumero = validarAtivacao({
    canal: canal({ provedor: "waba", waba_id: "966114259004051", numero: null,
                   inbox_desde: "2026-07-20T00:30:17Z" }),
    inboxDesde: "", papel: "admin",
  });
  assert.match(soNumero.identidade!, /^falta número em E\.164/);

  const soWaba = validarAtivacao({
    canal: canal({ provedor: "waba", waba_id: null, numero: "+15556418435",
                   inbox_desde: "2026-07-20T00:30:17Z" }),
    inboxDesde: "", papel: "admin",
  });
  assert.match(soWaba.identidade!, /^falta WABA id/);
});

test("com identidade completa, a ativação passa", () => {
  const p = validarAtivacao({
    canal: canal({ canal_id: "608866985643828", provedor: "waba", waba_id: "1063927472233881",
                   numero: "+15556418435", inbox_desde: "2026-07-20T20:25:00Z" }),
    inboxDesde: "", papel: "admin",
  });
  assert.equal(p.identidade, undefined);
  assert.equal(semProblemas(p), true);
});

test("canal NÃO OFICIAL sem waba_id/número continua ativável — o recorte é o mesmo da constraint", () => {
  // `numero_e164` é opcional lá (número de terceiro) e `waba_id` é proibido lá. Exigir identidade
  // no não oficial travaria o Lite inteiro por simetria mal aplicada.
  const p = validarAtivacao({
    canal: canal({ provedor: "nao_oficial", waba_id: null, numero: null,
                   consentimento_em: "2026-07-01T00:00:00Z", inbox_desde: "2026-07-20T00:30:17Z" }),
    inboxDesde: "", papel: "admin",
  });
  assert.equal(p.identidade, undefined);
});

test("finalidade nula NÃO impede ativar — coluna ausente é degrade, não recusa", () => {
  // Antes da migration a coluna não existe e `finalidade` chega nula. Bloquear aqui deixaria a
  // tela travada num ambiente onde o defeito não existe. A recusa é sobre IDENTIDADE, não sobre
  // finalidade — e essa distinção é o que deixa a web subir antes do banco.
  const p = validarAtivacao({
    canal: canal({ provedor: "waba", waba_id: "1063927472233881", numero: "+15556418435",
                   finalidade: null, inbox_desde: "2026-07-20T20:25:00Z" }),
    inboxDesde: "", papel: "admin",
  });
  assert.equal(semProblemas(p), true);
});

// ─────────────────── ordem de ATENÇÃO (recomendação do Croqui, ARB-R18-02) ───────────────────

test("a ordem põe o que NÃO alcança paciente em cima: não declarada → teste → produção", () => {
  const lista = ordenarCanais([
    canal({ canal_id: "c", nome: "Real BR", finalidade: "producao", ativo: true }),
    canal({ canal_id: "a", nome: "Sem declarar", finalidade: null, ativo: true }),
    canal({ canal_id: "b", nome: "De teste", finalidade: "teste", ativo: true }),
  ]);
  assert.deepEqual(lista.map((c) => c.nome), ["Sem declarar", "De teste", "Real BR"]);
});

test("finalidade vem ANTES de ativo — um número de teste LIGADO não se esconde atrás de um de produção", () => {
  const lista = ordenarCanais([
    canal({ canal_id: "p", nome: "Producao", finalidade: "producao", ativo: true }),
    canal({ canal_id: "t", nome: "Teste", finalidade: "teste", ativo: false }),
  ]);
  assert.equal(lista[0]!.nome, "Teste", "o desligado de teste sobe: é o que precisa de atenção");
});

test("com todos na mesma finalidade, a ordem antiga sobrevive intacta (ativo → provedor → nome)", () => {
  // O estado de HOJE: dois canais, os dois `teste`. A chave nova não pode ter mudado nada agora —
  // se mudou, ela não é ordenação de atenção, é rearranjo gratuito de tela em produção.
  const lista = ordenarCanais([
    canal({ canal_id: "b", nome: "Zulu", ativo: false, finalidade: "teste" }),
    canal({ canal_id: "a", nome: "Alfa", ativo: true, finalidade: "teste" }),
    canal({ canal_id: "c", nome: "Bravo", ativo: false, finalidade: "teste" }),
  ]);
  assert.deepEqual(lista.map((c) => c.nome), ["Alfa", "Bravo", "Zulu"]);
});

// ══════════════════ R22/A1 · o colapso do vocabulário (D22-1, paga a ARB-R18-02) ══════════════════

/**
 * A ÁRVORE REAL, medida em `core.v_departamento` no banco de produção em 07/08/2026 — 7 nós, 2
 * níveis. Não é um fixture inventado: é o que a tela vai receber, e é por isso que ela cabe aqui.
 *
 *   comercial ── pre_venda · avaliacao · credito
 *   pos_venda ── cobranca · clinico
 */
const ARVORE: Departamento[] = [
  { chave: "comercial", rotulo: "Comercial", pai: null, nivel: 1, ativo: true, entrada: false, ordem: 0 },
  { chave: "pos_venda", rotulo: "Pós-venda", pai: null, nivel: 1, ativo: true, entrada: false, ordem: 1 },
  { chave: "pre_venda", rotulo: "Pré-venda", pai: "comercial", nivel: 2, ativo: true, entrada: true, ordem: 0 },
  { chave: "avaliacao", rotulo: "Avaliação", pai: "comercial", nivel: 2, ativo: true, entrada: false, ordem: 1 },
  { chave: "credito", rotulo: "Crédito", pai: "comercial", nivel: 2, ativo: true, entrada: false, ordem: 2 },
  { chave: "cobranca", rotulo: "Cobrança", pai: "pos_venda", nivel: 2, ativo: true, entrada: false, ordem: 0 },
  { chave: "clinico", rotulo: "Clínico", pai: "pos_venda", nivel: 2, ativo: true, entrada: false, ordem: 1 },
];

test("o select oferece os 7 nós do banco, na ordem da árvore — pai, depois os filhos dele", () => {
  assert.deepEqual(
    opcoesDepartamento(ARVORE).map((o) => o.chave),
    ["comercial", "pre_venda", "avaliacao", "credito", "pos_venda", "cobranca", "clinico"],
  );
});

test("só as FOLHAS são escolhíveis — `comercial` e `pos_venda` entram desabilitados", () => {
  // Não é estética: a porta RECUSA nó de agrupamento (GUARDA:M8:escrita_so_em_folha, herdada pela
  // VD1 da 0130). Oferecer o que será recusado faria a recusa ser a primeira notícia — e foi de
  // `comercial` que a rodada 18 teve de descer os dois canais à mão para a 0087 poder entrar.
  const naoSelecionaveis = opcoesDepartamento(ARVORE).filter((o) => !o.selecionavel).map((o) => o.chave);
  assert.deepEqual(naoSelecionaveis, ["comercial", "pos_venda"]);
  assert.equal(opcoesDepartamento(ARVORE).filter((o) => o.selecionavel).length, 5);
});

test("departamento arquivado sai do select — o domínio é o que está ATIVO", () => {
  const comArquivado = [...ARVORE, {
    chave: "morto", rotulo: "Extinto", pai: "comercial", nivel: 2, ativo: false, entrada: false, ordem: 9,
  }];
  assert.equal(opcoesDepartamento(comArquivado).some((o) => o.chave === "morto"), false);
});

test("a tela mostra RÓTULO, nunca a chave — `Pré-venda`, não `pre_venda`", () => {
  assert.equal(rotuloDepartamento("pre_venda", ARVORE), "Pré-venda");
  assert.equal(rotuloDepartamento(null, ARVORE), "Não declarado");
});

test("chave FORA do domínio volta ela mesma, e isso é deliberado", () => {
  // Um canal apontando para um departamento arquivado tem de ficar VISÍVEL como estranho. Devolver
  // "—" esconderia justamente a linha que precisa de conserto.
  assert.equal(rotuloDepartamento("financeiro", ARVORE), "financeiro");
});

test("`area` NÃO viaja mais no payload — a palavra morreu na saída, não só na tela", () => {
  const { payload } = payloadCanalRegistrado(
    form({ provedor: "waba", canalId: "1", nome: "N", numeroE164: "+5511999998888", wabaId: "9", departamento: "credito" }),
  );
  assert.equal(payload.departamento, "credito");
  assert.equal("area" in payload, false, "mandar as duas chaves manteria viva a fonte que esta rodada matou");

  const patch = payloadCanalAtualizado("1", { departamento: "cobranca" });
  assert.equal(patch.departamento, "cobranca");
  assert.equal("area" in patch, false);
});

test("departamento em branco NÃO vira chave no payload — `null` é 'nunca declarou'", () => {
  const { payload } = payloadCanalRegistrado(
    form({ provedor: "nao_oficial", nome: "Jade", departamento: "" }),
  );
  assert.equal("departamento" in payload, false);
});

// ─────────────────────────── A GUARDA DE `grep`, e ela é o item ───────────────────────────

test("PORTÃO · nenhuma lista de departamentos hardcoded voltou ao repositório", () => {
  /*
   * Isto é `grep` no CI, não revisão humana, e a diferença está escrita na SPEC-A §10: *"`const
   * AREAS` volta por cópia — já aconteceu uma vez"*. A constante morta era
   * `["comercial", "clinica", "financeiro", "pos_venda"]`, copiada do mockup r10, e o modo de
   * falha é COLAR de volta num arquivo vizinho, onde ninguém procura.
   *
   * O que o portão pega: qualquer array literal de strings que contenha DOIS ou mais nomes de
   * departamento. Um nome sozinho é legítimo (`CLINICO` em `lib/departamentos/escopo.ts` é
   * fronteira CONSTITUCIONAL e está lá de propósito, com o motivo escrito); dois ou mais é alguém
   * reconstruindo o vocabulário fora do banco.
   *
   * `tests/` FICA DE FORA, e a exceção é do tipo que precisa de motivo escrito: um teste tem de
   * poder NOMEAR o valor esperado. `tests/departamentos.test.ts` afirma `["comercial","pre_venda",
   * …]` como resultado de `ordenar()` — apagar isso seria trocar uma asserção de verdade por uma
   * que só compara a função com ela mesma. O risco que o portão existe para pegar é código de
   * PRODUÇÃO oferecendo um domínio que o banco não conhece; um array dentro de um teste não chega
   * a `<select>` nenhum. Se algum dia um teste virar a fonte de um componente, o problema é o
   * componente.
   */
  const RAIZ = new URL("..", import.meta.url).pathname;
  const IGNORAR = new Set(["node_modules", ".next", ".git", "public", "docs", "tests"]);
  const NOMES = ["comercial", "pos_venda", "pre_venda", "avaliacao", "credito", "cobranca", "clinico", "clinica", "financeiro"];

  function varrer(dir: string, acc: string[] = []): string[] {
    let itens: string[];
    try { itens = readdirSync(dir); } catch { return acc; }
    for (const it of itens) {
      if (IGNORAR.has(it)) continue;
      const caminho = join(dir, it);
      let ehDir = false;
      try { ehDir = statSync(caminho).isDirectory(); } catch { continue; }
      if (ehDir) varrer(caminho, acc);
      else if (/\.(ts|tsx)$/.test(it)) acc.push(caminho);
    }
    return acc;
  }

  /** O detector, isolado — para poder ser exercido nos DOIS sentidos (padrão do `portao-web-b`). */
  function acharListaDeDepartamentos(texto: string): string[] {
    const achados: string[] = [];
    for (const m of texto.matchAll(/\[[^\[\]\n]{0,400}?\]/g)) {
      const trecho = m[0];
      const nomes = NOMES.filter((n) => new RegExp(`["'\`]${n}["'\`]`).test(trecho));
      if (nomes.length >= 2) achados.push(`${nomes.join("+")} em ${trecho.slice(0, 90)}`);
    }
    return achados;
  }

  // ── SENTIDO 1 · o portão REPROVA a constante morta, byte a byte como ela era ──
  // Sem isto o teste seria verde-decorativo: um detector quebrado passaria despercebido para
  // sempre, porque o repositório limpo não tem o que ele procura.
  const CONSTANTE_MORTA =
    "const AREAS = [" + '"comercial", "clinica", "financeiro", "pos_venda"' + "];";
  assert.equal(
    acharListaDeDepartamentos(CONSTANTE_MORTA).length,
    1,
    "o detector NÃO reconhece mais a constante que ele existe para pegar — portão quebrado",
  );
  // e NÃO reprova um nome sozinho, que é legítimo (o `CLINICO` constitucional de escopo.ts)
  assert.deepEqual(acharListaDeDepartamentos('const X = ["clinico"];'), []);

  // ── SENTIDO 2 · o portão APROVA o repositório real, lido do disco agora ──
  const violacoes: string[] = [];
  for (const arq of varrer(RAIZ)) {
    for (const achado of acharListaDeDepartamentos(readFileSync(arq, "utf8"))) {
      violacoes.push(`${relative(RAIZ, arq)}: ${achado}`);
    }
  }

  assert.deepEqual(
    violacoes,
    [],
    "lista de departamentos hardcoded encontrada. O domínio vem de `core.v_departamento`, sempre. " +
      "Se este teste ficou vermelho por um caso legítimo, o conserto é ler do banco — não é " +
      "afrouxar o portão:\n" + violacoes.join("\n"),
  );
});

// ═══════════════════════════ D70 · o NÍVEL do canal ═══════════════════════════

/*
 * O que estes testes seguram, em ordem de dano:
 *  1. ignorância virar permissão — nível ausente, nulo, vazio ou fora do domínio TEM de valer
 *     `estrito`. É a única direção em que errar é barato;
 *  2. a tela oferecer troca de nível a quem a porta recusa (todo evento `canal_*` exige admin);
 *  3. afrouxar o filtro de um canal cuja titular nunca consentiu.
 */

test("D70 · o domínio tem exatamente três níveis, e o primeiro é o mais fechado", () => {
  assert.deepEqual(NIVEIS, ["estrito", "responde_qualquer_um", "aberto"]);
  assert.equal(NIVEL_PADRAO, "estrito");
  assert.equal(NIVEIS[0], NIVEL_PADRAO);
});

test("D70 · nivelValido é allowlist — nada de fora entra", () => {
  for (const n of NIVEIS) assert.ok(nivelValido(n));
  for (const lixo of ["", " ", "ESTRITO", "livre", "aberto ", null, undefined, 1, {}, ["aberto"]]) {
    assert.equal(nivelValido(lixo), false, String(lixo));
  }
});

test("D70 · FAIL-CLOSED: toda ignorância vale estrito, e nenhuma vale aberto", () => {
  // a lista é literal de propósito: cada item já apareceu, ou pode aparecer, vindo do banco.
  assert.equal(nivelDoCanal(canal()), "estrito"); // nunca declarado
  assert.equal(nivelDoCanal({ nivel: null }), "estrito");
  assert.equal(nivelDoCanal({ nivel: undefined }), "estrito");
  assert.equal(nivelDoCanal({}), "estrito"); // coluna ausente na view
  assert.equal(nivelDoCanal(null), "estrito");
  assert.equal(nivelDoCanal(undefined), "estrito");
  assert.equal(nivelDoCanal({ nivel: "" }), "estrito");
  assert.equal(nivelDoCanal({ nivel: "ABERTO" }), "estrito"); // caixa errada não é o domínio
  assert.equal(nivelDoCanal({ nivel: "aberto_total" }), "estrito"); // valor inventado
  assert.equal(nivelDoCanal({ nivel: true }), "estrito");
});

test("D70 · nível declarado é lido como veio — o fail-closed não engole valor legítimo", () => {
  assert.equal(nivelDoCanal(canal({ nivel: "aberto" })), "aberto");
  assert.equal(nivelDoCanal(canal({ nivel: "responde_qualquer_um" })), "responde_qualquer_um");
  assert.equal(nivelDoCanal(canal({ nivel: "estrito" })), "estrito");
});

test("D70 · a consequência de cada nível diz o que PASSA A ACONTECER, nos dois sentidos", () => {
  // entrada E saída em toda frase: um nível que só falasse de entrada esconderia metade do efeito.
  const estrito = consequenciaNivel("estrito").toLowerCase();
  assert.match(estrito, /lead/);
  assert.match(estrito, /paciente/);
  assert.match(estrito, /aceite/);
  assert.match(estrito, /descartada/);

  const responde = consequenciaNivel("responde_qualquer_um").toLowerCase();
  assert.match(responde, /qualquer pessoa/);
  assert.match(responde, /ja escreveu|já escreveu/);

  const aberto = consequenciaNivel("aberto").toLowerCase();
  assert.match(aberto, /banir/);
  assert.match(aberto, /qualquer/);

  // as três são distintas: consequência copiada é consequência que ninguém lê.
  assert.equal(new Set(NIVEIS.map(consequenciaNivel)).size, 3);
  // e nenhuma é o nome do nível em outra roupa
  for (const n of NIVEIS) assert.ok(consequenciaNivel(n).length > 80, n);
});

test("D70 · rótulo é português de gente, nunca a chave do banco", () => {
  for (const n of NIVEIS) assert.ok(!rotuloNivel(n).includes("_"), n);
  assert.equal(rotuloNivel("estrito"), "Estrito");
  assert.equal(new Set(NIVEIS.map(rotuloNivel)).size, 3);
});

test("D70 · afrouxar é tudo que não é estrito — e é o que exige aceite", () => {
  assert.equal(nivelAfrouxaOFiltro("estrito"), false);
  assert.equal(nivelAfrouxaOFiltro("responde_qualquer_um"), true);
  assert.equal(nivelAfrouxaOFiltro("aberto"), true);
});

// ─────────────── validarTrocaNivel: papel, provedor, consentimento ───────────────

const litePronto = canal({ consentimento_em: "2026-09-08T00:00:00Z", consentimento_texto_versao: "v2" });

test("D71.a · trocar nível é da GESTÃO — membro e null são recusados", () => {
  for (const papel of ["membro", "marketing", null] as const) {
    const p = validarTrocaNivel({ canal: litePronto, nivel: "aberto", papel });
    assert.ok(p.papel, String(papel));
    assert.match(p.papel!, /admin/);
  }
  for (const papel of ["admin", "owner"] as const) {
    assert.equal(validarTrocaNivel({ canal: litePronto, nivel: "aberto", papel }).papel, undefined);
  }
});

test("D70 · nível só existe no canal NÃO OFICIAL — é lá que a borda filtra por contraparte", () => {
  const oficial = canal({ provedor: "waba", consentimento_em: "2026-09-08T00:00:00Z" });
  const p = validarTrocaNivel({ canal: oficial, nivel: "aberto", papel: "owner" });
  assert.ok(p.provedor);
  assert.match(p.provedor!, /nao oficial|não oficial/);
});

test("D70 · sem consentimento da titular, o canal NÃO sai do estrito", () => {
  const semConsent = canal({ consentimento_em: null });
  const p = validarTrocaNivel({ canal: semConsent, nivel: "responde_qualquer_um", papel: "owner" });
  assert.ok(p.consentimento);
  // mas VOLTAR ao estrito nunca é bloqueado por consentimento: apertar o filtro é sempre seguro.
  assert.equal(
    validarTrocaNivel({ canal: semConsent, nivel: "estrito", papel: "owner" }).consentimento,
    undefined,
  );
});

test("D70 · nível fora do domínio é recusado antes de chegar ao banco", () => {
  const p = validarTrocaNivel({
    canal: litePronto,
    nivel: "livre" as unknown as NivelCanal,
    papel: "owner",
  });
  assert.ok(p.nivel);
});

test("D70 · troca válida não tem problema nenhum", () => {
  assert.ok(semProblemas(validarTrocaNivel({ canal: litePronto, nivel: "aberto", papel: "admin" })));
});

// ─────────────── o payload, e a guarda antissegredo por cima dele ───────────────

test("D70 · payload leva canal_id e nivel; motivo só quando existe", () => {
  assert.deepEqual(payloadNivelCanal("lite:jade", "aberto"), {
    canal_id: "lite:jade",
    nivel: "aberto",
  });
  assert.deepEqual(payloadNivelCanal("lite:jade", "estrito", "   "), {
    canal_id: "lite:jade",
    nivel: "estrito",
  });
  assert.deepEqual(payloadNivelCanal("lite:jade", "estrito", " voltou ao padrão "), {
    canal_id: "lite:jade",
    nivel: "estrito",
    motivo: "voltou ao padrão",
  });
});

test("D70 · o payload de nível passa pela guarda antissegredo (nada com cara de token)", () => {
  const r = envelopeCanal(
    "canal_atualizado",
    "id-externo",
    payloadNivelCanal("lite:jade", "aberto", "decisão da gestão"),
  );
  assert.equal(r.ok, true);
});

// ─────────────── os TRÊS estados de leitura, não dois ───────────────

test("D70 · a tela distingue 'não li' de 'ninguém declarou' de 'declarado'", () => {
  // 1. coluna ausente nesta base: `nivelLegivel` (da leitura) é false e o canal vem sem nível.
  const naoLido = canal({ nivel: null, nivel_declarado: false });
  assert.equal(nivelDoCanal(naoLido), "estrito");
  assert.equal(naoLido.nivel_declarado, false);

  // 2. coluna lida, ninguém declarou: MESMO comportamento, significado oposto para quem opera.
  const nuncaDeclarado = canal({ nivel: "estrito", nivel_declarado: false });
  assert.equal(nivelDoCanal(nuncaDeclarado), "estrito");
  assert.equal(nuncaDeclarado.nivel_declarado, false);

  // 3. declarado como estrito: alguém escolheu, e a escolha é visível.
  const declarado = canal({ nivel: "estrito", nivel_declarado: true });
  assert.equal(nivelDoCanal(declarado), "estrito");
  assert.equal(declarado.nivel_declarado, true);

  // os estados 2 e 3 têm o mesmo nível vigente — colapsá-los é o erro que a flag existe para evitar.
  assert.equal(nivelDoCanal(nuncaDeclarado), nivelDoCanal(declarado));
  assert.notEqual(nuncaDeclarado.nivel_declarado, declarado.nivel_declarado);
});

/*
 * ── DE QUEM É O NÚMERO (14/09) ─────────────────────────────────────────────────────────────────
 *
 * Achado testando o fluxo no navegador, contra produção: clicar "Registrar número" com o provedor
 * não oficial devolvia, numa faixa vermelha no TOPO da página, longe do botão:
 *
 *   payload.responsavel_id obrigatorio em canal_registrado de provedor nao_oficial: o numero e de
 *   uma pessoa, e canal sem dono nao tem quem pareie, quem responda nem de quem cobrar o
 *   consentimento
 *
 * A porta sempre exigiu o dono. O formulário nunca teve o campo. **O cadastro de número não
 * oficial nunca funcionou em produção** — e a tela não dizia isso, dizia uma mensagem de banco.
 */

test("não oficial SEM dono é recusado no formulário, antes de escrever", () => {
  const p = validarRegistroCanal(form({ provedor: "nao_oficial", responsavelId: "" }));
  assert.ok(p.responsavelId, "o formulário aceita número pessoal sem dono");
  assert.match(p.responsavelId!, /de quem é o número/i);
});

test("oficial SEM dono passa — o número é da empresa, não de uma pessoa", () => {
  const p = validarRegistroCanal(
    form({ provedor: "waba", canalId: "627327023793464", nome: "Produção", responsavelId: "", wabaId: "9" }),
  );
  assert.equal(p.responsavelId, undefined);
});

test("o dono chega ao payload com a chave que a porta espera", () => {
  // `responsavel_id`, snake_case — o nome que a mensagem de recusa da porta cita textualmente.
  const { payload } = payloadCanalRegistrado(form({ provedor: "nao_oficial", responsavelId: "abc-123" }));
  assert.equal(payload.responsavel_id, "abc-123");
});

/*
 * ── O CONSENTIMENTO, no degrau em que ele decide (14/09) ───────────────────────────────────────
 * Ele saiu do PAREAMENTO e ficou aqui, no LIGAR. Não é afrouxamento: é a trava no lugar em que o
 * banco também a cobra — `api.registrar_evento` recusa `canal_ativado` de canal não oficial sem
 * `consentimento_em` (ARB-16), e o CHECK da tabela diz o mesmo:
 *
 *     CHECK (provedor <> 'nao_oficial' OR ativo IS NOT TRUE OR consentimento_em IS NOT NULL)
 *
 * Parear não põe nada em movimento: o canal nasce desligado e nada entra nem sai. O ban que
 * ameaça o WhatsApp pessoal dela vem do USO, e é o USO que esta guarda impede.
 */

test("🔴 LIGAR canal não oficial sem consentimento é recusado — e o motivo diz que o banco também recusa", () => {
  const p = validarAtivacao({
    papel: "admin",
    canal: canal({ provedor: "nao_oficial", consentimento_em: null }),
    inboxDesde: "2026-09-14T00:00:00Z",
  });
  assert.ok(p.consentimento, "o canal liga sem o consentimento da titular");
  assert.match(p.consentimento!, /consentimento/i);
  // a frase nomeia que a recusa não é só da tela — quem tentar pela API leva a mesma
  assert.match(p.consentimento!, /banco/i);
});

test("com consentimento registrado, ligar passa", () => {
  const p = validarAtivacao({
    papel: "admin",
    canal: canal({ provedor: "nao_oficial", consentimento_em: "2026-09-14T00:00:00Z" }),
    inboxDesde: "2026-09-14T00:00:00Z",
  });
  assert.equal(p.consentimento, undefined);
});

test("o canal OFICIAL liga sem consentimento — o número é da empresa", () => {
  const p = validarAtivacao({
    papel: "admin",
    canal: canal({ provedor: "waba", consentimento_em: null }),
    inboxDesde: "2026-09-14T00:00:00Z",
  });
  assert.equal(p.consentimento, undefined);
});
