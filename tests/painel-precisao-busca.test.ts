import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MINIMO_DECISOES_PARA_REGUA,
  amostraFraca,
  precisao,
  precisaoGeral,
  precisaoPorAgente,
  STATUS_DECIDIDOS,
} from "../lib/dados/dashboard-calculos.ts";
import {
  DIAS_LEDGER_PARADO,
  diasDesde,
  lacunasDoPainel,
} from "../lib/dados/dashboard-lacunas.ts";
import {
  COLUNAS_CARD,
  MINIMO_BUSCA,
  TETO_BUSCA,
  planoBusca,
  recortarBusca,
  termoSeguro,
} from "../lib/dados/funil-calculos.ts";
import { buscaCasa } from "../lib/dados/funil-filtros.ts";

/*
 * R23 · Trilha E — testes da matemática nova do painel (RF-15.3/15.5) e da busca no servidor.
 *
 * Nenhum I/O: a busca constrói um PLANO puro (funil-calculos.ts) que a camada de leitura executa.
 * É o que permite afirmar coisas que o olho não vê no código — em especial uma AUSÊNCIA: que o
 * plano não filtra por etapa, que é justamente o defeito que a busca existe para consertar.
 * A prova de ponta a ponta contra o banco real fica no portão (scripts/portao-r23-e-busca.mjs).
 */

// ─────────────── precisão por agente (RF-15.3) ───────────────

test("fórmula: precisão = aprovadas ÷ decididas, e decididas exclui pendente e obsoleta", () => {
  const linhas = [
    { agente: "jarvis", status: "aprovada" },
    { agente: "jarvis", status: "aprovada" },
    { agente: "jarvis", status: "corrigida" },
    { agente: "jarvis", status: "rejeitada" },
    { agente: "jarvis", status: "pendente" }, // fora: ninguém julgou
    { agente: "jarvis", status: "obsoleta" }, // fora: o tempo descartou, não é acerto nem erro
  ];
  const [j] = precisaoPorAgente(linhas);
  assert.equal(j.aprovadas, 2);
  assert.equal(j.corrigidas, 1);
  assert.equal(j.rejeitadas, 1);
  assert.equal(j.decididas, 4, "pendente e obsoleta NÃO entram no denominador");
  assert.equal(j.pct, 50); // 2/4
});

test("'corrigida' conta como falha da autonomia — é o ponto da métrica", () => {
  // Um agente cujas 10 sugestões foram todas aceitas MAS todas editadas não é um agente autônomo:
  // sem o humano corrigindo, as 10 teriam saído erradas. Precisão = 0%, não 100%.
  const so = precisaoPorAgente(Array.from({ length: 10 }, () => ({ agente: "clara", status: "corrigida" })));
  assert.equal(so[0].pct, 0);
  assert.equal(so[0].decididas, 10);
});

test("sem decisão nenhuma não existe precisão: null, nunca 0%", () => {
  assert.equal(precisao(0, 0), null);
  assert.deepEqual(precisaoPorAgente([{ agente: "x", status: "pendente" }]), []);
});

test("geral soma as PARTES, não a média das porcentagens", () => {
  // 1/1 (100%) e 0/99 (0%): a média das % daria 50%; a conta certa é 1/100 = 1%.
  const agentes = precisaoPorAgente([
    { agente: "a", status: "aprovada" },
    ...Array.from({ length: 99 }, () => ({ agente: "b", status: "rejeitada" })),
  ]);
  const g = precisaoGeral(agentes);
  assert.equal(g.decididas, 100);
  assert.equal(g.aprovadas, 1);
  assert.equal(g.pct, 1);
});

test("ordem: pior precisão primeiro — a régua de autonomia lê de cima para baixo", () => {
  const ordenados = precisaoPorAgente([
    { agente: "bom", status: "aprovada" },
    { agente: "ruim", status: "rejeitada" },
    { agente: "meio", status: "aprovada" },
    { agente: "meio", status: "rejeitada" },
  ]).map((a) => a.agente);
  assert.deepEqual(ordenados, ["ruim", "meio", "bom"]); // 0% → 50% → 100%
});

test("agente ausente vira 'sem agente' em vez de sumir da conta", () => {
  const r = precisaoPorAgente([{ agente: null, status: "aprovada" }, { status: "rejeitada" }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].agente, "sem agente");
  assert.equal(r[0].decididas, 2);
});

test("amostra fraca é marcada, não escondida", () => {
  const poucas = precisaoPorAgente(
    Array.from({ length: MINIMO_DECISOES_PARA_REGUA - 1 }, () => ({ agente: "a", status: "aprovada" })),
  )[0];
  const muitas = precisaoPorAgente(
    Array.from({ length: MINIMO_DECISOES_PARA_REGUA }, () => ({ agente: "a", status: "aprovada" })),
  )[0];
  assert.equal(amostraFraca(poucas), true);
  assert.equal(amostraFraca(muitas), false);
  assert.equal(poucas.pct, 100, "a % continua sendo mostrada — marcada, não omitida");
});

test("STATUS_DECIDIDOS é o filtro que vai ao banco e casa com a constraint do schema", () => {
  // core.sugestao_ia_status_check: pendente|aprovada|corrigida|rejeitada|obsoleta
  assert.deepEqual([...STATUS_DECIDIDOS].sort(), ["aprovada", "corrigida", "rejeitada"]);
});

// ─────────────── o que não está sendo medido (RF-15.5) ───────────────

const AGORA = new Date("2026-08-17T12:00:00-03:00");

test("as duas lacunas de escopo (F16/F17) aparecem sempre", () => {
  const l = lacunasDoPainel({
    ultimoLeadCriadoEm: AGORA.toISOString(),
    saudeFluxoDisponivel: true,
    decisoesDeSugestao: 30,
    agora: AGORA,
  });
  const titulos = l.map((x) => x.titulo);
  assert.ok(titulos.includes("Valor por etapa"));
  assert.ok(titulos.includes("Atribuição de origem"));
  assert.equal(l.length, 2, "com tudo saudável, só as lacunas de escopo restam");
});

test("ledger parado acusa 'leads novos' e 'funil do mês' — o zero não pode responder sozinho", () => {
  const l = lacunasDoPainel({
    ultimoLeadCriadoEm: "2026-07-22T11:10:41Z", // o lead mais novo real do ledger
    saudeFluxoDisponivel: true,
    decisoesDeSugestao: 32,
    agora: AGORA,
  });
  const titulos = l.map((x) => x.titulo);
  assert.ok(titulos.includes("Leads novos"));
  assert.ok(titulos.includes("Funil do mês (agendadas · realizadas · testes · vendas)"));
  const leadsNovos = l.find((x) => x.titulo === "Leads novos")!;
  assert.match(leadsNovos.porque, /26 dias/); // 22/07 → 17/08
  assert.equal(leadsNovos.origem, "dado-ausente");
});

test("uma lacuna resolvida SOME da lista — senão o operador aprende a ignorar a lista inteira", () => {
  const base = { ultimoLeadCriadoEm: AGORA.toISOString(), decisoesDeSugestao: 32, agora: AGORA };
  const semView = lacunasDoPainel({ ...base, saudeFluxoDisponivel: false });
  const comView = lacunasDoPainel({ ...base, saudeFluxoDisponivel: true });
  assert.ok(semView.some((x) => x.titulo === "Saúde do fluxo"));
  assert.ok(!comView.some((x) => x.titulo === "Saúde do fluxo"));
});

test("a borda de DIAS_LEDGER_PARADO é fechada embaixo", () => {
  const emDias = (d: number) => new Date(AGORA.getTime() - d * 86400_000).toISOString();
  const tem = (d: number) =>
    lacunasDoPainel({
      ultimoLeadCriadoEm: emDias(d),
      saudeFluxoDisponivel: true,
      decisoesDeSugestao: 1,
      agora: AGORA,
    }).some((x) => x.titulo === "Leads novos");
  assert.equal(tem(DIAS_LEDGER_PARADO - 1), false);
  assert.equal(tem(DIAS_LEDGER_PARADO), true);
});

test("diasDesde: data ausente ou inválida não vira 0 dias", () => {
  assert.equal(diasDesde(null, AGORA), null);
  assert.equal(diasDesde("não é data", AGORA), null);
  assert.equal(diasDesde(AGORA.toISOString(), AGORA), 0);
});

// ─────────────── busca no servidor: o PLANO da consulta ───────────────

test("o plano NÃO tem filtro de etapa — a ausência é o que acha os 582 arquivados", () => {
  const p = planoBusca("Adelia")!;
  assert.ok(p);
  // Afirmar uma AUSÊNCIA: o plano só tem estas três chaves, então não há onde um filtro de etapa
  // se esconder. Se alguém acrescentar um `etapas: [...]` amanhã, este teste cai — que é o ponto.
  assert.deepEqual(Object.keys(p).sort(), ["colunas", "limite", "or"]);
  // e o único predicado que existe (o `or`) não menciona etapa
  assert.ok(!/etapa/.test(p.or), `o or filtrou por etapa: ${p.or}`);
  // `etapa` aparece em `colunas` de propósito — é lida para EXIBIR de onde o lead veio na faixa
  // de achados. Ler a etapa e filtrar por ela são coisas opostas.
  assert.ok(p.colunas.split(",").includes("etapa"));
});

test("busca por nome E por telefone; máscara vira dígitos a partir de 3", () => {
  const p = planoBusca("(27) 99831")!;
  assert.match(p.or, /nome\.ilike/);
  assert.match(p.or, /telefone\.ilike/);
  assert.match(p.or, /2799831/, "os dígitos sem máscara viram uma condição própria");
  assert.equal(p.or.split(",").length, 3);
});

test("menos de 3 dígitos não vira condição de telefone — casaria com quase todo número", () => {
  assert.equal(planoBusca("99")!.or.split(",").length, 2);
});

test("termo já só de dígitos não duplica a condição de telefone", () => {
  // "99831" == seus próprios dígitos: a 3ª condição seria idêntica à 2ª, e a consulta pagaria por ela
  assert.equal(planoBusca("99831")!.or.split(",").length, 2);
});

test("termo curto demais não vira plano — não vale a ida ao banco", () => {
  assert.equal(planoBusca("a"), null);
  assert.equal(planoBusca("  "), null);
  assert.equal(MINIMO_BUSCA, 2);
  assert.ok(planoBusca("ad") != null);
});

test("vírgula e parêntese no termo não quebram o `or` do PostgREST", () => {
  const p = planoBusca("Silva, Maria (mãe)")!;
  // sem escape, a vírgula do nome viraria condição a mais: a query não quebra, ela muda de sentido
  assert.equal(p.or.split(",").length, 2, `a vírgula vazou: ${p.or}`);
  assert.ok(!p.or.includes("("), "parêntese fecharia o grupo do or()");
  assert.match(p.or, /Silva  Maria/); // vírgula e parêntese viram espaço, o nome continua buscável
});

test("termoSeguro neutraliza também o coringa `*` e a barra invertida", () => {
  assert.ok(!termoSeguro("a*b\\c").includes("*"));
  assert.ok(!termoSeguro("a*b\\c").includes("\\"));
});

test("o plano lê as MESMAS colunas do board — um lead não pode ter duas caras", () => {
  assert.equal(planoBusca("Adelia")!.colunas, COLUNAS_CARD);
  for (const c of ["lead_id", "nome", "telefone", "etapa", "dono_id", "tags"]) {
    assert.ok(COLUNAS_CARD.split(",").includes(c), `falta ${c}`);
  }
});

test("teto+1 é o detector de 'há mais' — e o recorte corta no teto", () => {
  assert.equal(planoBusca("Lead")!.limite, TETO_BUSCA + 1);
  const acima = recortarBusca(Array.from({ length: TETO_BUSCA + 1 }, (_, i) => i));
  assert.equal(acima.truncado, true);
  assert.equal(acima.cards.length, TETO_BUSCA);
});

test("no teto exato NÃO é truncado — o +1 é o que distingue", () => {
  const exato = recortarBusca(Array.from({ length: TETO_BUSCA }, (_, i) => i));
  assert.equal(exato.truncado, false);
  assert.equal(exato.cards.length, TETO_BUSCA);
});

test("a regra de dígitos do servidor é a MESMA de buscaCasa (filtro do cliente)", () => {
  // As duas dividem a tela: um lead que a faixa acha e o board não mostraria — ou o contrário —
  // é a UI se contradizendo na mesma tela.
  const card = { nome: "Adelia Dos Santos", telefone: "5527998316220" };
  for (const termo of ["adelia", "99831", "(27) 99831", "Adelia Dos"]) {
    const p = planoBusca(termo)!;
    assert.ok(p, `${termo} devia virar plano`);
    assert.equal(buscaCasa(card, termo), true, `buscaCasa recusou "${termo}" que o servidor acharia`);
  }
  assert.equal(buscaCasa(card, "zzz"), false);
});
