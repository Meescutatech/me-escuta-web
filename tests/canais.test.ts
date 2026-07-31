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
  ehFaixaTesteMeta,
  finalidadeValida,
  rotuloFinalidade,
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
  });
});

test("INVARIANTE · campo em branco NÃO vira chave no payload — inclusive finalidade", () => {
  // A proteção que a régua acima poderia ter apagado. Chave vazia num ledger append-only fica
  // para sempre, e `finalidade: \"\"` seria recusado pelo CHECK de domínio no melhor caso e
  // gravado como lixo no pior.
  const { payload } = payloadCanalRegistrado(
    form({ nome: "Jade", provedor: "nao_oficial", numeroE164: "", wabaId: "", area: "", finalidade: "" }),
  );
  assert.deepEqual(Object.keys(payload).sort(), ["canal_id", "nome", "provedor"]);
  assert.equal("finalidade" in payload, false);
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
    finalidade: "teste",
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
  // A régua mudou porque a DEFINIÇÃO mudou (ARB-R18-05: `finalidade` entrou e nunca some). O que
  // este teste protegia — "valor único vira ruído e sai" — continua protegido nas duas colunas em
  // que ele vale, e o invariante que a mudança poderia ter apagado está logo abaixo, nomeado.
  assert.deepEqual(cols, { provedor: false, area: false, finalidade: true, consentimento: false });
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
  // Inclusive `finalidade`: "sempre visível" é sobre linha existente. Cabeçalho de coluna sobre
  // zero linhas não é alarme, é moldura vazia.
  assert.deepEqual(colunasVisiveis([]), {
    provedor: false,
    area: false,
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
