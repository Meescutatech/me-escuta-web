import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import * as canais from "../components/configuracoes/regras/canais.ts";
import * as porta from "../components/configuracoes/regras/porta.ts";
import * as liteSessao from "../components/configuracoes/regras/lite-sessao.ts";
import type { FormCanal } from "../components/configuracoes/regras/canais.ts";

/*
 * 16/09/2026 — A FONO REGISTRA O PRÓPRIO NÚMERO NÃO OFICIAL.
 *
 * Escopo fechado pelo Diogo, em quatro partes:
 *   A. membro registra o PRÓPRIO número não oficial (o banco já deixa: migration 0337);
 *   B. "De quem é o número" mostra NOME, não UUID;
 *   C. os contadores batem com as linhas visíveis;
 *   D. id `lite:` repetido não trava o registro ("canal lite:admin-me-escuta ja existe").
 *
 * As regras são lidas pelo namespace (`canais.X`) de propósito: export ausente vira teste vermelho
 * com mensagem, e não um erro de carga que derruba o arquivo inteiro sem dizer qual regra falta.
 *
 * Os testes de fiação leem o fonte. Onde a leitura de fonte não consegue provar comportamento
 * (o painel do membro), a decisão foi extraída para uma regra pura (`estadoDoRegistro`) e o teste
 * de fiação só exige que a tela use ESSA regra e não releia o estado bruto.
 */

type Qualquer = Record<string, any>;
const r = canais as unknown as Qualquer;
const p = porta as unknown as Qualquer;
const ls = liteSessao as unknown as Qualquer;

function regra(nome: string, mod: Qualquer = r, onde = "components/configuracoes/regras/canais.ts") {
  const f = mod[nome];
  assert.equal(typeof f, "function", `falta a regra pura \`${nome}\` em ${onde}`);
  return f;
}

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const TABELA = "../components/configuracoes/tabela-canais.tsx";
const SHEET = "../components/configuracoes/sheet-numero-lite.tsx";
const PAGINA = "../app/(app)/configuracoes/canais/page.tsx";
const ACTIONS = "../app/(app)/configuracoes/canais/actions.ts";
const DADOS_PORTA = "../components/configuracoes/dados/porta.ts";

/** A tag de abertura JSX que começa em `inicio` (`<Nome`), respeitando `{ }` — `=>` não a fecha. */
function tagDeAbertura(fonte: string, inicio: number): string {
  let prof = 0;
  for (let i = inicio; i < fonte.length; i++) {
    const c = fonte[i];
    if (c === "{") prof++;
    else if (c === "}") prof--;
    else if (c === ">" && prof === 0) return fonte.slice(inicio, i + 1);
  }
  throw new Error("tag sem fim");
}

/** O valor de `attr={...}` dentro de uma tag, respeitando `{ }` aninhadas. */
function valorDoAtributo(tag: string, attr: string): string | null {
  const m = new RegExp(`\\b${attr}=\\{`).exec(tag);
  if (!m) return null;
  let prof = 0;
  const ini = m.index + m[0].length - 1;
  for (let i = ini; i < tag.length; i++) {
    if (tag[i] === "{") prof++;
    else if (tag[i] === "}" && --prof === 0) return tag.slice(ini + 1, i).trim();
  }
  return null;
}

/** O corpo de `export async function <nome>` até o próximo export de topo. */
function corpoDaFuncao(fonte: string, assinatura: string): string {
  const i = fonte.indexOf(assinatura);
  assert.notEqual(i, -1, `\`${assinatura}\` sumiu — reescrever este teste`);
  const fim = fonte.indexOf("\nexport ", i + 10);
  return fonte.slice(i, fim === -1 ? undefined : fim);
}

const pessoas = [
  { id: "u-admin", nome: "Admin Me Escuta", email: "admin@x" },
  { id: "u-jade", nome: "Jade Fono", email: "jade@x" },
  { id: "u-sara", nome: "Sara", email: "sara@x" },
];

// ═══════════════════════════════ A · a fono registra o próprio ═══════════════════════════════

test("A1 · podeRegistrarNumeroNaoOficial: admin, owner e membro sim; marketing e papel desconhecido não", () => {
  const pode = regra("podeRegistrarNumeroNaoOficial");
  assert.equal(pode("admin"), true);
  assert.equal(pode("owner"), true);
  assert.equal(pode("membro"), true);
  assert.equal(pode("marketing"), false);
  assert.equal(pode(null), false);
});

test("A2 · podeGerirCanais NÃO muda: membro continua sem gerir canal (ligar, desligar, oficial)", () => {
  assert.equal(canais.podeGerirCanais("membro"), false);
  assert.equal(canais.podeGerirCanais("marketing"), false);
  assert.equal(canais.podeGerirCanais("admin"), true);
  assert.equal(canais.podeGerirCanais("owner"), true);
});

test("A3 · pessoasDoRegistro: gestor escolhe entre todas as pessoas", () => {
  const f = regra("pessoasDoRegistro");
  assert.deepEqual(f("admin", "u-admin", pessoas), pessoas);
  assert.deepEqual(f("owner", "u-admin", pessoas), pessoas);
});

test("A4 · pessoasDoRegistro: membro só enxerga a si mesmo", () => {
  const f = regra("pessoasDoRegistro");
  assert.deepEqual(f("membro", "u-jade", pessoas), [pessoas[1]]);
});

test("A5 · pessoasDoRegistro: membro sem uid, ou que não se acha na lista, não recebe ninguém", () => {
  const f = regra("pessoasDoRegistro");
  assert.deepEqual(f("membro", null, pessoas), []);
  assert.deepEqual(f("membro", "", pessoas), []);
  assert.deepEqual(f("membro", "u-fantasma", pessoas), []);
});

test("A6 · pessoasDoRegistro: marketing e papel desconhecido não recebem ninguém (fail-closed)", () => {
  const f = regra("pessoasDoRegistro");
  assert.deepEqual(f("marketing", "u-sara", pessoas), []);
  assert.deepEqual(f(null, "u-sara", pessoas), []);
});

test("A7 · finalidadeDoRegistro: membro registra SEMPRE produção, ignorando o que vier escolhido", () => {
  const f = regra("finalidadeDoRegistro");
  assert.equal(f("membro", "teste"), "producao");
  assert.equal(f("membro", ""), "producao");
  assert.equal(f("membro", "producao"), "producao");
});

test("A8 · finalidadeDoRegistro: gestor registra a finalidade que escolheu", () => {
  const f = regra("finalidadeDoRegistro");
  assert.equal(f("admin", "teste"), "teste");
  assert.equal(f("owner", "producao"), "producao");
  assert.equal(f("admin", ""), "");
});

test("A9 · estadoDoRegistro: membro — pessoa fixa nele mesmo, sem 'Para quê', produção, pronto sem escolher nada", () => {
  const f = regra("estadoDoRegistro");
  const e = f({ papel: "membro", uid: "u-jade", pessoas, pessoaId: "", finalidade: "" });
  assert.deepEqual(e.pessoas, [pessoas[1]]);
  assert.deepEqual(e.pessoa, pessoas[1]);
  assert.equal(e.pessoaFixa, true);
  assert.equal(e.mostraFinalidade, false);
  assert.equal(e.finalidade, "producao");
  assert.equal(e.pronto, true, "membro com o 'Para quê' escondido nunca conseguiria registrar");
});

test("A10 · estadoDoRegistro: membro não troca o dono do número, mesmo com outro pessoaId no estado", () => {
  const f = regra("estadoDoRegistro");
  const e = f({ papel: "membro", uid: "u-jade", pessoas, pessoaId: "u-admin", finalidade: "teste" });
  assert.deepEqual(e.pessoa, pessoas[1]);
  assert.equal(e.finalidade, "producao");
});

test("A11 · estadoDoRegistro: membro que não se acha na lista não fica pronto", () => {
  const f = regra("estadoDoRegistro");
  const e = f({ papel: "membro", uid: "u-fantasma", pessoas, pessoaId: "", finalidade: "" });
  assert.equal(e.pessoa, null);
  assert.equal(e.pronto, false);
});

test("A12 · estadoDoRegistro: gestor escolhe pessoa e finalidade, e só fica pronto com as duas", () => {
  const f = regra("estadoDoRegistro");
  const nada = f({ papel: "admin", uid: "u-admin", pessoas, pessoaId: "", finalidade: "" });
  assert.equal(nada.pessoaFixa, false);
  assert.equal(nada.mostraFinalidade, true);
  assert.equal(nada.pessoa, null);
  assert.equal(nada.pronto, false);
  const soPessoa = f({ papel: "admin", uid: "u-admin", pessoas, pessoaId: "u-sara", finalidade: "" });
  assert.deepEqual(soPessoa.pessoa, pessoas[2]);
  assert.equal(soPessoa.pronto, false);
  const tudo = f({ papel: "owner", uid: "u-admin", pessoas, pessoaId: "u-sara", finalidade: "teste" });
  assert.equal(tudo.finalidade, "teste");
  assert.equal(tudo.pronto, true);
});

test("A13 · estadoDoRegistro: marketing não registra nada", () => {
  const f = regra("estadoDoRegistro");
  const e = f({ papel: "marketing", uid: "u-sara", pessoas, pessoaId: "u-sara", finalidade: "producao" });
  assert.deepEqual(e.pessoas, []);
  assert.equal(e.pronto, false);
});

test("A14 · entradaAdicionar: gestor escolhe o tipo; membro vai direto ao não oficial; o resto não vê", () => {
  const f = regra("entradaAdicionar");
  assert.equal(f("admin"), "escolher");
  assert.equal(f("owner"), "escolher");
  assert.equal(f("membro"), "nao_oficial");
  assert.equal(f("marketing"), null);
  assert.equal(f(null), null);
});

test("A15 · tela: o botão 'Adicionar número' não depende só de `gestor` e abre o painel do não oficial para o membro", () => {
  const tabela = ler(TABELA);
  assert.match(tabela, /entradaAdicionar\s*\(\s*meuPapel\s*\)/, "tabela-canais não decide a entrada por entradaAdicionar(meuPapel)");
  const i = tabela.indexOf("<CascaConfig");
  assert.notEqual(i, -1, "CascaConfig sumiu da tabela — reescrever este teste");
  const acao = valorDoAtributo(tagDeAbertura(tabela, i), "acao");
  assert.ok(acao, "CascaConfig sem `acao` — o botão de adicionar sumiu");
  assert.doesNotMatch(acao, /^gestor\s*\?/, "o botão ainda só aparece para gestor");
  assert.match(acao, /Adicionar número/);
  assert.match(acao, /setAbrindo\(\s*true\s*\)/, "gestor perdeu o formulário de escolha");
  assert.match(acao, /setConectando\(\s*true\s*\)/, "membro não abre direto o painel do não oficial");
});

test("A16 · tela: o formulário do OFICIAL (BlocoAdicionar) só se desenha para gestor", () => {
  const tabela = ler(TABELA);
  const i = tabela.indexOf("<BlocoAdicionar");
  assert.notEqual(i, -1, "o formulário do oficial (BlocoAdicionar) sumiu da tabela — reescrever este teste");
  const condicao = tabela.slice(tabela.lastIndexOf("{", i), i).replace(/\s+/g, " ").trim();
  assert.match(
    condicao,
    /^\{ ?(gestor && abrindo|abrindo && gestor) \? \($/,
    `BlocoAdicionar precisa de \`gestor && abrindo\` na própria condição — achei: ${condicao}`,
  );
});

test("A17 · tela: o texto de leitura do membro diz que ele registra o próprio número, e não que só gestor registra", () => {
  const tabela = ler(TABELA);
  assert.doesNotMatch(
    tabela,
    /Só[\s\S]{0,80}?registra(m)?\s+(os\s+)?números/,
    "a tela ainda diz que só admin e Proprietário registram números — a fono agora registra o próprio",
  );
  assert.match(
    tabela,
    /(seu\s+próprio|o\s+seu|o\s+próprio|seu)\s+número/i,
    "a tela não diz ao membro que ele pode registrar o próprio número",
  );
});

test("A18 · painel: decide pela regra estadoDoRegistro e não relê pessoa/finalidade brutas", () => {
  const sheet = ler(SHEET);
  assert.match(sheet, /estadoDoRegistro\s*\(/, "o painel não usa estadoDoRegistro");
  assert.doesNotMatch(sheet, /\bfinalidade\s*[!=]==\s*""/, "o painel ainda testa a finalidade BRUTA — o membro, sem o seletor, nunca fica pronto");
  assert.doesNotMatch(sheet, /pessoas\.find\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.id\s*===\s*pessoaId\s*\)/, "o painel ainda acha a pessoa pelo pessoaId bruto — o membro nunca tem pessoa");
});

test("A19 · painel: o seletor 'Para quê' só aparece quando a regra manda (mostraFinalidade)", () => {
  const sheet = ler(SHEET);
  const i = sheet.indexOf('label="Para quê"');
  assert.notEqual(i, -1, "o seletor 'Para quê' sumiu do painel — reescrever este teste");
  const abre = sheet.lastIndexOf("<FormItemLayout", i);
  const anterior = sheet.lastIndexOf("</FormItemLayout>", abre);
  const entre = sheet.slice(anterior, abre);
  assert.match(entre, /mostraFinalidade/, "o 'Para quê' é desenhado sem depender de mostraFinalidade — o membro veria o seletor");
});

test("A20 · painel: recebe o papel e o id de quem está logado", () => {
  const tabela = ler(TABELA);
  const i = tabela.indexOf("<SheetNumeroLite");
  assert.notEqual(i, -1, "SheetNumeroLite sumiu da tabela");
  const tag = tagDeAbertura(tabela, i);
  assert.match(tag, /\bmeuPapel=\{\s*meuPapel\s*\}/, "o painel não recebe o papel");
  const uid = /\b(meuId|meuUid|uid|usuarioId)=\{([^}]*)\}/.exec(tag);
  assert.ok(uid, "o painel não recebe o id de quem está logado");
  assert.doesNotMatch(uid[2], /^\s*(undefined|null|"")\s*$/, "o id vai ao painel como constante vazia");
});

test("A21 · página: lê o uid de quem está logado e o entrega à tabela", () => {
  const pagina = ler(PAGINA);
  assert.match(pagina, /lerUidAtual\s*\(\s*\)/, "page.tsx não lê o uid (lerUidAtual)");
  const i = pagina.indexOf("<TabelaCanais");
  assert.notEqual(i, -1, "TabelaCanais sumiu da página");
  const uid = /\b(meuId|meuUid|uid|usuarioId)=\{([^}]*)\}/.exec(tagDeAbertura(pagina, i));
  assert.ok(uid, "a página não entrega o uid à tabela");
  assert.doesNotMatch(uid[2], /^\s*(undefined|null|"")\s*$/, "o uid vai à tabela como constante vazia");
});

/*
 * ESCALADO AO DIOGO, sem decisão: `podeCriarSessao` recusa quem não é gestor
 * ("criar sessão exige admin ou owner"). Com A pronto, o membro REGISTRA o número e falha ao gerar
 * o QR. Fica como `todo` (não conta como falha) até o Diogo decidir se o escopo inclui abrir o
 * pareamento para o membro no PRÓPRIO canal.
 */
// Decisão do Diogo (16/09): o item A inclui GERAR O QR do próprio canal — sem isso o membro registra
// e para no passo seguinte ("criar sessão exige admin ou owner").
test("A22 · podeCriarSessao: membro pareia o PRÓPRIO canal não oficial, e só o próprio", () => {
  const f = regra("podeCriarSessao", ls, "components/configuracoes/regras/lite-sessao.ts");
  const canal = { canal_id: "lite:jade-fono", provedor: "nao_oficial", responsavel_id: "u-jade", ativo: false };
  assert.equal(f({ papel: "membro", uid: "u-jade", canal, f8Pronto: true }).pode, true, "o dono do canal pareia");
  assert.equal(f({ papel: "membro", uid: "u-sara", canal, f8Pronto: true }).pode, false, "canal de outra pessoa");
  assert.equal(f({ papel: "membro", canal, f8Pronto: true }).pode, false, "membro sem uid não pareia nada");
  assert.equal(f({ papel: "membro", uid: "", canal: { ...canal, responsavel_id: "" }, f8Pronto: true }).pode, false, "uid vazio não casa com dono vazio");
  assert.equal(f({ papel: "marketing", uid: "u-jade", canal, f8Pronto: true }).pode, false, "marketing não pareia");
  // a gestão continua pareando qualquer canal não oficial, como antes
  assert.equal(f({ papel: "admin", uid: "u-admin", canal, f8Pronto: true }).pode, true);
});

test("A23 · action: criarSessao lê o uid de quem está logado e o entrega ao portão", () => {
  const acoes = ler("../app/(app)/configuracoes/canais/lite/actions.ts");
  const corpo = corpoDaFuncao(acoes, "export async function criarSessao(");
  assert.match(corpo, /lerUidAtual\s*\(/, "criarSessao não lê o uid — o portão nunca reconhece a dona do canal");
  assert.match(corpo, /podeCriarSessao\s*\(\s*\{[^}]*\buid\b/, "o uid não chega a podeCriarSessao");
});

// ═══════════════════════════════ B · nome, não UUID ═══════════════════════════════

test("B1 · itensPessoas: mapeia id → nome", () => {
  const f = regra("itensPessoas");
  assert.deepEqual(f(pessoas), { "u-admin": "Admin Me Escuta", "u-jade": "Jade Fono", "u-sara": "Sara" });
  assert.deepEqual(f([]), {});
});

test("B2 · painel: o Select de pessoa recebe items vindos de itensPessoas (o trigger mostra o nome)", () => {
  const sheet = ler(SHEET);
  const i = sheet.indexOf("value={pessoaId}");
  assert.notEqual(i, -1, "o Select de pessoa sumiu do painel — reescrever este teste");
  const tag = tagDeAbertura(sheet, sheet.lastIndexOf("<Select", i));
  const items = valorDoAtributo(tag, "items");
  assert.ok(items, "o Select de pessoa não recebe `items` — o trigger mostra o UUID");
  if (!/itensPessoas\s*\(/.test(items)) {
    assert.match(
      sheet,
      new RegExp(`const\\s+${items.replace(/[^\w$]/g, "")}\\s*=[^;]*itensPessoas\\s*\\(`),
      `\`items={${items}}\` não vem de itensPessoas`,
    );
  }
});

// ═══════════════════════════════ C · contadores = linhas visíveis ═══════════════════════════════

const oficialAtivo = { ativo: true, provedor: "waba" as const };
const liteDesligado = { ativo: false, provedor: "nao_oficial" as const };
const liteAtivo = { ativo: true, provedor: "nao_oficial" as const };

test("C1 · contagemDaLista: caso do card — 2 oficiais ligados + 1 lite desligado escondido", () => {
  const f = regra("contagemDaLista");
  const todos = [oficialAtivo, oficialAtivo, liteDesligado];
  const visiveis = [oficialAtivo, oficialAtivo];
  assert.deepEqual(f({ todos, visiveis, busca: "", verDesligados: false }), {
    numeros: 2,
    desligadosEscondidos: 1,
    naoOficiais: 0,
  });
});

test("C2 · contagemDaLista: com os desligados à mostra, nada está escondido e o lite conta", () => {
  const f = regra("contagemDaLista");
  const todos = [oficialAtivo, oficialAtivo, liteDesligado];
  assert.deepEqual(f({ todos, visiveis: todos, busca: "", verDesligados: true }), {
    numeros: 3,
    desligadosEscondidos: 0,
    naoOficiais: 1,
  });
});

test("C3 · contagemDaLista: com busca preenchida, desligadosEscondidos é 0", () => {
  const f = regra("contagemDaLista");
  const todos = [oficialAtivo, liteDesligado, liteDesligado];
  const visiveis = [liteDesligado];
  assert.deepEqual(f({ todos, visiveis, busca: "jade", verDesligados: false }), {
    numeros: 1,
    desligadosEscondidos: 0,
    naoOficiais: 1,
  });
});

test("C4 · contagemDaLista: não oficiais contam só entre os visíveis", () => {
  const f = regra("contagemDaLista");
  const todos = [liteAtivo, liteDesligado, oficialAtivo];
  const visiveis = [liteAtivo, oficialAtivo];
  assert.deepEqual(f({ todos, visiveis, busca: "", verDesligados: false }), {
    numeros: 2,
    desligadosEscondidos: 1,
    naoOficiais: 1,
  });
});

test("C5 · tela: a tabela conta SÓ pela regra contagemDaLista, sobre as linhas visíveis", () => {
  const tabela = ler(TABELA);
  assert.match(tabela, /import[\s\S]*?contagemDaLista[\s\S]*?from\s+"\.\/regras\/canais\.ts"/, "tabela-canais não importa contagemDaLista");
  const chamada = /contagemDaLista\s*\(\s*\{([^}]*)\}\s*\)/.exec(tabela);
  assert.ok(chamada, "tabela-canais não chama contagemDaLista({ ... })");
  const args = chamada[1];
  assert.match(args, /\btodos\s*:\s*ordenados\b/, "contagemDaLista não recebe todos os canais");
  assert.match(args, /\bvisiveis\s*:\s*filtrados\b/, "contagemDaLista não recebe as linhas visíveis");
  assert.match(args, /\bbusca\b/);
  assert.match(args, /\bverDesligados\b/);
  // contagem paralela, escrita em qualquer grafia, é o defeito que o card relatou
  assert.doesNotMatch(
    tabela,
    /\.filter\(\s*\(?\s*\w+\s*\)?\s*=>\s*!?\s*\w+\.(ativo|provedor)\b[^)]*\)\s*\.length/,
    "a tabela ainda conta ativo/provedor por conta própria, fora de contagemDaLista",
  );
  assert.doesNotMatch(
    tabela,
    /const\s+(naoOficiais|desligados|desligadosEscondidos|numeros)\s*=/,
    "a tabela ainda define um contador fora do retorno de contagemDaLista",
  );
});

test("C6 · tela: o texto da Contagem e o alerta de não oficiais usam o retorno da regra", () => {
  const tabela = ler(TABELA);
  const ini = tabela.indexOf("<Contagem>");
  const fim = tabela.indexOf("</Contagem>", ini);
  assert.ok(ini !== -1 && fim !== -1, "Contagem sumiu da tabela — reescrever este teste");
  const contagem = tabela.slice(ini, fim);
  assert.match(contagem, /desligadosEscondidos/, "a Contagem não diz quantos desligados estão ESCONDIDOS");
  assert.match(contagem, /naoOficiais/);
  assert.match(contagem, /numeros/, "a Contagem não mostra `numeros` da regra");
  assert.match(tabela, /(const\s*\{[^}]*\bnaoOficiais\b[^}]*\}\s*=\s*contagemDaLista\s*\(|(\w+)\.naoOficiais)/, "naoOficiais não sai de contagemDaLista");
});

// ═══════════════════════════════ D · id lite que não colide ═══════════════════════════════

test("D1 · proximoCanalIdLite: 1 → base, 2 → base-2, 3 → base-3", () => {
  const f = regra("proximoCanalIdLite");
  assert.equal(f("lite:admin-me-escuta", 1), "lite:admin-me-escuta");
  assert.equal(f("lite:admin-me-escuta", 2), "lite:admin-me-escuta-2");
  assert.equal(f("lite:admin-me-escuta", 3), "lite:admin-me-escuta-3");
});

const CLASSES_ANTIGAS = [
  "conflito_versao",
  "descarte_esperado",
  "sem_bloco_conversa",
  "permissao",
  "recusa",
  "indisponivel",
  "outro",
];

test("D2 · classificarErroPorta: unique_violation (23505) vira uma classe NOVA, que não pede recarregar", () => {
  const classe = porta.classificarErroPorta("23505");
  assert.ok(
    !CLASSES_ANTIGAS.includes(classe),
    `23505 caiu em \`${classe}\` — precisa de uma classe própria de id repetido (ex.: conflito_id)`,
  );
  assert.equal(p.exigeRecarregar(classe), false, "id repetido não é conflito de versão: a tela não deve pedir para recarregar");
  assert.equal(porta.classificarErroPorta("unique_violation"), classe, "a forma por nome deve casar com a do SQLSTATE");
  // e o resto não muda
  assert.equal(porta.classificarErroPorta("23514"), "recusa");
  assert.equal(porta.classificarErroPorta("40001"), "conflito_versao");
});

const formLite: FormCanal = {
  canalId: "",
  nome: "Admin Me Escuta",
  provedor: "nao_oficial",
  numeroE164: "",
  wabaId: "",
  departamento: "",
  finalidade: "producao",
  responsavelId: "u-admin",
};

const formOficial: FormCanal = {
  canalId: "waba-principal",
  nome: "Principal",
  provedor: "waba",
  numeroE164: "+5511999998888",
  wabaId: "123",
  departamento: "",
  finalidade: "producao",
  responsavelId: "",
};

const CONFLITO = () => porta.classificarErroPorta("23505");

test("D3 · payloadCanalRegistrado: o id da tentativa manda no payload (não o derivado do nome)", () => {
  const { canalId, payload } = (canais.payloadCanalRegistrado as unknown as (f: FormCanal, id?: string) => canais.PayloadECanalId)(
    formLite,
    "lite:admin-me-escuta-3",
  );
  assert.equal(payload.canal_id, "lite:admin-me-escuta-3", "o payload ignora o id da tentativa — as três tentativas colidiriam");
  assert.equal(canalId, "lite:admin-me-escuta-3");
  // sem id explícito, o comportamento antigo fica
  assert.equal(canais.payloadCanalRegistrado(formLite).payload.canal_id, "lite:admin-me-escuta");
});

test("D4 · registrarComIdLivre: caso real — as duas primeiras colidem, grava lite:admin-me-escuta-3", async () => {
  const f = regra("registrarComIdLivre");
  const tentados: string[] = [];
  const res = await f(
    formLite,
    async (canalId: string) => {
      tentados.push(canalId);
      if (tentados.length < 3) return { ok: false, classe: CONFLITO(), motivo: `canal ${canalId} ja existe` };
      return { ok: true };
    },
    5,
  );
  assert.deepEqual(tentados, ["lite:admin-me-escuta", "lite:admin-me-escuta-2", "lite:admin-me-escuta-3"]);
  assert.equal(res.ok, true);
  assert.equal(res.canalId, "lite:admin-me-escuta-3");
});

test("D5 · registrarComIdLivre: id livre de primeira grava a base", async () => {
  const f = regra("registrarComIdLivre");
  const tentados: string[] = [];
  const res = await f(formLite, async (id: string) => (tentados.push(id), { ok: true }), 5);
  assert.deepEqual(tentados, ["lite:admin-me-escuta"]);
  assert.equal(res.ok, true);
  assert.equal(res.canalId, "lite:admin-me-escuta");
});

test("D6 · registrarComIdLivre: falha que não é conflito de id para na hora e devolve a falha", async () => {
  const f = regra("registrarComIdLivre");
  const tentados: string[] = [];
  const res = await f(
    formLite,
    async (id: string) => {
      tentados.push(id);
      return { ok: false, classe: "permissao", motivo: "sem permissão para registrar canal" };
    },
    5,
  );
  assert.deepEqual(tentados, ["lite:admin-me-escuta"], "não pode tentar outro id quando a falha não é conflito");
  assert.equal(res.ok, false);
  assert.equal(res.classe, "permissao");
  assert.equal(res.motivo, "sem permissão para registrar canal");
});

test("D7 · registrarComIdLivre: esgotou as tentativas → falha com motivo claro", async () => {
  const f = regra("registrarComIdLivre");
  const tentados: string[] = [];
  const res = await f(
    formLite,
    async (id: string) => {
      tentados.push(id);
      return { ok: false, classe: CONFLITO(), motivo: `canal ${id} ja existe` };
    },
    3,
  );
  assert.deepEqual(tentados, ["lite:admin-me-escuta", "lite:admin-me-escuta-2", "lite:admin-me-escuta-3"]);
  assert.equal(res.ok, false);
  assert.equal(typeof res.motivo, "string");
  assert.ok(res.motivo.trim().length > 0, "falha por esgotamento sem motivo");
  assert.match(res.motivo, /lite:admin-me-escuta/, "o motivo não diz qual id estava ocupado");
});

test("D8 · registrarComIdLivre: o OFICIAL não ganha sufixo — id declarado repetido é recusa, uma tentativa só", async () => {
  const f = regra("registrarComIdLivre");
  const tentados: string[] = [];
  const res = await f(
    formOficial,
    async (id: string) => {
      tentados.push(id);
      return { ok: false, classe: CONFLITO(), motivo: `canal ${id} ja existe` };
    },
    5,
  );
  assert.deepEqual(tentados, ["waba-principal"]);
  assert.equal(res.ok, false);
});

test("D9 · ResultadoAcao carrega o canalId gravado", () => {
  const dados = ler(DADOS_PORTA);
  const i = dados.indexOf("export interface ResultadoAcao");
  assert.notEqual(i, -1, "ResultadoAcao sumiu — reescrever este teste");
  const corpo = dados.slice(i, dados.indexOf("\n}", i));
  assert.match(corpo, /\bcanalId\??\s*:\s*string/, "ResultadoAcao não tem `canalId` — a tela não tem como saber o id gravado");
});

test("D10 · action: registrarCanal tenta o próximo id livre, monta o payload com o id DA TENTATIVA e devolve o gravado", () => {
  const corpo = corpoDaFuncao(ler(ACTIONS), "export async function registrarCanal");
  const m = /registrarComIdLivre\s*\(\s*\w+\s*,\s*(?:async\s*)?\(?\s*(\w+)(?:\s*:\s*string)?\s*\)?\s*=>/.exec(corpo);
  assert.ok(m, "registrarCanal não chama registrarComIdLivre(form, (canalId) => ...)");
  const param = m[1];
  assert.match(
    corpo,
    new RegExp(`payloadCanalRegistrado\\(\\s*\\w+\\s*,\\s*${param}\\s*\\)`),
    `o escrever monta o payload sem o id da tentativa (\`${param}\`) — as tentativas colidiriam todas`,
  );
  assert.match(
    corpo,
    /return\s+(await\s+)?registrarComIdLivre\s*\(|\bcanalId\s*:\s*\w+\.canalId\b/,
    "registrarCanal não devolve o canalId gravado",
  );
});

test("D11 · painel: cria a sessão com o canalId devolvido por registrarCanal, não com a prévia nem com o form", () => {
  const sheet = ler(SHEET);
  const m = /const\s+(\w+)\s*=\s*await\s+registrarCanal\s*\(/.exec(sheet);
  assert.ok(m, "o painel não guarda o retorno de registrarCanal");
  const res = m[1];
  const depois = sheet.slice(m.index, sheet.indexOf("function fechar", m.index));
  assert.doesNotMatch(depois, /previsaoCanalId\s*\(/, "depois de registrar o painel ainda recalcula o id pela prévia");
  assert.doesNotMatch(depois, /form\.canalId/, "o painel usa o canalId do form, que é vazio no não oficial");
  const direto = new RegExp(`criarSessao\\(\\s*${res}\\.canalId\\b`).test(depois);
  const via = new RegExp(`const\\s+(\\w+)\\s*=\\s*${res}\\.canalId\\b[\\s\\S]*criarSessao\\(\\s*\\1\\b`).test(depois);
  assert.ok(direto || via, `criarSessao não recebe \`${res}.canalId\``);
  assert.match(depois, new RegExp(`setCanalId\\(\\s*(${res}\\.canalId|\\w+)\\s*\\)`));
});

// ═══════════════ 16/09 · guardas que a revisão da fase 3 achou sem teste ═══════════════

const LITE_ACTIONS = "../app/(app)/configuracoes/canais/lite/actions.ts";
const DADOS_CANAIS = "../components/configuracoes/dados/canais.ts";

test("A24 · criarSessao: o uid entregue ao portão é o de lerUidAtual, e o dono é o do PRÓPRIO canal", () => {
  const corpo = corpoDaFuncao(ler(LITE_ACTIONS), "export async function criarSessao(");
  const m = corpo.match(/const\s*\[([^\]]+)\]\s*=\s*await\s+Promise\.all\(\s*\[([\s\S]*?)\]\s*\)/);
  assert.ok(m, "criarSessao não lê em paralelo o que o portão precisa — reescrever este teste");
  const nomes = m![1].split(",").map((x) => x.trim());
  const leituras = m![2].split(/,\s*\n/).map((x) => x.trim()).filter(Boolean);
  const iUid = leituras.findIndex((x) => /^lerUidAtual\s*\(\s*\)$/.test(x));
  const iDono = leituras.findIndex((x) => /^lerResponsavelDoCanal\s*\(\s*canalId\s*\)$/.test(x));
  assert.notEqual(iUid, -1, "o uid não sai de lerUidAtual()");
  assert.notEqual(iDono, -1, "o dono não sai de lerResponsavelDoCanal(canalId)");
  const varUid = nomes[iUid];
  const varDono = nomes[iDono];
  const chamada = corpo.match(/podeCriarSessao\s*\(\s*\{([^}]*)\}/);
  assert.ok(chamada, "podeCriarSessao não é chamado com um objeto");
  const campos = chamada![1];
  const uidPassado = /\buid\s*:\s*(\w+)/.exec(campos)?.[1] ?? (/(^|[\s,])uid([\s,]|$)/.test(campos) ? "uid" : null);
  assert.equal(uidPassado, varUid, "o portão recebe outro valor como uid — um membro pareava o canal de outra pessoa");
  assert.match(corpo, new RegExp(`responsavel_id\\s*:\\s*${varDono}\\b`), "o canal do portão não leva o dono lido do banco");
});

test("A25 · lerResponsavelDoCanal lê o dono SÓ do canal pedido", () => {
  const corpo = corpoDaFuncao(ler(DADOS_CANAIS), "export async function lerResponsavelDoCanal(");
  assert.match(corpo, /\.eq\(\s*["']canal_id["']\s*,\s*canalId\s*\)/, "sem o filtro por canal, o dono vem de um canal qualquer");
  assert.match(corpo, /\.maybeSingle\(\s*\)/, "leitura de um só canal");
});

test("A26 · estadoDoDepartamento: o membro só escolhe onde está lotado, e não registra sem escolher", () => {
  const f = regra("estadoDoDepartamento");
  const deps = [
    { chave: "comercial", rotulo: "Comercial", ativo: true, pai: null, nivel: 1 },
    { chave: "pre_venda", rotulo: "Pré-venda", ativo: true, pai: "comercial", nivel: 2 },
    { chave: "clinico", rotulo: "Clínico", ativo: true, pai: null, nivel: 2 },
    { chave: "velho", rotulo: "Velho", ativo: false, pai: null, nivel: 2 },
  ];
  const chaves = (e: { opcoes: { chave: string }[] }) => e.opcoes.map((d) => d.chave).sort();
  // gestão: todas as folhas ativas
  assert.deepEqual(chaves(f({ papel: "admin", departamentos: deps, lotacoes: null, departamento: "" })), ["clinico", "pre_venda"]);
  // membro: só as lotações dele
  const membro = f({ papel: "membro", departamentos: deps, lotacoes: ["comercial", "pre_venda"], departamento: "" });
  assert.deepEqual(chaves(membro), ["pre_venda"]);
  assert.equal(membro.valido, false, "sem escolher não está pronto — a porta recusa com PMEE6");
  assert.ok(membro.falta);
  assert.equal(f({ papel: "membro", departamentos: deps, lotacoes: ["pre_venda"], departamento: "pre_venda" }).valido, true);
  assert.equal(f({ papel: "membro", departamentos: deps, lotacoes: ["pre_venda"], departamento: "clinico" }).valido, false, "fora da lotação");
  // lotação ilegível: nenhuma opção, e a tela diz por quê
  const ilegivel = f({ papel: "membro", departamentos: deps, lotacoes: null, departamento: "" });
  assert.deepEqual(ilegivel.opcoes, []);
  assert.ok(ilegivel.falta);
  // quem não é gestão nem membro não escolhe nada
  assert.deepEqual(f({ papel: "marketing", departamentos: deps, lotacoes: ["pre_venda"], departamento: "" }).opcoes, []);
});

test("A27 · painel: o botão só libera com o departamento válido", () => {
  const sheet = ler(SHEET);
  assert.match(sheet, /estadoDoDepartamento\s*\(/, "o painel não usa a regra de departamento");
  assert.match(sheet, /const\s+pronto\s*=[^;\n]*\.valido/, "`pronto` ignora a validade do departamento");
});

test("A28 · action: registrarCanal força a finalidade pelo papel lido no SERVIDOR", () => {
  const corpo = corpoDaFuncao(ler(ACTIONS), "export async function registrarCanal(");
  const papel = /const\s+(\w+)\s*=\s*await\s+lerPapelAtual\s*\(\s*\)/.exec(corpo)?.[1];
  assert.ok(papel, "registrarCanal não lê o papel no servidor — a tela é a única trava, e a action é endpoint");
  assert.match(corpo, new RegExp(`finalidade\\s*:\\s*finalidadeDoRegistro\\(\\s*${papel}\\s*,`), "a finalidade que vai ao banco não passa pela regra");
});
