import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * 15/09/2026 — OS FIOS IRMÃOS NA TELA DE CONVERSAS.
 *
 * Pedido do COO, com print do Kommo: *"mesma página em threads diferentes"*. Eu li "tela do lead" e
 * construí no drawer do funil (1b, `5f4c0c0`). O teste dele é `/conversas?c=23084abc…`. Escopo
 * errado, erro meu — esta é a correção, no lugar certo.
 *
 * ⚠️ ESTE ARQUIVO FOI REESCRITO ANTES DE VIRAR CÓDIGO, E O MOTIVO IMPORTA.
 *
 * A primeira versão exigia `lerFiosIrmaos(` na página — uma ida nova ao banco. Medido depois:
 * `ConversaResumo` (lib/dados/conversas.ts:52-100) JÁ carrega `lead_id`, `previa`, `previa_saida`,
 * `atualizado_em`, `phone_number_id`, `numero_apelido`, `numero_e164` e `finalidade`, e a página já
 * tem a lista inteira em memória. Guarda que exige consulta onde não precisa é guarda que força
 * código pior — então a regra passou a ser: DERIVAR da lista que já existe, sem consulta nova.
 *
 * E a lição do 1b, que este arquivo existe para não repetir: testei ordem e rótulo (regra pura) e
 * contrato (texto-fonte), e a tela mostrava um bloco só — nenhuma camada olhava a MONTAGEM. Aqui a
 * regra pura carrega o comportamento e o texto-fonte cobre só a costura, cada um com mutação.
 */

const MOD = "../lib/conversas/fios-irmaos.ts";
const inbox = readFileSync(new URL("../components/conversas/inbox.tsx", import.meta.url), "utf8");

/** uma linha da lista, como `lerConversas` a entrega */
function linha(p: Record<string, unknown> = {}) {
  return {
    id: "conv-clara",
    lead_id: "lead-1",
    telefone: "+5531900000000",
    phone_number_id: "627327023793464",
    numero_apelido: "CLARA",
    numero_e164: "+15557252751",
    finalidade: "producao",
    atualizado_em: "2026-09-15T14:52:00Z",
    previa: "Quero saber mais",
    previa_saida: false,
    ...p,
  };
}

// ═══════════════════════ a regra: quem são os irmãos ═══════════════════════

test("irmão é conversa do MESMO lead por OUTRO número — a aberta não se repete", async () => {
  const { fiosIrmaos } = await import(MOD);
  const r = fiosIrmaos(
    [
      linha({ id: "conv-clara" }),
      linha({ id: "conv-teste", phone_number_id: "608866985643828", numero_apelido: "teste_meta" }),
    ],
    "conv-clara",
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "conv-teste");
});

test("conversa de OUTRO lead nunca entra — seria mostrar a conversa de outra pessoa", async () => {
  const { fiosIrmaos } = await import(MOD);
  const r = fiosIrmaos(
    [linha({ id: "conv-clara" }), linha({ id: "de-outro", lead_id: "lead-2" })],
    "conv-clara",
  );
  assert.equal(r.length, 0);
});

test("os três fios do mesmo lead: abre um, sobram dois", async () => {
  // o caso real medido em produção (lead 45361ea0: teste_meta · diogo · CLARA)
  const { fiosIrmaos } = await import(MOD);
  const r = fiosIrmaos(
    [
      linha({ id: "a", phone_number_id: "608866985643828", numero_apelido: "teste_meta", atualizado_em: "2026-09-15T16:22:00Z" }),
      linha({ id: "b", phone_number_id: "lite:diogo", numero_apelido: "diogo", atualizado_em: "2026-09-15T15:15:00Z" }),
      linha({ id: "c", atualizado_em: "2026-09-15T14:52:00Z" }),
    ],
    "c",
  );
  assert.deepEqual(r.map((f: { id: string }) => f.id), ["a", "b"]);
});

test("mais recente primeiro — e fio sem data vai para o fim SEM sumir", async () => {
  const { fiosIrmaos } = await import(MOD);
  const r = fiosIrmaos(
    [
      linha({ id: "aberta" }),
      linha({ id: "sem-data", phone_number_id: "x", atualizado_em: null }),
      linha({ id: "nova", phone_number_id: "y", atualizado_em: "2026-09-15T23:00:00Z" }),
    ],
    "aberta",
  );
  assert.deepEqual(r.map((f: { id: string }) => f.id), ["nova", "sem-data"]);
});

test("lead sem outros fios devolve vazio — e é a maioria das conversas", async () => {
  const { fiosIrmaos } = await import(MOD);
  assert.deepEqual(fiosIrmaos([linha({ id: "unica" })], "unica"), []);
});

test("conversa sem lead não inventa parentesco por telefone", async () => {
  // telefone igual e lead ausente NÃO é irmão: sem lead não há prova de que é a mesma pessoa,
  // e errar aqui mostra a conversa de um desconhecido dentro da de outro.
  const { fiosIrmaos } = await import(MOD);
  const r = fiosIrmaos(
    [linha({ id: "aberta", lead_id: null }), linha({ id: "outra", lead_id: null, phone_number_id: "z" })],
    "aberta",
  );
  assert.equal(r.length, 0);
});

// ═══════════════════════ a costura: a tela DESENHA ═══════════════════════

test("o inbox usa a regra — não refaz o filtro na mão", () => {
  assert.match(inbox, /fiosIrmaos\(/, "a regra é uma só; refazer inline faz as guardas acima valerem nada");
});

/**
 * A CONDIÇÃO DE RENDERIZAÇÃO, isolada — e este bloco existe porque a primeira versão FALHOU no
 * teste de mutação: desliguei o desenho com `{false && irmaos.length > 0 && (` e os três testes de
 * costura seguiram verdes, porque `fiosIrmaos(`, `.map(` e `rotuloDoFio(` continuavam no arquivo.
 * O texto não muda quando alguém põe um `false` na frente — a guarda tem de olhar a CONDIÇÃO.
 *
 * Segunda vez na mesma noite que uma guarda minha por texto-fonte passa no estado quebrado (a
 * primeira foi o payload do fio novo, que só virou guarda quando deixou de ser ternário na action e
 * virou função pura). A regra que fica: guarda por texto-fonte precisa ancorar no que muda quando o
 * defeito é introduzido, e a única forma de saber isso é mutar.
 */
/** só o que vem ANTES de `irmaos.length`, dentro da mesma chave de abertura do JSX. */
function guardaAntesDaCondicao(): string {
  const i = inbox.indexOf("irmaos.length > 0");
  assert.notEqual(i, -1, "a condição de render sumiu — este teste precisa ser reescrito");
  const abre = inbox.lastIndexOf("{", i);
  return inbox.slice(abre, i); // ex.: "{"  ·  ou  "{false && " no estado quebrado
}

test("o inbox DESENHA um bloco por irmão — o modo de falha do 1b foi a prop chegar e morrer", () => {
  assert.match(inbox, /irmaos[\s\S]{0,300}\.map\(/);
});

test("o render dos irmãos não está desligado por constante", () => {
  // no estado certo isto é só "{". Qualquer termo antes da contagem é um desligamento disfarçado
  // (`{false && irmaos.length > 0`), e foi assim que a primeira versão desta guarda passou 9/0 com
  // o render inteiro desligado.
  const antes = guardaAntesDaCondicao();
  assert.equal(antes.trim(), "{", `há algo antes da contagem: ${JSON.stringify(antes)}`);
});

test("a condição é a CONTAGEM de irmãos — não uma comparação que nunca é verdadeira", () => {
  // `irmaos.length < 0` nunca é verdade e o bloco some sem ninguém notar. A comparação é parte da
  // guarda, não detalhe de estilo.
  assert.match(inbox, /\{irmaos\.length > 0 && \(/);
});

test("cada bloco diz de qual número é, pelo chip (M7)", () => {
  assert.match(inbox, /rotuloDoFio\(/, "a etiqueta vem da regra do chip, nunca de string solta");
});
