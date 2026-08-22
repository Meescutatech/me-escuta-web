import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparPorAgente,
  extrairDetalhes,
  extrairTexto,
  motivoBloqueio,
  rotuloAgente,
} from "../lib/fila/calculos.ts";
import { higienizar } from "../lib/mensagem-erro.ts";

/*
 * FILA DE VALIDAÇÃO — os cálculos que decidem o que a Sarah vê antes de clicar.
 *
 * Escrito em 22/08 porque a tela da fila nasceu com 1.042 linhas e nenhum teste, numa rota em que
 * aprovar errado manda mensagem ao paciente. Tudo aqui é função pura: nenhum teste toca o banco.
 *
 * Os números citados são MEDIDOS em produção em 22/08 (405 propostas pendentes, 124 sem texto,
 * 405 fora da janela de frescor). Eles explicam por que cada caso existe; não são enfeite.
 */

const HORA = 3_600_000;
const AGORA = Date.parse("2026-08-22T12:00:00.000Z");
const QUARENTA_E_OITO = 48;

// ═══════════ (a) onde mora o texto da proposta ═══════════
//
// O bug: a tela lia SÓ `payload.corpo`. Das 7 sugestões de uma amostra, 5 renderizavam em branco,
// e a única com conteúdo de sobra — 38.047 caracteres em `prompt_novo` — aparecia como "o agente
// não escreveu nada". Se alguém reverter `CHAVES_TEXTO_POR_TIPO` para ler só `corpo`, o primeiro
// teste deste bloco cai.

test("extrairTexto devolve o prompt_novo em atualizar_prompt (a chave não é `corpo`)", () => {
  const payload = { agente_alvo: "clara", prompt_novo: "Você é a Clara. Atenda em PT-BR." };
  assert.equal(extrairTexto("atualizar_prompt", payload), "Você é a Clara. Atenda em PT-BR.");
});

test("extrairTexto devolve string vazia quando o payload não tem texto nenhum", () => {
  assert.equal(extrairTexto("atualizar_prompt", { agente_alvo: "clara" }), "");
  assert.equal(extrairTexto("enviar_mensagem", {}), "");
  assert.equal(extrairTexto("enviar_mensagem", { corpo: "" }), "");
  // só espaço em branco é vazio: aprovar isto mandaria uma mensagem em branco ao paciente
  assert.equal(extrairTexto("enviar_mensagem", { corpo: "   \n\t " }), "");
});

test("extrairTexto lê `corpo` nas mensagens e cai em `texto` quando `corpo` falta", () => {
  assert.equal(extrairTexto("enviar_mensagem", { corpo: "Bom dia!" }), "Bom dia!");
  assert.equal(extrairTexto("enviar_mensagem_humana", { texto: "Confirmado." }), "Confirmado.");
  // `corpo` tem precedência sobre `texto` — a ordem da lista é contrato, não acaso
  assert.equal(extrairTexto("enviar_mensagem", { corpo: "A", texto: "B" }), "A");
});

test("extrairTexto de um tipo desconhecido não explode: cai no par padrão", () => {
  assert.equal(extrairTexto("tipo_que_ninguem_mapeou", { corpo: "oi" }), "oi");
  assert.equal(extrairTexto("tipo_que_ninguem_mapeou", { prompt_novo: "x" }), "");
});

test("extrairTexto ignora valor que não é string (número no lugar do texto não vira texto)", () => {
  assert.equal(extrairTexto("enviar_mensagem", { corpo: 42 as unknown as string }), "");
  assert.equal(extrairTexto("enviar_mensagem", { corpo: null, texto: "sobrou" }), "sobrou");
});

// ═══════════ (b) agrupamento por agente ═══════════
//
// O número da barra de filtros é sobre TODAS as pendentes, não sobre a página. Ordem: maior fila
// primeiro (é por onde se começa) e, no empate, alfabética pt-BR — para a barra não trocar de
// ordem entre dois carregamentos com os mesmos números.

const ROTULOS = { clara: "Clara", jarvis: "Jarvis", levindo: "Levindo" };

test("agrupa sugestões de agentes diferentes e ordena da maior fila para a menor", () => {
  const linhas = [
    { agente: "clara" },
    { agente: "jarvis" },
    { agente: "clara" },
    { agente: "levindo" },
    { agente: "clara" },
    { agente: "jarvis" },
  ];
  assert.deepEqual(agruparPorAgente(linhas, ROTULOS), [
    { agente: "clara", rotulo: "Clara", qtd: 3 },
    { agente: "jarvis", rotulo: "Jarvis", qtd: 2 },
    { agente: "levindo", rotulo: "Levindo", qtd: 1 },
  ]);
});

test("empate desempata pelo rótulo em pt-BR, não pela ordem de chegada", () => {
  const linhas = [{ agente: "levindo" }, { agente: "clara" }, { agente: "jarvis" }];
  assert.deepEqual(
    agruparPorAgente(linhas, ROTULOS).map((a) => a.agente),
    ["clara", "jarvis", "levindo"],
  );
});

test("agente ausente ou em branco vira `(sem agente)` em vez de sumir da conta", () => {
  const linhas = [{ agente: "clara" }, { agente: "  " }, {}, { agente: null }];
  const r = agruparPorAgente(linhas as Array<{ agente?: unknown }>, ROTULOS);
  const semAgente = r.find((a) => a.agente === "(sem agente)");
  assert.equal(semAgente?.qtd, 3, "as três sem agente têm de aparecer somadas, não desaparecer");
  assert.equal(r.reduce((s, a) => s + a.qtd, 0), 4, "a soma dos chips = total lido");
});

test("fila vazia agrupa em lista vazia (a barra de filtros some, não quebra)", () => {
  assert.deepEqual(agruparPorAgente([], ROTULOS), []);
});

test("agente sem rótulo cadastrado cai no slug capitalizado — a fila não para por falta de nome", () => {
  assert.equal(rotuloAgente("priscila", ROTULOS), "Priscila");
  assert.equal(rotuloAgente("clara", ROTULOS), "Clara");
});

// ═══════════ (c) o sanitizador da mensagem de erro ═══════════
//
// A tela de quem opera não é lugar de nome de função nem de tabela. Vale para a fila e para o
// botão de audiometria — por isso o `higienizar` vive em `lib/`, não dentro de uma rota.

test("higienizar tira nome de função qualificado por esquema", () => {
  const bruto = 'function api.validar_sugestao(uuid, text, jsonb) does not exist';
  const limpo = higienizar(bruto);
  assert.ok(!limpo.includes("api.validar_sugestao"), `vazou nome de função: ${limpo}`);
  assert.ok(!limpo.includes("validar_sugestao"), `vazou nome de função: ${limpo}`);
  assert.ok(limpo.includes("sistema"));
});

test("higienizar tira nome de tabela qualificado por esquema", () => {
  const limpo = higienizar('permission denied for table core.sugestao_ia');
  assert.ok(!limpo.includes("core.sugestao_ia"), `vazou nome de tabela: ${limpo}`);
  assert.ok(!limpo.includes("sugestao_ia"), `vazou nome de tabela: ${limpo}`);
});

test("higienizar limpa o erro real que o botão de audiometria imprimia para a Sarah", () => {
  const bruto = 'RPC failed: function api.registrar_evento(jsonb) does not exist';
  const limpo = higienizar(bruto);
  assert.ok(!limpo.includes("registrar_evento"), `vazou nome de função: ${limpo}`);
  assert.ok(!/\bRPC\b/.test(limpo), `vazou a sigla do protocolo: ${limpo}`);
  assert.ok(!/[a-z_]+\.[a-z_]+/i.test(limpo), `sobrou identificador qualificado: ${limpo}`);
});

test("higienizar aguenta entrada vazia/ausente sem explodir", () => {
  assert.equal(higienizar(""), "");
  assert.equal(higienizar(undefined as unknown as string), "");
  assert.equal(higienizar("  proposta vencida  "), "proposta vencida");
});

// ═══════════ (d) quem NÃO pode ser aprovado — a manchete que estava invertida ═══════════
//
// O bloco inteiro do `motivoBloqueio` vivia dentro de `if (TIPOS_COM_VALIDADE.has(tipo))`. Efeito:
// proposta de `atualizar_prompt` SEM TEXTO saía liberada, o cartão dizia "o agente não escreveu
// nada" e oferecia "Aprovar e enviar" logo abaixo — e a porta (migration 0106, ramo
// `atualizar_prompt`) recusa exatamente esse caso. Estes testes prendem os DOIS alcances.

test("sem texto bloqueia TAMBÉM o tipo que não tem validade (era o caso invertido)", () => {
  const r = motivoBloqueio("atualizar_prompt", "", "2026-08-22T11:00:00.000Z", QUARENTA_E_OITO, AGORA);
  assert.equal(r.bloqueioTipo, "sem_texto");
  assert.ok(r.bloqueio, "sem bloqueio = o botão Aprovar reaparece em proposta sem conteúdo");
  // e a frase não pode falar em "enviar": atualizar_prompt não sai para paciente nenhum
  assert.ok(!/enviar/i.test(r.bloqueio!), `frase de mensagem em tipo que não é mensagem: ${r.bloqueio}`);
});

test("sem texto bloqueia a mensagem, com a frase de quem envia", () => {
  const r = motivoBloqueio("enviar_mensagem", "   ", "2026-08-22T11:00:00.000Z", QUARENTA_E_OITO, AGORA);
  assert.equal(r.bloqueioTipo, "sem_texto");
  assert.match(r.bloqueio!, /mensagem para enviar/);
});

test("a VALIDADE continua valendo só para os tipos de mensagem — o mesmo recorte da porta", () => {
  const velha = new Date(AGORA - 800 * HORA).toISOString();
  assert.equal(
    motivoBloqueio("enviar_mensagem", "Bom dia!", velha, QUARENTA_E_OITO, AGORA).bloqueioTipo,
    "vencida",
  );
  // 38 mil caracteres escritos em julho continuam aplicáveis: prompt não envelhece como conversa
  assert.equal(
    motivoBloqueio("atualizar_prompt", "prompt inteiro", velha, QUARENTA_E_OITO, AGORA).bloqueioTipo,
    null,
  );
});

test("mensagem dentro da janela passa; um minuto além do limite, não", () => {
  const dentro = new Date(AGORA - 47 * HORA).toISOString();
  assert.equal(motivoBloqueio("enviar_mensagem", "oi", dentro, QUARENTA_E_OITO, AGORA).bloqueio, null);
  const fora = new Date(AGORA - (48 * HORA + 60_000)).toISOString();
  assert.equal(motivoBloqueio("enviar_mensagem", "oi", fora, QUARENTA_E_OITO, AGORA).bloqueioTipo, "vencida");
});

test("a janela é CONFIG: mudar as horas muda quem bloqueia, sem tocar em código", () => {
  const criado = new Date(AGORA - 100 * HORA).toISOString();
  assert.equal(motivoBloqueio("enviar_mensagem", "oi", criado, 48, AGORA).bloqueioTipo, "vencida");
  assert.equal(motivoBloqueio("enviar_mensagem", "oi", criado, 240, AGORA).bloqueio, null);
});

test("data ilegível não inventa bloqueio de validade — só o vazio bloqueia", () => {
  assert.equal(motivoBloqueio("enviar_mensagem", "oi", "data-que-nao-parseia", QUARENTA_E_OITO, AGORA).bloqueio, null);
});

test("a idade vira dias a partir de 2 dias e horas abaixo disso", () => {
  const tresDias = new Date(AGORA - 74 * HORA).toISOString();
  assert.match(motivoBloqueio("enviar_mensagem", "oi", tresDias, QUARENTA_E_OITO, AGORA).bloqueio!, /3 dias/);
  const cinquentaH = new Date(AGORA - 50 * HORA).toISOString();
  assert.match(motivoBloqueio("enviar_mensagem", "oi", cinquentaH, 24, AGORA).bloqueio!, /2 dias/);
  const trintaH = new Date(AGORA - 30 * HORA).toISOString();
  assert.match(motivoBloqueio("enviar_mensagem", "oi", trintaH, 24, AGORA).bloqueio!, /30 horas/);
});

// ═══════════ detalhes do payload — o que o cartão mostra além do texto ═══════════

test("extrairDetalhes traz só os campos com rótulo, e corta valor gigante", () => {
  const d = extrairDetalhes({
    justificativa: "o prompt não cobre objeção de preço",
    agente_alvo: "clara",
    telemetria_interna: "não deve aparecer",
    proposto_por: "",
  });
  assert.deepEqual(d, [
    { rotulo: "Por quê", valor: "o prompt não cobre objeção de preço" },
    { rotulo: "Agente afetado", valor: "clara" },
  ]);
  const longo = extrairDetalhes({ justificativa: "x".repeat(900) })[0];
  assert.equal(longo.valor.length, 401, "corta em 400 + reticência");
  assert.ok(longo.valor.endsWith("…"));
});
