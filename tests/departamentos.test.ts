import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLINICO,
  chavesComPendencia,
  descendentesDe,
  ehFolha,
  escolherAtivo,
  folhas,
  ordenar,
  resolverEscopo,
  visiveisPara,
  type Departamento,
  type ParAncestral,
  type Sinonimo,
} from "../lib/departamentos/escopo.ts";
import { clausulaEscopo } from "../lib/departamentos/escopo.ts";
import { lerTituloDaRota } from "../lib/header/titulos.ts";
import { TETO_NAO_LIDAS, rotuloNaoLidas } from "../lib/notificacoes.ts";

/*
 * M6 · A ÁLGEBRA DO ESCOPO DE DEPARTAMENTO.
 *
 * Estes testes CRIAM O PRÓPRIO SUJEITO (MÉTODO §17): a árvore é montada aqui, então eles são
 * falsificáveis independentemente do estado de produção. Nenhum deles conta uma população
 * pré-existente, e por isso nenhum herda o vazio dela — o que importa porque hoje
 * `core.usuario_departamento` nasce vazia e uma asserção que a contasse ficaria verde num sistema
 * correto e num sistema que nunca foi usado.
 *
 * A árvore é a do D6-c, literal, e é a semente que a SPEC-M8 §4.1 vai gravar em `core.config`.
 */
const ARVORE_D6C: Departamento[] = [
  { chave: "comercial", rotulo: "Comercial", pai: null, nivel: 1, ativo: true, entrada: false, ordem: 0 },
  { chave: "pre_venda", rotulo: "Pré-venda", pai: "comercial", nivel: 2, ativo: true, entrada: true, ordem: 0 },
  { chave: "avaliacao", rotulo: "Avaliação", pai: "comercial", nivel: 2, ativo: true, entrada: false, ordem: 1 },
  { chave: "credito", rotulo: "Crédito", pai: "comercial", nivel: 2, ativo: true, entrada: false, ordem: 2 },
  { chave: "pos_venda", rotulo: "Pós-venda", pai: null, nivel: 1, ativo: true, entrada: false, ordem: 1 },
  { chave: "cobranca", rotulo: "Cobrança", pai: "pos_venda", nivel: 2, ativo: true, entrada: false, ordem: 0 },
  { chave: "clinico", rotulo: "Clínico", pai: "pos_venda", nivel: 2, ativo: true, entrada: false, ordem: 1 },
];

/** O que `core.v_departamento_arvore` devolve: fechamento transitivo, INCLUINDO a si mesma. */
const FECHAMENTO: ParAncestral[] = [
  { chave: "comercial", ancestral: "comercial" },
  { chave: "pre_venda", ancestral: "pre_venda" },
  { chave: "pre_venda", ancestral: "comercial" },
  { chave: "avaliacao", ancestral: "avaliacao" },
  { chave: "avaliacao", ancestral: "comercial" },
  { chave: "credito", ancestral: "credito" },
  { chave: "credito", ancestral: "comercial" },
  { chave: "pos_venda", ancestral: "pos_venda" },
  { chave: "cobranca", ancestral: "cobranca" },
  { chave: "cobranca", ancestral: "pos_venda" },
  { chave: "clinico", ancestral: "clinico" },
  { chave: "clinico", ancestral: "pos_venda" },
];

/** Os DOIS sinônimos que sobraram de 14 valores depois do D6-c (SPEC-M8 §4.1). */
const SINONIMOS: Sinonimo[] = [
  { chave: "cobranca", sinonimo: "financeiro" },
  { chave: "clinico", sinonimo: "clinica" },
];

const TODAS = ARVORE_D6C.map((d) => d.chave);

// ═════════════ 1 · folha, e a definição é computada da árvore ═════════════

test("folha = nó sem filhos ATIVOS — os 2 de nível 1 não são folha, os 5 de nível 2 são", () => {
  assert.equal(ehFolha("comercial", ARVORE_D6C), false);
  assert.equal(ehFolha("pos_venda", ARVORE_D6C), false);
  assert.deepEqual(
    folhas(ARVORE_D6C).map((d) => d.chave).sort(),
    ["avaliacao", "clinico", "cobranca", "credito", "pre_venda"],
  );
});

test("arquivar os filhos devolve o pai à condição de folha — sem cláusula especial", () => {
  // Foi a razão de a definição do Estaleiro ("sem filhos ativos") ser melhor que a minha ("nível 1
  // não recebe escrita"): um departamento de nível 1 sem subdepartamento não pode nascer inutilizável.
  const semFilhos = ARVORE_D6C.map((d) =>
    d.pai === "pos_venda" ? { ...d, ativo: false } : d,
  );
  assert.equal(ehFolha("pos_venda", semFilhos), true);
});

// ═════════════ 2 · a hierarquia é ASSIMÉTRICA, e é o que faz o escopo ser escopo ═════════════

test("pai cobre filho", () => {
  assert.deepEqual(descendentesDe("comercial", FECHAMENTO).sort(), [
    "avaliacao",
    "comercial",
    "credito",
    "pre_venda",
  ]);
});

test("filho NÃO cobre pai — as 73 conversas congeladas em `comercial` não aparecem sob Pré-venda", () => {
  const escopo = resolverEscopo("pre_venda", FECHAMENTO, SINONIMOS, TODAS);
  assert.deepEqual(escopo.areas, ["pre_venda"]);
  assert.equal(escopo.areas.includes("comercial"), false);
});

test("irmão não cobre irmão", () => {
  assert.equal(
    resolverEscopo("credito", FECHAMENTO, SINONIMOS, TODAS).areas.includes("avaliacao"),
    false,
  );
});

test("sinônimo entra no escopo — linha gravada como `financeiro` aparece em Cobrança", () => {
  assert.deepEqual(resolverEscopo("cobranca", FECHAMENTO, SINONIMOS, TODAS).areas, [
    "cobranca",
    "financeiro",
  ]);
});

test("`sem departamento` entra SEMPRE — é a faixa do D6-g, não é opção", () => {
  for (const chave of TODAS) {
    assert.equal(
      resolverEscopo(chave, FECHAMENTO, SINONIMOS, TODAS).incluiSemDepartamento,
      true,
      `${chave} deveria incluir a faixa Sem departamento`,
    );
  }
});

// ═════════════ 3 · o fail-open, e a EXCEÇÃO que é constitucional ═════════════

test("sem vínculo: vê 6 dos 7 nós, e o que falta é `clinico`", () => {
  const vistos = visiveisPara(ARVORE_D6C, [], "membro").map((d) => d.chave);
  assert.equal(vistos.length, 6);
  assert.equal(vistos.includes(CLINICO), false);
  // CORREÇÃO DE ARITMÉTICA da SPEC-M6 §5.5 / E3, registrada em vez de silenciada: ela diz "vê as 5
  // folhas, nunca as 6". A árvore do D6-c tem 5 folhas NO TOTAL (pre_venda, avaliacao, credito,
  // cobranca, clinico) — logo, tirando `clinico`, sobram 4 folhas e 6 nós. A FORMA do controle
  // estava certa; os números, não. O que discrimina é o nome, não a contagem.
  assert.deepEqual(
    folhas(ARVORE_D6C).filter((d) => vistos.includes(d.chave)).map((d) => d.chave).sort(),
    ["avaliacao", "cobranca", "credito", "pre_venda"],
  );
});

test("owner e admin veem tudo, inclusive `clinico`", () => {
  for (const papel of ["owner", "admin"] as const) {
    assert.equal(visiveisPara(ARVORE_D6C, [], papel).length, 7);
    assert.equal(
      visiveisPara(ARVORE_D6C, [], papel).some((d) => d.chave === CLINICO),
      true,
    );
  }
});

test("vínculo em nível 1 implica os filhos — uma regra de hierarquia no sistema, não duas", () => {
  assert.deepEqual(
    visiveisPara(ARVORE_D6C, ["comercial"], "membro").map((d) => d.chave).sort(),
    ["avaliacao", "comercial", "credito", "pre_venda"],
  );
});

test("vínculo em `pos_venda` NÃO herda `clinico` — o fail-closed não cai pela porta dos fundos", () => {
  const vistos = visiveisPara(ARVORE_D6C, ["pos_venda"], "membro").map((d) => d.chave).sort();
  assert.deepEqual(vistos, ["cobranca", "pos_venda"]);
});

test("vínculo EXPLÍCITO em `clinico` abre `clinico`", () => {
  assert.equal(
    visiveisPara(ARVORE_D6C, ["clinico"], "membro").some((d) => d.chave === CLINICO),
    true,
  );
});

/*
 * ESTE É O TESTE QUE PEGA O BURACO QUE EU ACHEI NO MEU PRÓPRIO DESENHO, e por isso ele vem com o
 * motivo escrito: a SPEC-M6 põe o fail-closed do `clinico` em `lerDepartamentosVisiveis` — ou seja,
 * na LISTA — e, ao mesmo tempo, diz que selecionar o pai significa a UNIÃO dos filhos. As duas
 * regras juntas vazam: `clinico` some do dropdown e volta pelo escopo de `pos_venda`, e o
 * fail-closed vira decoração.
 *
 * MUTAÇÃO QUE O DEIXA VERMELHO: remover o `.filter((c) => podeVer.has(c))` de `resolverEscopo`.
 * O teste do dropdown continuaria verde — é exatamente o ponto: asserção que fica do lado de dentro
 * não alcança a fronteira (MÉTODO §21).
 */
test("fail-closed ALCANÇA O ESCOPO: sob `pos_venda` sem vínculo, `clinico` não entra nas áreas", () => {
  const visiveis = visiveisPara(ARVORE_D6C, [], "membro").map((d) => d.chave);
  const escopo = resolverEscopo("pos_venda", FECHAMENTO, SINONIMOS, visiveis);
  assert.equal(escopo.areas.includes("clinico"), false, "clinico vazou pelo escopo do pai");
  assert.equal(escopo.areas.includes("clinica"), false, "o sinônimo de clinico vazou junto");
  assert.deepEqual(escopo.areas, ["cobranca", "financeiro", "pos_venda"]);
});

test("controle positivo do mesmo caminho: com vínculo em `clinico`, ele ENTRA no escopo do pai", () => {
  // Sem este controle, o teste acima ficaria verde num `resolverEscopo` que simplesmente devolvesse
  // conjunto vazio — "não achou clinico" e "não sabe achar nada" teriam a mesma cara.
  const visiveis = visiveisPara(ARVORE_D6C, ["pos_venda", "clinico"], "membro").map((d) => d.chave);
  const escopo = resolverEscopo("pos_venda", FECHAMENTO, SINONIMOS, visiveis);
  assert.equal(escopo.areas.includes("clinico"), true);
  assert.equal(escopo.areas.includes("clinica"), true);
});

// ═════════════ 4 · ativo, ordem, pendência ═════════════

test("cookie apontando para departamento que a pessoa não vê é tratado como AUSENTE", () => {
  const visiveis = visiveisPara(ARVORE_D6C, [], "membro");
  const ativo = escolherAtivo(ordenar(visiveis), "clinico");
  assert.notEqual(ativo, null);
  assert.notEqual(ativo!.chave, "clinico");
  assert.equal(ativo!.chave, "comercial", "sem preferência válida, o primeiro da ordem da config");
});

test("cookie válido vence o padrão", () => {
  const visiveis = ordenar(visiveisPara(ARVORE_D6C, [], "membro"));
  assert.equal(escolherAtivo(visiveis, "credito")!.chave, "credito");
});

test("ordem de exibição: cada filho logo abaixo do próprio pai", () => {
  assert.deepEqual(
    ordenar(ARVORE_D6C).map((d) => d.chave),
    ["comercial", "pre_venda", "avaliacao", "credito", "pos_venda", "cobranca", "clinico"],
  );
});

test("pendência do filho acende no PAI — quem está em Pós-venda vê que há coisa em Cobrança", () => {
  const visiveis = ordenar(visiveisPara(ARVORE_D6C, [], "membro"));
  const mapa = new Map<string | null, number>([["cobranca", 2]]);
  const acesos = chavesComPendencia(visiveis, FECHAMENTO, SINONIMOS, mapa);
  assert.equal(acesos.includes("pos_venda"), true);
  assert.equal(acesos.includes("cobranca"), true);
  assert.equal(acesos.includes("comercial"), false, "irmão não acende irmão");
});

test("pendência gravada pelo SINÔNIMO também acende — `financeiro` acende Cobrança", () => {
  const visiveis = ordenar(visiveisPara(ARVORE_D6C, [], "membro"));
  const acesos = chavesComPendencia(
    visiveis,
    FECHAMENTO,
    SINONIMOS,
    new Map<string | null, number>([["financeiro", 1]]),
  );
  assert.equal(acesos.includes("cobranca"), true);
});

test("zero pendência não acende nada — o ponto é TEM/NÃO TEM, e zero é silêncio", () => {
  const visiveis = ordenar(visiveisPara(ARVORE_D6C, [], "membro"));
  assert.deepEqual(
    chavesComPendencia(visiveis, FECHAMENTO, SINONIMOS, new Map<string | null, number>()),
    [],
  );
});

// ═════════════ 5 · o predicado que o C9 mede ═════════════

test("a cláusula de escopo sempre carrega `area.is.null` — a faixa Sem departamento não é opcional", () => {
  const escopo = resolverEscopo("comercial", FECHAMENTO, SINONIMOS, TODAS);
  const clausula = clausulaEscopo(escopo);
  assert.equal(clausula!.includes("area.is.null"), true);
  assert.equal(clausula!.includes("area.in.(avaliacao,comercial,credito,pre_venda)"), true);
});

test("sem escopo, nenhuma cláusula — a leitura é byte a byte a de antes (F21/F22/F25 intactos)", () => {
  assert.equal(clausulaEscopo(null), null);
  assert.equal(clausulaEscopo(undefined), null);
});

test("chave de forma inválida é DESCARTADA, não interpolada — `or` quebrado viraria consulta sem filtro", () => {
  const clausula = clausulaEscopo({
    chave: "x",
    areas: ["ok_1", "mal),area.not.is.null", "OUTRO"],
    incluiSemDepartamento: true,
  });
  assert.equal(clausula, "area.in.(ok_1),area.is.null");
});

test("escopo que não sobrou nenhuma chave válida NÃO vira consulta aberta — vira só a faixa", () => {
  // O modo de falha caro seria devolver `null` aqui: `null` significa "sem escopo", e sem escopo a
  // consulta traz o inbox inteiro. Uma lista vazia de chaves tem de estreitar, nunca abrir.
  assert.equal(
    clausulaEscopo({ chave: "x", areas: [], incluiSemDepartamento: true }),
    "area.is.null",
  );
});

// ═════════════ 6 · fonte única rota→título ═════════════

test("rota conhecida devolve o nome em PT-BR", () => {
  assert.equal(lerTituloDaRota("/"), "Dashboard");
  assert.equal(lerTituloDaRota("/funil"), "Funil de vendas");
  assert.equal(lerTituloDaRota("/fila"), "Fila de sugestões");
  assert.equal(lerTituloDaRota("/timeline"), "Timeline do ledger");
});

test("subrota casa a mais ESPECÍFICA primeiro", () => {
  assert.equal(lerTituloDaRota("/configuracoes"), "Configurações");
  assert.equal(lerTituloDaRota("/configuracoes/membros"), "Membros");
  assert.equal(lerTituloDaRota("/configuracoes/avancado/funil_vendas"), "Auditoria e histórico");
});

test("rota FORA do mapa devolve VAZIO — nunca a rota crua na cara do usuário", () => {
  assert.equal(lerTituloDaRota("/lead/6f0c"), "");
  assert.equal(lerTituloDaRota("/nao-existe"), "");
});

test("`/agentes` já tem nome, inerte até o M2 criar a rota (D12)", () => {
  assert.equal(lerTituloDaRota("/agentes"), "Agentes");
});

// ═════════════ 7 · o teto do sino ═════════════

test("abaixo do teto o número é o número", () => {
  assert.equal(rotuloNaoLidas(0), "0");
  assert.equal(rotuloNaoLidas(199), "199");
});

test("NO teto e acima dele vira `200+` — `200` seco é indistinguível de 'muitas, não sei quantas'", () => {
  assert.equal(rotuloNaoLidas(TETO_NAO_LIDAS), "200+");
  assert.equal(rotuloNaoLidas(1000), "200+");
});
