import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarTemplate,
  exemploEhPrimeiroNome,
  filtrarHsm,
  motivoFaltando,
  posicoesDe,
  type TemplateHsmNoChat,
} from "../lib/conversas/template-hsm.ts";

/*
 * TEMPLATE HSM NO CHAT — o núcleo puro.
 *
 * Os casos abaixo não são inventados: são os templates REAIS da WABA de produção, lidos em 14/09.
 * O preenchimento automático só é defensável porque a regra saiu da medição — dos 96 templates de
 * uma variável, 72 têm exemplo de nome próprio, 15 têm parentesco ("mãe", "pai", "avó", "tia",
 * "esposo") e 5 têm cidade. Preencher os 15 de parentesco com o nome da paciente escreveria
 * "Oi, Maria!" onde o texto pede "Oi, mãe!" — o sistema inventando um vínculo que não existe.
 */

const t = (p: Partial<TemplateHsmNoChat> = {}): TemplateHsmNoChat => ({
  id: "t1",
  nome: "faltou_consulta",
  corpo: "Oi, {{1}}! Sentimos a sua falta na consulta.",
  exemplos: ["Maria"],
  categoria: "UTILITY",
  ...p,
});

test("posições saem na ordem, sem repetir, e tolerando espaço dentro das chaves", () => {
  assert.deepEqual(posicoesDe("Oi {{1}}, dia {{2}} — confirma, {{1}}?"), [1, 2]);
  assert.deepEqual(posicoesDe("Oi {{ 1 }}"), [1]);
  assert.deepEqual(posicoesDe("sem variável nenhuma"), []);
  // 197 dos 318 caem aqui, e é o caminho mais usado: nada a preencher
  assert.deepEqual(armarTemplate(t({ corpo: "Bom dia!" }), { primeiroNome: "Maria" }).faltando, []);
});

test("exemplo de NOME PRÓPRIO é reconhecido; parentesco e cidade não", () => {
  for (const bom of ["Maria", "Luis", "Sara", "Zuleica", "Ângela"]) {
    assert.equal(exemploEhPrimeiroNome(bom), true, bom);
  }
  // os 15 de parentesco e os 5 de cidade que existem hoje em produção
  for (const nao of ["mãe", "pai", "avó", "tia", "esposo", "Belo Horizonte", "Diogo Vidigal da Fonseca", "", undefined]) {
    assert.equal(exemploEhPrimeiroNome(nao), false, String(nao));
  }
});

test("o primeiro nome entra quando o exemplo é nome — e o texto fica pronto para ler", () => {
  const a = armarTemplate(t(), { primeiroNome: "Ana" });
  assert.equal(a.texto, "Oi, Ana! Sentimos a sua falta na consulta.");
  assert.deepEqual(a.parametros, ["Ana"]);
  assert.deepEqual(a.faltando, []);
});

test("🔴 template de PARENTESCO não recebe o nome da paciente — a lacuna fica visível", () => {
  // "Oi, mãe!" virando "Oi, Maria!" é o sistema afirmando um vínculo que ninguém disse existir.
  const a = armarTemplate(t({ corpo: "Oi, {{1}}! Como está a adaptação?", exemplos: ["mãe"] }), { primeiroNome: "Maria" });
  assert.equal(a.texto, "Oi, {{1}}! Como está a adaptação?");
  assert.deepEqual(a.parametros, [""]);
  assert.deepEqual(a.faltando, [1]);
});

test("sem saber o nome, nada é preenchido — e isso não é falha, é o estado", () => {
  const a = armarTemplate(t(), {});
  assert.deepEqual(a.faltando, [1]);
  assert.deepEqual(a.parametros, [""]);
});

test("parâmetros são POSICIONAIS e contíguos — buraco desloca tudo", () => {
  // A Meta lê por posição. Se o array pulasse a lacuna, o valor de {{2}} chegaria como {{1}} e a
  // mensagem sairia com a data no lugar do nome.
  const a = armarTemplate(
    t({ corpo: "Oi {{1}}, sua consulta é {{2}}.", exemplos: ["Maria", "12/09"] }),
    { primeiroNome: "Ana" },
  );
  assert.deepEqual(a.parametros, ["Ana", ""]);
  assert.deepEqual(a.faltando, [2]);
  assert.equal(a.texto, "Oi Ana, sua consulta é {{2}}.");
});

test("a busca casa por prefixo do nome e por trecho do corpo", () => {
  const lista = [
    t({ id: "a", nome: "retorno_avaliacao", corpo: "Oi {{1}}, sobre sua avaliação" }),
    t({ id: "b", nome: "lembrete_consulta", corpo: "Sua consulta é amanhã" }),
    t({ id: "c", nome: "orcamento_enviado", corpo: "Mandamos o retorno do orçamento" }),
  ];
  assert.deepEqual(filtrarHsm(lista, "retorno").map((x) => x.id), ["a", "c"]);
  assert.deepEqual(filtrarHsm(lista, "AVALIA").map((x) => x.id), ["a"]);
  assert.deepEqual(filtrarHsm(lista, "orçamento").map((x) => x.id), ["c"], "acento não pode separar");
});

test("a lista NUNCA devolve os 317 — rolar tudo no meio de uma conversa é pior que não ter", () => {
  const muitos = Array.from({ length: 317 }, (_, i) => t({ id: String(i), nome: `modelo_${i}` }));
  assert.equal(filtrarHsm(muitos, "").length, 6);
  assert.equal(filtrarHsm(muitos, "modelo").length, 6);
  assert.equal(filtrarHsm(muitos, "", 3).length, 3);
});

test("o motivo da trava nomeia QUAIS lacunas — não diz apenas que falta algo", () => {
  assert.equal(motivoFaltando([]), "");
  assert.match(motivoFaltando([2]), /\{\{2\}\}/);
  assert.match(motivoFaltando([1, 3]), /\{\{1\}\}, \{\{3\}\}/);
});

/*
 * ── A COSTURA: o menu, o efeito e a trava ──────────────────────────────────────────────────────
 * O núcleo acima é puro e já está provado. O que estes asseguram é que ele chegou ao composer sem
 * virar outra coisa no caminho — e que ARMAR continua não sendo ENVIAR (invariante T1).
 */

test("o HSM entra no menu do / como seção PRÓPRIA, depois dos comandos e das mensagens prontas", async () => {
  const { menuComandos } = await import("../lib/conversas/composer-modo.ts");
  const m = menuComandos("/retorno", [], [t({ id: "h1", nome: "retorno_avaliacao" })]);
  assert.equal(m.length, 1);
  assert.equal(m[0].acao, "template_hsm");
  assert.equal(m[0].comando, "/retorno_avaliacao");
});

test("a ordem do menu é a ordem do RISCO: interno, depois de graça, depois o que custa", async () => {
  const { menuComandos } = await import("../lib/conversas/composer-modo.ts");
  const m = menuComandos("/", [], [t({ id: "h1", nome: "nota_fiscal" })]);
  // `/nota` (modo interno) vem antes do template que se parece com ele
  assert.equal(m[0].acao, "modo");
  assert.equal(m[m.length - 1].acao, "template_hsm");
});

test("escolher um HSM ARMA — e armar não é enviar (T1)", async () => {
  const { efeitoDoComando } = await import("../lib/conversas/composer-modo.ts");
  const efeito = efeitoDoComando(
    { acao: "template_hsm", template: t(), comando: "/faltou_consulta", explicacao: "" },
    {},
    { primeiroNome: "Ana" },
  );
  assert.equal(efeito.tipo, "armar_template_hsm");
  if (efeito.tipo !== "armar_template_hsm") return;
  // o efeito carrega o ID e os PARÂMETROS — não um texto para mandar como mensagem comum
  assert.equal(efeito.templateId, "t1");
  assert.deepEqual(efeito.parametros, ["Ana"]);
  assert.deepEqual(efeito.faltando, []);
  assert.equal(efeito.texto, "Oi, Ana! Sentimos a sua falta na consulta.");
});

test("o efeito do HSM é `armar`, NUNCA `inserir_rascunho` — os dois caminhos de envio são outros", async () => {
  const { efeitoDoComando } = await import("../lib/conversas/composer-modo.ts");
  const efeito = efeitoDoComando(
    { acao: "template_hsm", template: t({ exemplos: ["mãe"] }), comando: "/x", explicacao: "" },
    {},
    { primeiroNome: "Ana" },
  );
  // se virasse `inserir_rascunho`, o texto sairia como MENSAGEM COMUM — e a Meta recusa fora da
  // janela de 24h, que é exatamente quando o template existe para servir
  assert.notEqual(efeito.tipo, "inserir_rascunho");
  if (efeito.tipo !== "armar_template_hsm") return;
  assert.deepEqual(efeito.faltando, [1], "parentesco não recebe o nome da paciente");
});
