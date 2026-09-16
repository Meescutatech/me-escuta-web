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
 * Volta 1 (escopo do Diogo): A. membro registra o PRÓPRIO número não oficial; B. nome, não UUID;
 * C. contadores = linhas visíveis; D. id `lite:` repetido não trava o registro.
 *
 * Volta 2 (decisão do Diogo, 16/09 — FORMULÁRIO ENXUTO): "Conectar um número" tem SÓ o aviso de ban
 * e o botão. O dono é SEMPRE quem cadastra, lido no SERVIDOR (lerUidAtual), para todo papel que
 * registra; o nome do canal é o nome de quem cadastra (lido no servidor); finalidade é sempre
 * `producao`; sem Número, sem Departamento. Saíram: seletor de pessoa (pessoasDoRegistro,
 * itensPessoas, estadoDoRegistro), "Para quê" (finalidadeDoRegistro), departamento obrigatório
 * (estadoDoDepartamento) e o campo Número. O banco perde a exigência de departamento no não oficial
 * (Parte B da 0337) — isso é pgTAP no me-escuta-db, não aqui.
 *
 * As regras são lidas pelo namespace (`canais.X`) de propósito: export ausente vira teste vermelho
 * com mensagem, e não um erro de carga que derruba o arquivo inteiro sem dizer qual regra falta.
 * Os testes de fiação leem o fonte; a decisão de comportamento mora na regra pura
 * `formNumeroPessoal`, e a fiação só exige que a action use ESSA regra com o que leu no servidor.
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

/**
 * O trecho de uma função LOCAL do painel, de `nome` até `ate`, aceitando `function nome` e
 * `const nome = …` nas duas pontas. Início ou fim ausente é falha — nunca um trecho vazio que
 * deixaria o `doesNotMatch` passar por nada.
 */
function trechoLocal(fonte: string, nome: string, ate: string): string {
  const achar = (n: string, de = 0) => {
    const m = new RegExp(`(function\\s+${n}\\b|const\\s+${n}\\s*=)`).exec(fonte.slice(de));
    return m ? de + m.index : -1;
  };
  const ini = achar(nome);
  assert.notEqual(ini, -1, `\`${nome}\` sumiu do painel — reescrever este teste`);
  const fim = achar(ate, ini + 1);
  assert.notEqual(fim, -1, `\`${ate}\` sumiu do painel (ou veio antes de \`${nome}\`) — reescrever este teste`);
  return fonte.slice(ini, fim);
}

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

test("A14 · entradaAdicionar: gestor escolhe o tipo; membro vai direto ao não oficial; o resto não vê", () => {
  const f = regra("entradaAdicionar");
  assert.equal(f("admin"), "escolher");
  assert.equal(f("owner"), "escolher");
  assert.equal(f("membro"), "nao_oficial");
  assert.equal(f("marketing"), null);
  assert.equal(f(null), null);
});

test("A15 · tela: 'Adicionar número' abre o PAINEL para todo papel que registra — a escolha de tipo mora nele", () => {
  const tabela = ler(TABELA);
  assert.match(tabela, /entradaAdicionar\s*\(\s*meuPapel\s*\)/, "tabela-canais não decide a entrada por entradaAdicionar(meuPapel)");
  const i = tabela.indexOf("<CascaConfig");
  assert.notEqual(i, -1, "CascaConfig sumiu da tabela — reescrever este teste");
  const acao = valorDoAtributo(tagDeAbertura(tabela, i), "acao");
  assert.ok(acao, "CascaConfig sem `acao` — o botão de adicionar sumiu");
  assert.match(acao, /Adicionar número/);
  assert.match(acao, /setConectando\(\s*true\s*\)/, "o botão não abre o painel");
  assert.doesNotMatch(acao, /setAbrindo/, "o botão ainda abre o formulário inline");
});
test("A16 · tela: o formulário do OFICIAL saiu da tabela — mora no painel (FormNumeroOficial)", () => {
  const tabela = ler(TABELA);
  assert.doesNotMatch(tabela, /<BlocoAdicionar\b/, "a tabela ainda desenha o formulário inline");
  assert.doesNotMatch(tabela, /function\s+BlocoAdicionar\b/, "BlocoAdicionar ficou na tabela sem uso");
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

test("A21 · página: lê o uid de quem está logado e o entrega à tabela", () => {
  const pagina = ler(PAGINA);
  assert.match(pagina, /lerUidAtual\s*\(\s*\)/, "page.tsx não lê o uid (lerUidAtual)");
  const i = pagina.indexOf("<TabelaCanais");
  assert.notEqual(i, -1, "TabelaCanais sumiu da página");
  const uid = /\b(meuId|meuUid|uid|usuarioId)=\{([^}]*)\}/.exec(tagDeAbertura(pagina, i));
  assert.ok(uid, "a página não entrega o uid à tabela");
  assert.doesNotMatch(uid[2], /^\s*(undefined|null|"")\s*$/, "o uid vai à tabela como constante vazia");
});

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

test("D7b · registrarComIdLivre: com 5 ids ocupados, grava o 6º", async () => {
  const f = regra("registrarComIdLivre");
  const tentados: string[] = [];
  const res = await f(
    formLite,
    async (id: string) => {
      tentados.push(id);
      if (tentados.length <= 5) return { ok: false, classe: CONFLITO(), motivo: `canal ${id} ja existe` };
      return { ok: true, classe: undefined, motivo: "" };
    },
  );
  assert.equal(tentados.length, 6, "deveria ter tentado 6 ids");
  assert.equal(res.ok, true, "o 6º deveria ter sido gravado");
  assert.equal(res.canalId, "lite:admin-me-escuta-6");
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

test("D11 · painel: cria a sessão com o canalId devolvido pelo registro, não com a prévia", () => {
  const sheet = ler(SHEET);
  const m = /const\s+(\w+)\s*=\s*await\s+registrarMeuNumero\s*\(/.exec(sheet);
  assert.ok(m, "o painel não guarda o retorno de registrarMeuNumero");
  const res = m[1];
  const corpo = trechoLocal(sheet, "registrarEParear", "fechar");
  assert.ok(corpo.includes(m[0]), "a chamada a registrarMeuNumero não está dentro de registrarEParear");
  const depois = corpo.slice(corpo.indexOf(m[0]));
  assert.doesNotMatch(depois, /previsaoCanalId\s*\(/, "depois de registrar o painel ainda recalcula o id pela prévia");
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

// ═══════════════════ E · formulário enxuto: o dono e o nome saem do SERVIDOR ═══════════════════

const MARIA = { papel: "membro", uid: "u-jade", nome: "Jade Fono" };

test("E1 · formNumeroPessoal: o dono é quem cadastra, o nome é o dele, produção, sem número, sem departamento", () => {
  const f = regra("formNumeroPessoal");
  const form = f(MARIA);
  assert.deepEqual(form, {
    canalId: "",
    nome: "Jade Fono",
    provedor: "nao_oficial",
    numeroE164: "",
    wabaId: "",
    departamento: "",
    finalidade: "producao",
    responsavelId: "u-jade",
  });
});

test("E2 · formNumeroPessoal: vale igual para admin, owner e membro — ninguém escolhe outro dono", () => {
  const f = regra("formNumeroPessoal");
  for (const papel of ["admin", "owner", "membro"]) {
    const form = f({ papel, uid: "u-admin", nome: "Admin Me Escuta" });
    assert.ok(form, `${papel} não conseguiu montar o próprio número`);
    assert.equal(form.responsavelId, "u-admin", `${papel}: o dono não é quem cadastra`);
    assert.equal(form.nome, "Admin Me Escuta");
    assert.equal(form.finalidade, "producao", `${papel}: finalidade não é produção`);
    assert.equal(form.departamento, "");
    assert.equal(form.numeroE164, "");
  }
});

test("E3 · formNumeroPessoal: ignora dono, finalidade, departamento e número extras — para TODO papel, gestão inclusive", () => {
  const f = regra("formNumeroPessoal");
  // a gestão é o caso que importa: `gestor ? (entrada.responsavelId ?? uid) : uid` passaria só com membro
  for (const papel of ["admin", "owner", "membro"]) {
    const form = f({
      papel,
      uid: "u-jade",
      nome: "Jade Fono",
      responsavelId: "u-sara",
      responsavel_id: "u-sara",
      finalidade: "teste",
      departamento: "pre_venda",
      numeroE164: "+5511999998888",
      nomeCanal: "Outro Nome",
    });
    assert.ok(form, `${papel} não montou o próprio número`);
    assert.equal(form.responsavelId, "u-jade", `${papel}: o dono veio da entrada, não do uid`);
    assert.equal(form.finalidade, "producao", `${papel}: a finalidade veio da entrada`);
    assert.equal(form.departamento, "", `${papel}: o departamento veio da entrada`);
    assert.equal(form.numeroE164, "", `${papel}: o número veio da entrada`);
    assert.equal(form.nome, "Jade Fono", `${papel}: o nome não é o de quem cadastra`);
  }
});

test("E4 · formNumeroPessoal: o nome vem aparado, e o id `lite:` sai dele", () => {
  const f = regra("formNumeroPessoal");
  const form = f({ papel: "membro", uid: "u-jade", nome: "  Jade Fono  " });
  assert.equal(form.nome, "Jade Fono");
  assert.equal(canais.canalIdDoForm(form), "lite:jade-fono");
});

test("E5 · formNumeroPessoal: falha FECHADO — marketing, papel nulo, sem uid, ou sem nome E sem e-mail não montam nada", () => {
  const f = regra("formNumeroPessoal");
  assert.equal(f({ papel: "marketing", uid: "u-sara", nome: "Sara" }), null, "marketing registrou número");
  assert.equal(f({ papel: null, uid: "u-sara", nome: "Sara" }), null, "papel desconhecido registrou número");
  assert.equal(f({ papel: "membro", uid: null, nome: "Jade" }), null, "sem uid não há dono");
  assert.equal(f({ papel: "membro", uid: "  ", nome: "Jade" }), null, "uid em branco não é dono");
  assert.equal(f({ papel: "membro", uid: "u-jade", nome: null, email: null }), null, "sem nome e sem e-mail não há id `lite:`");
  assert.equal(f({ papel: "membro", uid: "u-jade", nome: "   ", email: "  " }), null, "nome e e-mail em branco não são nome");
});

// Decisão do Diogo (16/09): sem nome utilizável, o canal usa o INÍCIO do e-mail — ninguém fica travado.
test("E23 · formNumeroPessoal: sem nome (ou nome sem letra), o nome do canal é o início do e-mail", () => {
  const f = regra("formNumeroPessoal");
  const semNome = f({ papel: "membro", uid: "u-jade", nome: null, email: "jade.fono@meescuta.com" });
  assert.ok(semNome, "sem nome, mas com e-mail, a pessoa ficou travada");
  assert.equal(semNome.nome, "jade.fono");
  assert.equal(canais.canalIdDoForm(semNome), "lite:jade-fono");
  const semLetra = f({ papel: "admin", uid: "u-x", nome: "🦋🦋", email: "carla@meescuta.com" });
  assert.equal(semLetra?.nome, "carla", "nome sem letra geraria o id vazio `lite:` — cai no e-mail");
  // com nome bom, o e-mail não entra
  assert.equal(f({ papel: "membro", uid: "u-jade", nome: "Jade Fono", email: "outra@x.com" })?.nome, "Jade Fono");
});

/*
 * E6 e E7 são COERÊNCIA entre a regra nova e o que já existia (validarRegistroCanal nunca exigiu
 * departamento; payloadCanalRegistrado já omitia o vazio). O vermelho deles hoje é só a falta de
 * formNumeroPessoal. Quem guarda "o departamento deixou de ser obrigatório" no web é E8 (a regra
 * estadoDoDepartamento saiu), E15 (o campo saiu) e E17 (o botão não espera campo). No banco, é o
 * pgTAP 102 do me-escuta-db.
 */
test("E6 · coerência: o form pessoal não é recusado pela validação que já existe (sem departamento, sem número)", () => {
  const form = regra("formNumeroPessoal")(MARIA);
  assert.deepEqual(canais.validarRegistroCanal(form), {}, "a validação ainda exige algo que o formulário enxuto não tem");
});

test("E7 · coerência: o payload do form pessoal leva dono, nome e produção, e não leva departamento nem numero_e164", () => {
  const form = regra("formNumeroPessoal")(MARIA);
  const { canalId, payload } = canais.payloadCanalRegistrado(form, "lite:jade-fono-2");
  assert.equal(canalId, "lite:jade-fono-2");
  assert.deepEqual(payload, {
    canal_id: "lite:jade-fono-2",
    nome: "Jade Fono",
    provedor: "nao_oficial",
    responsavel_id: "u-jade",
    finalidade: "producao",
  });
  assert.ok(!("departamento" in payload), "departamento viajou no payload");
  assert.ok(!("numero_e164" in payload), "numero_e164 viajou no payload");
});

test("E20 · formNumeroPessoal nunca devolve um form que a validação recusa — nome longo é TRUNCADO em 60", () => {
  // A pessoa não tem campo para corrigir o nome. Decisão do Diogo (16/09): nome longo é truncado.
  const f = regra("formNumeroPessoal");
  const longo = f({ papel: "membro", uid: "u-jade", nome: "A".repeat(61), email: null });
  assert.ok(longo, "nome de 61 caracteres foi recusado — a decisão é truncar");
  assert.equal(longo.nome.length, 60);
  const composto = f({ papel: "membro", uid: "u-jade", nome: `Maria ${"da Silva ".repeat(20)}`, email: null });
  assert.ok(composto && composto.nome.length <= 60 && composto.nome === composto.nome.trim(), "truncou deixando espaço na ponta");
  const casos = ["A".repeat(61), `Maria ${"da Silva ".repeat(20)}`, "🦋🦋", "---", "   🦋   "];
  for (const nome of casos) {
    const form = f({ papel: "membro", uid: "u-jade", nome, email: null });
    if (form === null) continue;
    assert.deepEqual(canais.validarRegistroCanal(form), {}, `nome ${JSON.stringify(nome)} gerou um form que a validação recusa`);
    assert.notEqual(canais.canalIdDoForm(form), canais.PREFIXO_LITE, `nome ${JSON.stringify(nome)} gerou o id vazio \`lite:\``);
  }
  // nome com emoji E letra é válido hoje (o slug sai das letras): recusar seria regressão
  const misto = f({ papel: "membro", uid: "u-ana", nome: "Ana 🦋" });
  assert.ok(misto, "nome com emoji e letra foi recusado — a validação o aceita");
  assert.equal(canais.canalIdDoForm(misto), "lite:ana");
});

test("E8 · as regras do formulário antigo SAÍRAM (seletor de pessoa, 'Para quê', departamento obrigatório)", () => {
  for (const nome of ["pessoasDoRegistro", "estadoDoRegistro", "itensPessoas", "finalidadeDoRegistro", "estadoDoDepartamento"]) {
    assert.equal(r[nome], undefined, `\`${nome}\` ainda é exportada de regras/canais.ts — é código morto do formulário antigo`);
  }
});

// ── a action do número pessoal ──

function corpoRegistrarMeuNumero(): string {
  return corpoDaFuncao(ler(ACTIONS), "export async function registrarMeuNumero(");
}

test("E9 · action: registrarMeuNumero não aceita dono, nome nem finalidade do cliente", () => {
  const corpo = corpoRegistrarMeuNumero();
  const params = /registrarMeuNumero\(([^)]*)\)/.exec(corpo)![1].trim();
  assert.equal(params, "", `registrarMeuNumero recebe \`${params}\` do cliente — o dono, o nome e a finalidade são do servidor`);
  assert.doesNotMatch(corpo, /responsavelId/, "a action ainda mexe em responsavelId vindo de fora");
});

test("E10 · action: lê papel, uid e cadastro (nome, e-mail) NO SERVIDOR e entrega tudo a formNumeroPessoal", () => {
  const corpo = corpoRegistrarMeuNumero();
  const varDe = (fn: string) => {
    const direto = new RegExp(`const\\s+(\\w+)\\s*=\\s*await\\s+${fn}\\s*\\(\\s*\\)`).exec(corpo)?.[1];
    if (direto) return direto;
    const m = /const\s*\[([^\]]+)\]\s*=\s*await\s+Promise\.all\(\s*\[([\s\S]*?)\]\s*\)/.exec(corpo);
    if (!m) return undefined;
    const nomes = m[1].split(",").map((x) => x.trim());
    const leituras = m[2].split(",").map((x) => x.trim()).filter(Boolean);
    const i = leituras.findIndex((x) => new RegExp(`^${fn}\\s*\\(\\s*\\)$`).test(x));
    return i === -1 ? undefined : nomes[i];
  };
  const papel = varDe("lerPapelAtual");
  const uid = varDe("lerUidAtual");
  const nome = varDe("lerNomeAtual");
  assert.ok(papel, "a action não lê o papel no servidor (lerPapelAtual)");
  assert.ok(uid, "a action não lê o uid no servidor (lerUidAtual)");
  assert.ok(nome, "a action não lê o nome de quem cadastra no servidor (lerNomeAtual)");
  const chamada = /formNumeroPessoal\s*\(\s*\{([^}]*)\}\s*\)/.exec(corpo);
  assert.ok(chamada, "a action não monta o form por formNumeroPessoal({ ... })");
  const campo = (k: string) =>
    new RegExp(`\\b${k}\\s*:\\s*(\\w+)\\b`).exec(chamada![1])?.[1] ??
    (new RegExp(`(^|[\\s,])${k}([\\s,]|$)`).test(chamada![1]) ? k : null);
  assert.equal(campo("papel"), papel, "o papel entregue à regra não é o lido no servidor");
  assert.equal(campo("uid"), uid, "o uid entregue à regra não é o de lerUidAtual — o dono viria de outro lugar");
  // lerNomeAtual devolve { nome, email } do cadastro; os dois chegam à regra (fallback do E23)
  const esc = nome!.replace(/[$]/g, "\\$&");
  assert.match(chamada![1], new RegExp(`\\bnome\\s*:\\s*${esc}\\??\\.nome\\b`), "o nome entregue à regra não é o lido no servidor");
  assert.match(chamada![1], new RegExp(`\\bemail\\s*:\\s*${esc}\\??\\.email\\b`), "o e-mail entregue à regra não é o lido no servidor");
});

test("E11 · action: quem não pode registrar é recusado ANTES de qualquer escrita", () => {
  const corpo = corpoRegistrarMeuNumero();
  const form = /const\s+(\w+)\s*=\s*formNumeroPessoal\s*\(/.exec(corpo)?.[1];
  assert.ok(form, "o resultado de formNumeroPessoal não é guardado");
  const guarda = new RegExp(`if\\s*\\(\\s*!\\s*${form}\\s*\\)\\s*\\{?\\s*return\\s*\\{[^}]*ok\\s*:\\s*false`).exec(corpo);
  assert.ok(guarda, `sem \`if (!${form}) return { ok: false, ... }\` — marketing chegaria na porta`);
  const escrita = corpo.search(/registrarComIdLivre\s*\(|registrarEventoComReadback\s*\(/);
  assert.notEqual(escrita, -1, "a action não escreve nada");
  assert.ok(guarda.index < escrita, "a recusa vem DEPOIS da escrita");
});

test("E12 · action: tenta o próximo id livre com o payload DA TENTATIVA e devolve o canalId gravado", () => {
  const corpo = corpoRegistrarMeuNumero();
  const m = /registrarComIdLivre\s*\(\s*(\w+)\s*,\s*(?:async\s*)?\(?\s*(\w+)(?:\s*:\s*string)?\s*\)?\s*=>/.exec(corpo);
  assert.ok(m, "registrarMeuNumero não chama registrarComIdLivre(form, (canalId) => ...)");
  const [, form, param] = m;
  assert.match(corpo, new RegExp(`const\\s+${form}\\s*=\\s*formNumeroPessoal\\s*\\(`), "o form da escrita não é o de formNumeroPessoal");
  assert.match(
    corpo,
    new RegExp(`payloadCanalRegistrado\\(\\s*${form}\\s*,\\s*${param}\\s*\\)`),
    `o payload não é montado com o form do servidor e o id da tentativa (\`${param}\`)`,
  );
  assert.match(corpo, /tipo\s*:\s*["']canal_registrado["']/);
  assert.match(corpo, /return\s+(await\s+)?registrarComIdLivre\s*\(/, "registrarMeuNumero não devolve o canalId gravado");
});

test("E13 · lerNomeAtual existe no servidor, ao lado de lerUidAtual", () => {
  const dados = ler(DADOS_PORTA);
  assert.match(dados, /export\s+async\s+function\s+lerNomeAtual\s*\(\s*\)/, "dados/porta.ts não exporta lerNomeAtual()");
  const acoes = ler(ACTIONS);
  assert.match(acoes, /import\s*\{[^}]*\blerNomeAtual\b[^}]*\}\s*from\s*["']@\/components\/configuracoes\/dados\/porta["']/);
});

test("E21 · lerNomeAtual: nome e e-mail saem do cadastro (core), filtrados pelo uid de auth.getUser() — nunca de user_metadata", () => {
  const dados = ler(DADOS_PORTA);
  assert.match(dados, /export\s+async\s+function\s+lerNomeAtual\s*\(/, "dados/porta.ts não exporta lerNomeAtual() — a fonte do nome não existe");
  const corpo = corpoDaFuncao(dados, "export async function lerNomeAtual(");
  // o uid do filtro: variável de `await lerUidAtual()` (que lê auth.getUser()), ou o user.id que
  // sai de `auth.getUser()` no próprio corpo — direto ou por uma variável
  const filtro = /\.eq\(\s*["']id["']\s*,\s*([\w.?]+)\s*\)/.exec(corpo);
  assert.ok(filtro, "o cadastro não é filtrado por id — viria o nome de outra pessoa");
  const arg = filtro![1];
  const ehUserId = (x: string) => /^(\w+\??\.)*user\??\.id$/.test(x);
  const origem = new RegExp(`const\\s+${arg.replace(/[.?]/g, "\\$&")}\\s*=\\s*(await\\s+lerUidAtual\\s*\\(\\s*\\)|[\\w.?]+)`).exec(corpo)?.[1];
  const viaLerUid = origem !== undefined && /lerUidAtual/.test(origem);
  const viaAuth = /\.auth\.getUser\s*\(\s*\)/.test(corpo) && (ehUserId(arg) || (origem !== undefined && ehUserId(origem)));
  assert.ok(viaLerUid || viaAuth, `o filtro usa \`${arg}\`, que não é o uid de auth.getUser() nem de lerUidAtual()`);
  assert.match(
    corpo,
    /\.schema\(\s*["']core["']\s*\)\s*\.from\(\s*["'](usuario|v_membro)["']\s*\)/,
    "o nome não é lido do cadastro (core.usuario / core.v_membro)",
  );
  assert.match(corpo, /\.select\(\s*["'][^"']*\bnome\b[^"']*["']\s*\)/, "a leitura não pede a coluna nome");
  assert.match(corpo, /\.select\(\s*["'][^"']*\bemail\b[^"']*["']\s*\)/, "a leitura não pede o e-mail — o fallback do nome (E23) não teria de onde vir");
  assert.match(corpo, /\.(maybeSingle|single)\(\s*\)/, "leitura de uma linha só");
  assert.match(corpo, /return[^;\n]*\.nome\b/, "lerNomeAtual não devolve o nome lido — um `return null` fixo mataria a feature calada");
  assert.doesNotMatch(corpo, /user_metadata|raw_user_meta_data/, "user_metadata é editável pelo próprio usuário — não é fonte do nome do canal");
});

test("E14 · action: registrarCanal (o do oficial) recusa não oficial — o número pessoal só entra por registrarMeuNumero", () => {
  const corpo = corpoDaFuncao(ler(ACTIONS), "export async function registrarCanal(");
  const guarda = /if\s*\(\s*\w+\.provedor\s*===\s*["']nao_oficial["']\s*\)\s*\{?\s*return\s*\{[^}]*ok\s*:\s*false/.exec(corpo);
  assert.ok(guarda, "registrarCanal aceita não oficial — o cliente escolheria o dono pelo responsavelId");
  const escrita = corpo.search(/registrarComIdLivre\s*\(|registrarEventoComReadback\s*\(/);
  assert.ok(escrita === -1 || guarda.index < escrita, "a recusa do não oficial vem depois da escrita");
});

// ── o painel ──

test("E15 · painel: não tem seletor de pessoa, nem 'Para quê', nem Número, nem Departamento", () => {
  const sheet = ler(SHEET);
  for (const rotulo of ["De quem é o número", "Para quê", "Departamento", "Número"]) {
    assert.doesNotMatch(sheet, new RegExp(`label=["']${rotulo}["']`), `o painel ainda tem o campo "${rotulo}"`);
  }
  assert.doesNotMatch(sheet, /<Select\b/, "o painel ainda tem um Select");
  assert.doesNotMatch(sheet, /<Input\b/, "o painel ainda tem um campo de texto");
  assert.doesNotMatch(sheet, /\b(pessoaId|setPessoaId|setFinalidade|setDepartamento|setNumero)\b/, "o painel ainda guarda estado de campo que saiu");
  assert.doesNotMatch(sheet, /\b(estadoDoRegistro|estadoDoDepartamento|itensPessoas)\b/, "o painel ainda usa regra do formulário antigo");
});

test("E16 · painel: sem o aviso de ban — o seletor já diz o risco do não oficial", () => {
  const sheet = ler(SHEET);
  assert.doesNotMatch(sheet, /\{AVISO_RISCO_BAN\}/, "o aviso de ban ainda aparece no painel");
  assert.match(sheet, /Oficial \(WhatsApp Cloud API\)/, "o painel não oferece o oficial");
  assert.match(sheet, /Não oficial \(biblioteca\)/, "o painel não oferece o não oficial");
  assert.match(sheet, /pode ser banido/i, "o risco do não oficial sumiu da opção");
});
test("E17 · painel: escolher 'Não oficial' registra NA HORA — sem botão esperando campo", () => {
  const sheet = ler(SHEET);
  assert.match(sheet, /onClick=\{\s*registrarEParear\s*\}|onClick=\{\s*\(\)\s*=>\s*registrarEParear\(\s*\)\s*\}/, "a opção não oficial não dispara o registro");
  const corpo = trechoLocal(sheet, "registrarEParear", "fechar");
  assert.doesNotMatch(corpo, /if\s*\(\s*!\s*(pessoa|pronto)\b/, "registrarEParear ainda sai cedo esperando campo");
  assert.match(corpo, /if\s*\(\s*gravando\s*\)\s*return/, "clique duplo registraria dois canais — falta `if (gravando) return`");
});
test("E22 · painel: sem prévia do id — a tela não monta form nem tem nome para prever", () => {
  // Decisão do Diogo: o formulário tem SÓ o aviso e o botão. A prévia precisaria de um nome no
  // cliente, e o nome agora é do servidor; montar um form local só para a prévia reabre a porta
  // para o cliente decidir nome e dono.
  const sheet = ler(SHEET);
  assert.doesNotMatch(sheet, /\bprevisaoCanalId\b/, "o painel ainda pede a prévia do id");
  assert.doesNotMatch(sheet, /O id deste canal será/, "o painel ainda mostra a prévia do id");
  assert.doesNotMatch(sheet, /\bformDe\s*\(/, "o painel ainda monta um FormCanal local");
  assert.doesNotMatch(sheet, /\bFormCanal\b/, "o painel ainda conhece FormCanal — o form é do servidor");
  assert.doesNotMatch(sheet, /provedor\s*:\s*["']nao_oficial["']/, "o painel ainda monta um form de não oficial");
});

test("E18 · painel: registra por registrarMeuNumero(), sem mandar nada do cliente, e nunca por registrarCanal", () => {
  const sheet = ler(SHEET);
  assert.match(sheet, /await\s+registrarMeuNumero\s*\(\s*\)/, "o painel não chama registrarMeuNumero() sem argumentos");
  assert.doesNotMatch(sheet, /registrarCanal\s*\(/, "o painel ainda registra pelo registrarCanal, com form montado na tela");
  assert.doesNotMatch(sheet, /responsavelId/, "o painel ainda monta o dono do número");
});

// 16/09 (tarde): o formulário do OFICIAL foi para o painel e precisa do domínio de departamentos.
// O que continua proibido é o painel escolher DONO ou lotação do número pessoal.
test("E19 · tabela: não entrega ao painel pessoas nem lotações", () => {
  const tabela = ler(TABELA);
  const i = tabela.indexOf("<SheetNumeroLite");
  assert.notEqual(i, -1, "SheetNumeroLite sumiu da tabela");
  const tag = tagDeAbertura(tabela, i);
  for (const prop of ["pessoas", "minhasLotacoes"]) {
    assert.doesNotMatch(tag, new RegExp(`\\b${prop}=`), `o painel ainda recebe \`${prop}\` — o formulário enxuto não escolhe nada`);
  }
});

// ═══════════ F · painel com seletor, carregando e QR rápido (16/09, tarde) ═══════════

const FORM_OFICIAL = "../components/configuracoes/form-numero-oficial.tsx";

test("F1 · momentoInicialDoPainel: gestão escolhe o tipo; a fono vai direto para 'gerando'; quem não registra não abre", () => {
  const f = regra("momentoInicialDoPainel");
  assert.equal(f("admin"), "escolher");
  assert.equal(f("owner"), "escolher");
  assert.equal(f("membro"), "gerando");
  assert.equal(f("marketing"), null);
  assert.equal(f(null), null);
});

test("F2 · intervaloRelituraMs: sem QR ainda, relê a cada 1 s; com QR, a cada 5 s", () => {
  const f = regra("intervaloRelituraMs", ls, "components/configuracoes/regras/lite-sessao.ts");
  assert.equal(f("aguardando_qr", false, false), 1_000, "sem QR a tela esperava o ciclo de 5 s (medido: QR pronto às :23, mostrado às :29)");
  assert.equal(f("aguardando_qr", false, true), 5_000);
  assert.equal(f("aguardando_qr"), 5_000, "sem o terceiro argumento, o comportamento de antes");
  assert.equal(f("conectado", false, false), null, "conectado para de reler");
});

test("F3 · telaDoQr: 'gerando' enquanto grava ou enquanto o QR não chegou; depois qr, conectado ou erro", () => {
  const f = regra("telaDoQr", ls, "components/configuracoes/regras/lite-sessao.ts");
  assert.equal(f({ gravando: true, sessao: null, erro: null }), "gerando");
  assert.equal(f({ gravando: false, sessao: null, erro: null }), "gerando", "antes da primeira resposta do runtime");
  assert.equal(f({ gravando: false, sessao: { estado: "aguardando_qr", temQr: false, motivo: null }, erro: null }), "gerando");
  assert.equal(f({ gravando: false, sessao: { estado: "aguardando_qr", temQr: true, motivo: null }, erro: null }), "qr");
  assert.equal(f({ gravando: false, sessao: { estado: "conectado", temQr: false, motivo: null }, erro: null }), "conectado");
  assert.equal(f({ gravando: false, sessao: { estado: "desconectado", temQr: false, motivo: "recusado" }, erro: null }), "erro");
  assert.equal(f({ gravando: false, sessao: null, erro: "falhou" }), "erro");
});

test("F4 · painel: a primeira tela vem de momentoInicialDoPainel, e a fono já começa registrando", () => {
  const sheet = ler(SHEET);
  assert.match(sheet, /momentoInicialDoPainel\s*\(\s*meuPapel\s*\)/, "o painel não decide a primeira tela pelo papel");
  assert.match(sheet, /useEffect\([\s\S]{0,400}?registrarEParear\(\s*\)/, "a fono não começa a registrar ao abrir o painel");
});

test("F5 · painel: a tela 'gerando' diz que o QR está sendo gerado, e a tela vem de telaDoQr", () => {
  const sheet = ler(SHEET);
  assert.match(sheet, /telaDoQr\s*\(/, "o painel não usa telaDoQr");
  assert.match(sheet, /Gerando o QR/, "não há tela de carregamento do QR");
});

test("F6 · painel: a releitura sabe se o QR já chegou", () => {
  const sheet = ler(SHEET);
  const v = /const\s+(\w+)\s*=\s*Boolean\(\s*sessao\?\.qr\b[^)]*\)/.exec(sheet)?.[1];
  assert.ok(v, "o painel não deriva da sessão se o QR já chegou");
  assert.match(sheet, new RegExp(`intervaloRelituraMs\\(\\s*[^,)]+,\\s*[^,)]+,\\s*${v}\\s*\\)`), "o painel relê sem dizer se já tem QR — volta a esperar 5 s");
});

test("F7 · o formulário do oficial mora em form-numero-oficial.tsx, registra por registrarCanal e só oferece oficial", () => {
  const form = ler(FORM_OFICIAL);
  assert.match(form, /export\s+function\s+FormNumeroOficial\b/);
  assert.match(form, /registrarCanal\s*\(/);
  assert.doesNotMatch(form, /nao_oficial/, "o formulário do oficial ainda conhece o não oficial");
  const sheet = ler(SHEET);
  assert.match(sheet, /<FormNumeroOficial\b/, "o painel não desenha o formulário do oficial");
  assert.match(sheet, /momento\s*===\s*["']oficial["']/, "o formulário do oficial não depende do momento 'oficial'");
});

// ── Card 2e · removerCanal chama teardown ANTES do evento e para se falhar ──

test("N1 · removerCanal chama apagarInstanciaNoRuntime e confere o resultado antes do evento", () => {
  const acoes = ler("../app/(app)/configuracoes/canais/actions.ts");
  assert.match(acoes, /apagarInstanciaNoRuntime/, "removerCanal não importa/usa apagarInstanciaNoRuntime");
  const idxTeardown = acoes.indexOf("apagarInstanciaNoRuntime");
  const idxEvento = acoes.indexOf("canal_removido", idxTeardown);
  assert.ok(idxTeardown < idxEvento, "teardown tem que vir ANTES do canal_removido no código");
  assert.match(acoes, /teardown\.ok/, "removerCanal não verifica o resultado do teardown");
});
