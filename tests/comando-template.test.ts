import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMANDOS, ehComandoTemplate, menuComandos } from "../lib/conversas/composer-modo.ts";
import type { TemplateHsmNoChat } from "../lib/conversas/template-hsm.ts";
import type { TemplateMensagem } from "../lib/templates.ts";

/*
 * `/template` É COMANDO — reportado em produção, 21/09/2026.
 *
 * Quem digitou `/template` no composer viu o menu não abrir e reportou "o /template não está
 * funcionando". Estava certo do jeito que importa: não existia comando nenhum com esse nome. O
 * menu tinha `/nota`, `/tarefa` e depois UM comando por template, cada um pelo próprio nome — e
 * nenhum dos 330 HSM se chama "template". Digitar a palavra que nomeia a coisa não achava a coisa.
 *
 * MEDIDO no mesmo dia, em `core.template_whatsapp`: 322 aprovados no canal `627327023793464`
 * (CLARA), 2 no `608866985643828` (teste_meta), e ZERO em qualquer canal `lite:*` — HSM é objeto
 * da Meta, canal não oficial não tem. A conversa do relato era Lite, então ali o menu nunca teria
 * template, digitasse o que digitasse. Por isso a lista vazia precisa DIZER isso: silêncio foi o
 * que fez a pessoa concluir que a tela estava quebrada.
 */

const HSM_A: TemplateHsmNoChat = {
  id: "hsm-1", nome: "ola_nome", corpo: "Olá {{1}}, aqui é a Sara!", exemplos: ["Maria"], categoria: "UTILITY",
};
const HSM_B: TemplateHsmNoChat = {
  id: "hsm-2", nome: "convite_consulta", corpo: "Vamos agendar sua consulta?", exemplos: [], categoria: "MARKETING",
};

const TPL: TemplateMensagem = {
  id: "tpl-1", titulo: "Boas-vindas", atalho: "boas_vindas", corpo: "Oi!",
  ativo: true, autor_id: null, atualizado_em: null, arquivado_em: null, motivo_arquivo: null,
};

test("/template lista TODOS os HSM do canal, e não só o que casa por nome", () => {
  const menu = menuComandos("/template", [], [HSM_A, HSM_B]);
  // a ORDEM é a de `legivelPrimeiro` (nome legível antes de UUID, depois alfabético) — regra que
  // já existia e não é deste conserto; o que se prova aqui é que os DOIS vêm, sem casar por nome.
  assert.deepEqual(menu.map((c) => c.comando), ["/convite_consulta", "/ola_nome"]);
  assert.ok(menu.every((c) => c.acao === "template_hsm"));
});

test("prefixo de `template` a partir de 3 letras abre a lista — ninguém termina de digitar", () => {
  for (const digitado of ["/tem", "/temp", "/templ", "/template"]) {
    const nomes = menuComandos(digitado, [], [HSM_A, HSM_B]).map((c) => c.comando);
    assert.ok(nomes.includes("/ola_nome"), `${digitado} não abriu a lista de HSM`);
  }
});

/**
 * O CORTE EM 3 LETRAS não é estética — é a colisão com `/tarefa`.
 *
 * `t` e `te` são prefixo de "template" E caminho de quem está indo digitar `/tarefa`. Se o alias
 * disparasse ali, quem quer abrir uma tarefa veria a lista inteira de HSM na cara, e — pior — num
 * canal Lite veria o aviso "este número não tem template aprovado" antes de terminar a palavra.
 * A partir de `tem` a intenção deixa de ser ambígua: nenhum comando fixo passa por aí.
 */
test("`/t` e `/te` NÃO disparam o alias — é o caminho de quem vai digitar /tarefa", () => {
  assert.deepEqual(menuComandos("/t", [], [HSM_A]).map((c) => c.comando), ["/tarefa"]);
  assert.deepEqual(menuComandos("/te", [], [HSM_A]).map((c) => c.comando), []);
  assert.equal(ehComandoTemplate("/t"), false);
  assert.equal(ehComandoTemplate("/te"), false);
});

test("canal SEM HSM: a lista é vazia, e `ehComandoTemplate` avisa que era pedido de template", () => {
  // é o caso do relato: conversa em canal Lite, que nunca tem HSM aprovado.
  assert.deepEqual(menuComandos("/template", [], []), []);
  assert.equal(ehComandoTemplate("/template"), true, "a tela não tem como explicar o vazio");
});

test("`ehComandoTemplate` só vale para o pedido de template — não para frase, nota nem tarefa", () => {
  assert.equal(ehComandoTemplate("/nota"), false);
  assert.equal(ehComandoTemplate("/tarefa"), false);
  assert.equal(ehComandoTemplate("confirmar em 23/07"), false);
  assert.equal(ehComandoTemplate("/07 já respondi"), false);
  assert.equal(ehComandoTemplate("/xyz"), false);
});

// ═══════════ REGRESSÃO — o menu de antes não pode mudar ═══════════

test("REGRESSÃO barra sozinha: comandos fixos, depois mensagem pronta, depois HSM", () => {
  const nomes = menuComandos("/", [TPL], [HSM_A]).map((c) => c.comando);
  assert.deepEqual(nomes, ["/nota", "/tarefa", "/boas_vindas", "/ola_nome"]);
});

test("REGRESSÃO barra sozinha sem nada: só os dois fixos", () => {
  assert.deepEqual(menuComandos("/"), COMANDOS);
});

test("REGRESSÃO `/no` continua só nota, e `/xyz` continua fechando o menu", () => {
  assert.deepEqual(menuComandos("/no", [TPL], [HSM_A]).map((c) => c.comando), ["/nota"]);
  assert.deepEqual(menuComandos("/xyz", [TPL], [HSM_A]), []);
});

test("REGRESSÃO busca por trecho do corpo do HSM segue funcionando", () => {
  assert.deepEqual(menuComandos("/agendar", [], [HSM_A, HSM_B]).map((c) => c.comando), ["/convite_consulta"]);
});

// ═══════════ A CADEIA — o canal escolhido tem de CHEGAR na lista de templates ═══════════
/*
 * Mesma fronteira que mordeu em 15/09 (`envio-por-canal.test.ts`): o seletor "Enviando por X ▾"
 * existia e não atravessava. Aqui é a lista de HSM. Um teste sobre `menuComandos` passa verdinho
 * com o inbox continuando a buscar templates do canal ERRADO — porque o que falta não é uma conta,
 * é um parâmetro que não existe. Por isso estas asserções são sobre o texto-fonte.
 */

const composer = readFileSync(new URL("../components/conversas/composer.tsx", import.meta.url), "utf8");
const inbox = readFileSync(new URL("../components/conversas/inbox.tsx", import.meta.url), "utf8");

test("o composer AVISA o canal efetivo para fora", () => {
  assert.match(composer, /onCanalEscolhido\?:\s*\(canalId: string \| null\) => void/, "a prop não existe");
  assert.match(composer, /onCanalEscolhido\?\.\(canalEfetivoId\)/, "a prop existe mas nunca é chamada");
});

test("o inbox busca e passa os HSM do canal ESCOLHIDO, não do canal da conversa", () => {
  assert.match(inbox, /templatesHsm=\{canalDosTemplates \? \(hsmPorCanal\[canalDosTemplates\] \?\? \[\]\) : \[\]\}/);
  assert.match(inbox, /onCanalEscolhido=\{setCanalEscolhidoComposer\}/, "o inbox não escuta a troca");
  assert.match(inbox, /lerTemplatesDoCanal\(canalDosTemplates\)/, "a busca continua no canal da conversa");
  assert.ok(
    !/templatesHsm=\{canalDaConversa/.test(inbox),
    "sobrou a ligação antiga: a lista voltaria a ser a do canal da conversa",
  );
});

test("o menu recalcula quando a lista de HSM TROCA — `templatesHsm` nas dependências", () => {
  // sem isto a troca de número mostraria a lista do número anterior: pior que lista vazia, porque
  // a atendente escolheria um template que a porta vai recusar por ser de outro canal.
  assert.match(composer, /\[modo, podeComandar, anexo, rascunho, templates, templatesHsm\]/);
});

test("pedir template sem nenhum no canal RENDERIZA um aviso — a tela não pode ficar muda", () => {
  // `\b` no fim: sem ele, renomear para `pediuTemplateSemNenhumX` deixava este teste VERDE —
  // medido por mutação em 21/09, no mesmo dia em que uma guarda de enfeite já tinha custado caro.
  assert.match(composer, /const pediuTemplateSemNenhum\b/, "não há estado para o vazio");
  assert.match(composer, /\{pediuTemplateSemNenhum && \(/, "o estado existe mas nada renderiza");
  assert.match(composer, /ehComandoTemplate\(rascunho\)/);
  assert.match(composer, /não tem template\s*\n?\s*aprovado/, "o aviso não diz o que houve");
  assert.match(composer, /Troque o número em “Enviando por”/, "o aviso não diz o que fazer");
});
