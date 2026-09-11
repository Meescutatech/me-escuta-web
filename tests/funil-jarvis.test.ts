import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./apoio/resolucao-alias.mjs", import.meta.url);

/*
 * Import DINÂMICO, e não estático: `import` de topo é içado e correria ANTES do `register` acima —
 * o hook de alias não estaria de pé, e `lib/dados/funil-jarvis.ts` (que importa `./funil-filtros`
 * sem extensão) derrubaria o processo com ERR_MODULE_NOT_FOUND. Mesmo padrão de
 * `funil-degrau-colunas.test.ts`. O cabeçalho de `tests/apoio/resolucao-alias.mjs` explica por quê.
 */
const { EXEMPLOS_JARVIS, aplicarLeitura, interpretarBusca } = await import("../lib/dados/funil-jarvis.ts");
const { FILTROS_VAZIOS } = await import("../lib/dados/funil-filtros.ts");
const { ETAPAS_PADRAO } = await import("../lib/dados/funil-etapas.ts");

/*
 * A BUSCA DO JARVIS — o teste que o desenho exige.
 *
 * A promessa da tela é: "digitar uma frase acende CHIPS, e os chips são os filtros do board". Um
 * teste de UI não alcança isso; este alcança, porque a interpretação é pura. Ele afirma duas
 * coisas que a tela não pode quebrar sem alguém notar:
 *   1. as frases ANUNCIADAS como exemplo funcionam de verdade (a lista da tela e a do teste são a
 *      MESMA constante — anunciar exemplo que não casa seria a pior mentira possível aqui);
 *   2. frase que ele não entende volta `entendeu: false` e NÃO MEXE em filtro nenhum. Inventar
 *      filtro a partir de palavra solta é exatamente o modo de falha que faria a Sara desconfiar
 *      da tela inteira.
 */

const CIDADES = ["Contagem", "Belo Horizonte", "Betim", "Ribeirão das Neves", "Sabará", "Ibirité", "Nova Lima", "Santa Luzia"];
const CTX = { etapas: ETAPAS_PADRAO, cidadesConhecidas: CIDADES, temUsuario: true };

test("as frases de exemplo da tela são todas interpretadas", () => {
  for (const frase of EXEMPLOS_JARVIS) {
    const r = interpretarBusca(frase, CTX);
    assert.ok(r.entendeu, `não entendeu o exemplo anunciado: "${frase}"`);
    assert.ok(r.termos.length > 0 && r.explicacao.length > 0);
  }
});

test("'quem comprou aparelho e sumiu há mais de 5 dias' → etapa ganho + parado 5+", () => {
  const r = interpretarBusca("quem comprou aparelho e sumiu há mais de 5 dias", CTX);
  assert.deepEqual(r.filtros.etapas, ["ganho"]);
  assert.equal(r.filtros.paradoDiasMin, 5);
});

test("'leads de BH sem tarefa na proposta' → cidade + sem próxima ação + etapa", () => {
  const r = interpretarBusca("leads de BH sem tarefa na proposta", CTX);
  assert.deepEqual(r.filtros.cidades, ["Belo Horizonte"]);
  assert.equal(r.filtros.semProximaAcao, true);
  assert.deepEqual(r.filtros.etapas, ["proposta"]);
});

test("'tarefa vencida do meu nome' → vencida + minhas (nunca 'meus leads')", () => {
  const r = interpretarBusca("tarefa vencida do meu nome", CTX);
  assert.equal(r.filtros.tarefaVencida, true);
  assert.equal(r.filtros.minhasTarefas, true);
  assert.notEqual(r.filtros.meus, true);
});

test("audiometria: a negação inverte o gate", () => {
  assert.equal(interpretarBusca("veio de anúncio e ainda não fez audiometria", CTX).filtros.audiometria, "nao_fez");
  assert.equal(interpretarBusca("já fez audiometria", CTX).filtros.audiometria, "fez");
});

test("'acima de 10 mil parado há 3 dias' → valor e dias, sem confundir um com o outro", () => {
  const r = interpretarBusca("acima de 10 mil parado há 3 dias", CTX);
  assert.equal(r.filtros.valorMin, 10000);
  assert.equal(r.filtros.paradoDiasMin, 3);
});

test("'acima de 5 dias' NÃO vira dinheiro (o piso de valor existe para isto)", () => {
  const r = interpretarBusca("parado acima de 5 dias", CTX);
  assert.equal(r.filtros.valorMin, undefined);
  assert.equal(r.filtros.paradoDiasMin, 5);
});

test("sem usuário logado, 'minhas tarefas' não casa nada (não inventar carteira)", () => {
  const r = interpretarBusca("minhas tarefas vencidas", { ...CTX, temUsuario: false });
  assert.notEqual(r.filtros.minhasTarefas, true);
  assert.equal(r.filtros.tarefaVencida, true);
});

test("'leads' NÃO é 'ads': origem só casa por palavra inteira", () => {
  // medido em 11/09 no ensaio: a frase abaixo acendia `origem: Meta Ads` por substring em "leADS",
  // e o chip parecia legítimo. Afirmar um recorte que ninguém pediu é pior que não entender.
  const r = interpretarBusca("leads de BH sem tarefa na proposta", CTX);
  assert.equal(r.filtros.origens, undefined);
  assert.ok(!r.termos.some((t: { rotulo: string }) => t.rotulo.startsWith("origem")));
  // e a origem de verdade continua casando
  assert.deepEqual(interpretarBusca("veio de anúncio", CTX).filtros.origens, ["meta"]);
  assert.deepEqual(interpretarBusca("chegou por indicação", CTX).filtros.origens, ["ind"]);
});

test("frase sem nada reconhecível: entendeu=false e os filtros ficam INTOCADOS", () => {
  const r = interpretarBusca("xablau do zurupinho", CTX);
  assert.equal(r.entendeu, false);
  assert.deepEqual(r.termos, []);
  const antes = { ...FILTROS_VAZIOS, meus: true, tags: ["parcelado"] };
  assert.deepEqual(aplicarLeitura(antes, r), antes);
});

test("aplicar uma leitura zera a busca por texto e preserva o departamento", () => {
  const antes = { ...FILTROS_VAZIOS, busca: "quem comprou", departamento: "pre_venda" };
  const depois = aplicarLeitura(antes, interpretarBusca("quem comprou aparelho", CTX));
  assert.equal(depois.busca, "");
  assert.equal(depois.departamento, "pre_venda");
  assert.deepEqual(depois.etapas, ["ganho"]);
});
