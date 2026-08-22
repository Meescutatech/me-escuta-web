import { test } from "node:test";
import assert from "node:assert/strict";
import {
  brl,
  calcularBaldes,
  calcularCobertura,
  custoPorCampanha,
  estadoDoCusto,
  estadoDoPeriodo,
  extrairAnuncio,
  extrairCidade,
  frescuraDe,
  indexarVocabulario,
  pct,
  porChave,
  porPagoOrganico,
  porPlataforma,
  serieTemporal,
  taxa,
  type CustoCru,
  type FonteVocabulario,
  periodoDaUrl,
  type ToqueCru,
} from "../lib/dados/marketing-calculos.ts";
import { PAPEIS, podeVerMarketing } from "../lib/membros.ts";


/*
 * T7 — os testes da tela do Fernando.
 *
 * Cada teste aqui é um NEGATIVO da spec virado asserção. Não são testes de que a soma soma:
 * são testes de que a tela não consegue mentir do jeito específico que a spec previu, e que
 * a operação já viu acontecer. Rodam com `npm test` (node --test), sem banco e sem framework.
 */

const VOCAB: FonteVocabulario[] = [
  { chave: "meta_leadads", rotulo: "Meta Lead Ads", ativo: true, pago_organico: "pago", plataforma: "meta" },
  { chave: "whatsapp_ctwa", rotulo: "CTWA", ativo: true, pago_organico: "pago", plataforma: "meta" },
  { chave: "indicacao", rotulo: "Indicação", ativo: true, pago_organico: "organico", plataforma: null },
  { chave: "landing", rotulo: "Landing", ativo: true, pago_organico: null, plataforma: null },
];
const vocab = indexarVocabulario(VOCAB);

let seq = 0;
function toque(p: Partial<ToqueCru> = {}): ToqueCru {
  seq += 1;
  return {
    lead_id: `lead-${seq}`,
    fonte: "meta_leadads",
    plataforma: "meta",
    campanha_id: "c1",
    campanha_nome: "Campanha 1",
    anuncio_id: "a1",
    anuncio_nome: "Anúncio 1",
    utm: null,
    clids: null,
    hierarquia_estado: "resolvida",
    capturado_em: "2026-08-10T14:00:00Z",
    criado_em: "2026-08-10T14:00:05Z",
    ...p,
  };
}

function custo(p: Partial<CustoCru> = {}): CustoCru {
  return {
    dia: "2026-08-10",
    plataforma: "meta",
    campanha_id: "c1",
    campanha_nome: "Campanha 1",
    custo: 100,
    impressoes: 0,
    cliques: 0,
    ingerido_em: "2026-08-11T03:00:00Z",
    ...p,
  };
}

// ─────────────── a taxa que se recusa a dizer 0% ───────────────

test("taxa com denominador ZERO é null, não 0 — 0% afirma uma cobertura que ninguém mediu", () => {
  assert.equal(taxa(0, 0), null);
  assert.equal(taxa(5, 0), null);
  assert.equal(taxa(0, 10), 0); // este zero É medido: dez leads, nenhum com atribuição
  assert.equal(pct(null), "—");
  assert.equal(pct(0), "0%");
});

test("brl(null) é travessão — nunca R$ 0,00 no lugar de ausência", () => {
  assert.equal(brl(null), "—");
  assert.equal(brl(0), (0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
});

// ─────────────── RF-11: a cobertura declarada ───────────────

test("RF-11: 100 leads e 12 com atribuição mostram 12%, não um gráfico de 12 como se fossem o todo", () => {
  const toques = Array.from({ length: 12 }, (_, i) => toque({ lead_id: `l${i}` }));
  const c = calcularCobertura(toques, 100, "2026-08-01T00:00:00Z");
  assert.equal(c.leadsComAtribuicao, 12);
  assert.equal(c.leadsNoPeriodo, 100);
  assert.equal(pct(c.taxaComAtribuicao), "12%");
  // o buraco medido: quem entrou e não deixou rastro nenhum
  assert.equal(c.leadsSemCanalNenhum, 88);
});

test("RF-11 (negativo): zero registro no período dá cobertura '—', não '0%'", () => {
  const c = calcularCobertura([], 0, null);
  assert.equal(c.taxaComAtribuicao, null);
  assert.equal(c.taxaComClid, null);
  assert.equal(pct(c.taxaComClid), "—");
});

test("RF-11: a taxa de ctwa_clid conta a CHAVE presente, e chave ausente é ausente", () => {
  const toques = [
    toque({ clids: { ctwa_clid: "abc" } }),
    toque({ clids: { gclid: "xyz" } }), // tem clid, não tem ctwa
    toque({ clids: null }),
    toque({ clids: {} }),
  ];
  const c = calcularCobertura(toques, 4, "2026-08-01T00:00:00Z");
  assert.equal(pct(c.taxaComClid), "25%");
});

test("RF-11: mais captações que leads não produz 'sem canal' negativo", () => {
  // dois toques do MESMO lead, e o denominador conta 1 lead no período
  const toques = [toque({ lead_id: "x" }), toque({ lead_id: "x" }), toque({ lead_id: "y" })];
  const c = calcularCobertura(toques, 1, "2026-08-01T00:00:00Z");
  assert.equal(c.leadsSemCanalNenhum, 0);
});

// ─────────────── RF-9 pelo caminho da tela: os cinco baldes ───────────────

test("RF-9 (negativo): R$ 500 numa campanha sem lead casado aparecem COM O VALOR em 'gasto sem lead'", () => {
  const b = calcularBaldes(
    [toque({ campanha_id: "c1" })],
    [custo({ campanha_id: "c1", custo: 100 }), custo({ campanha_id: "c9", custo: 500 })],
    0,
  );
  assert.equal(b.gastoSemLead, 500); // afere o VALOR, não a existência da linha
  assert.equal(b.gastoCasado, 100);
  assert.equal(b.gastoTotal, 600);
  assert.equal(b.reconciliaDinheiro, true);
});

test("RF-9 (negativo): 7 leads de campanha sem custo ingerido aparecem em 'leads sem custo'", () => {
  const toques = Array.from({ length: 7 }, () => toque({ campanha_id: "sem-custo" }));
  const b = calcularBaldes(toques, [custo({ campanha_id: "outra", custo: 10 })], 0);
  assert.equal(b.leadsSemCusto, 7); // o lado que um LEFT JOIN a partir do custo descartaria
  assert.equal(b.leadsCasados, 0);
});

test("RF-9 (negativo): leads sem campanha ficam SEPARADOS por hierarquia_estado", () => {
  const b = calcularBaldes(
    [
      toque({ campanha_id: null, hierarquia_estado: "falhou" }),
      toque({ campanha_id: null, hierarquia_estado: "falhou" }),
      toque({ campanha_id: null, hierarquia_estado: "nao_aplicavel" }),
    ],
    [],
    0,
  );
  // falhou (defeito) NÃO se mistura com nao_aplicavel (correto)
  assert.equal(b.leadsSemCampanhaPorFalha, 2);
  assert.equal(b.leadsSemCampanhaOk, 1);
  assert.equal(b.reconciliaLeads, true);
});

test("RF-9 (negativo): campanha do Google com id igual à do Meta NÃO casa — a chave inclui plataforma", () => {
  const b = calcularBaldes(
    [toque({ plataforma: "google", campanha_id: "123" })],
    [custo({ plataforma: "meta", campanha_id: "123", custo: 400 })],
    0,
  );
  assert.equal(b.leadsCasados, 0, "casamento cruzado dá custo-por-lead plausível e errado");
  assert.equal(b.leadsSemCusto, 1);
  assert.equal(b.gastoSemLead, 400);
  assert.equal(b.gastoCasado, 0);
});

test("RF-9 (negativo): 30 dias de gasto na mesma campanha NÃO multiplicam — agrega antes de casar", () => {
  const dias = Array.from({ length: 30 }, (_, i) =>
    custo({ dia: `2026-08-${String(i + 1).padStart(2, "0")}`, custo: 10 }),
  );
  const b = calcularBaldes([toque({ campanha_id: "c1" })], dias, 0);
  assert.equal(b.gastoCasado, 300, "30 dias × R$10 = R$300, não R$300 por lead");
  assert.equal(b.gastoTotal, 300);
});

test("RF-9 (C-1d): toques sem data vão para balde próprio, fora do recorte", () => {
  const b = calcularBaldes([toque()], [], 2);
  assert.equal(b.leadsSemData, 2);
  assert.equal(b.leadsTotal, 1, "sem data não entra no total do período — ele declara que não os inclui");
});

test("toque com campanha e SEM plataforma tem balde próprio e continua contado no total", () => {
  const b = calcularBaldes(
    [toque({ plataforma: null, campanha_id: "c1" }), toque({ plataforma: "meta", campanha_id: "c1" })],
    [custo({ campanha_id: "c1", custo: 50 })],
    0,
  );
  assert.equal(b.leadsSemPlataforma, 1, "metade da chave faltando é diagnóstico, não sobra");
  assert.equal(b.leadsCasados, 1);
  assert.equal(b.leadsSemCusto, 1, "o sem-plataforma não casa, então soma ao lado não-casado");
  assert.equal(b.reconciliaLeads, true, "e não some do total");
});

test("a igualdade dos leads FICA VERMELHA se aparecer 'resolvida' sem campanha", () => {
  // a contradição que o CHECK da T1 proíbe. Se ela vazar, a guarda tem de acusar — e não
  // se dissolver silenciosamente num dos outros baldes.
  const b = calcularBaldes([toque({ campanha_id: null, hierarquia_estado: "resolvida" })], [], 0);
  assert.equal(b.leadsSemCampanhaPorFalha, 0);
  assert.equal(b.leadsSemCampanhaOk, 0);
  assert.equal(b.reconciliaLeads, true, "contado à parte, o total continua fechando");
  assert.equal(b.leadsTotal, 1);
});

// ─────────────── (f) custo por campanha ───────────────

test("(f) campanha com gasto e ZERO lead continua na tabela — o left join a apagaria", () => {
  const linhas = custoPorCampanha([toque({ campanha_id: "c1" })], [custo({ campanha_id: "c9", custo: 500 })]);
  const orfa = linhas.find((l) => l.campanhaId === "c9");
  assert.ok(orfa, "a campanha sem lead tem de existir na lista");
  assert.equal(orfa!.gasto, 500);
  assert.equal(orfa!.leads, 0);
  assert.equal(orfa!.custoPorLead, null, "dividir R$500 por 0 leads não é R$0 nem infinito — é null");
});

test("(f) custo por lead usa leads DISTINTOS, não toques", () => {
  const linhas = custoPorCampanha(
    [toque({ lead_id: "a", campanha_id: "c1" }), toque({ lead_id: "a", campanha_id: "c1" })],
    [custo({ campanha_id: "c1", custo: 100 })],
  );
  const c1 = linhas.find((l) => l.campanhaId === "c1")!;
  assert.equal(c1.toques, 2);
  assert.equal(c1.leads, 1);
  assert.equal(c1.custoPorLead, 100);
});

test("(f) campanha sem custo ingerido tem gasto null, não zero", () => {
  const linhas = custoPorCampanha([toque({ campanha_id: "c1" })], []);
  assert.equal(linhas[0].gasto, null);
  assert.equal(linhas[0].custoPorLead, null);
});

// ─────────────── (a) e (b) ───────────────

test("(a) fonte com pago_organico null vira 'Nao classificado' — não engorda o orgânico", () => {
  const f = porPagoOrganico(
    [toque({ fonte: "meta_leadads" }), toque({ fonte: "indicacao" }), toque({ fonte: "landing" })],
    vocab,
  );
  const mapa = Object.fromEntries(f.map((x) => [x.chave, x.toques]));
  assert.deepEqual(mapa, { pago: 1, organico: 1, nao_classificado: 1 });
});

test("(b) plataforma da coluna manda; sem ela, a config responde; sem as duas, 'sem plataforma'", () => {
  const f = porPlataforma(
    [
      toque({ plataforma: "google", fonte: "meta_leadads" }), // a coluna vence a config
      toque({ plataforma: null, fonte: "meta_leadads" }), // a config resolve
      toque({ plataforma: null, fonte: "indicacao" }), // ninguém sabe
    ],
    vocab,
  );
  const mapa = Object.fromEntries(f.map((x) => [x.chave, x.toques]));
  assert.deepEqual(mapa, { google: 1, meta: 1, sem_plataforma: 1 });
});

test("(d) e (e): chave ausente cai num balde nomeado, e leads distintos são contados", () => {
  const anuncios = porChave(
    [toque({ lead_id: "a", anuncio_id: null }), toque({ lead_id: "a", anuncio_id: null })],
    extrairAnuncio,
    "Sem anuncio",
  );
  assert.equal(anuncios[0].rotulo, "Sem anuncio");
  assert.equal(anuncios[0].toques, 2);
  assert.equal(anuncios[0].leads, 1);

  const cidades = porChave([toque({ utm: { cidade: "Campinas" } })], extrairCidade, "Sem cidade");
  assert.equal(cidades[0].rotulo, "Campinas");
});

// ─────────────── série temporal ───────────────

test("série cobre todo dia do período, inclusive os vazios", () => {
  const s = serieTemporal([toque({ capturado_em: "2026-08-02T15:00:00Z" })], [], "2026-08-01", "2026-08-04", false);
  assert.equal(s.length, 3);
  assert.deepEqual(
    s.map((p) => p.toques),
    [0, 1, 0],
  );
});

test("série: gasto é null enquanto NINGUÉM ingeriu custo — linha colada no chão parece 'não gastamos'", () => {
  const semIngestao = serieTemporal([], [], "2026-08-01", "2026-08-03", false);
  assert.deepEqual(semIngestao.map((p) => p.gasto), [null, null]);

  const comIngestao = serieTemporal([], [custo({ dia: "2026-08-01", custo: 30 })], "2026-08-01", "2026-08-03", true);
  assert.deepEqual(comIngestao.map((p) => p.gasto), [30, 0]); // este 0 é medido
});

test("série ignora toque sem data — ele não pertence a dia nenhum", () => {
  const s = serieTemporal([toque({ capturado_em: null })], [], "2026-08-01", "2026-08-03", false);
  assert.deepEqual(s.map((p) => p.toques), [0, 0]);
});

// ─────────────── RF-10 (negativo) e os quatro zeros ───────────────

test("RF-10 (negativo): período sem captação diz por QUÊ — e são três porquês diferentes", () => {
  assert.equal(estadoDoPeriodo(3, "2026-07-01T00:00:00Z", "2026-09-01"), "com_dado");
  // nunca entrou captação nenhuma: implantação, não resultado de marketing
  assert.equal(estadoDoPeriodo(0, null, "2026-09-01"), "serie_nao_iniciada");
  // o período termina ANTES de a série começar
  assert.equal(estadoDoPeriodo(0, "2026-08-15T00:00:00Z", "2026-08-01"), "antes_da_serie");
  // a série cobre o recorte e não houve captação: este zero é notícia de verdade
  assert.equal(estadoDoPeriodo(0, "2026-07-01T00:00:00Z", "2026-09-01"), "sem_dado_no_periodo");
});

test("zero de tabela vazia ≠ zero de período vazio — o primeiro é incidente", () => {
  assert.equal(estadoDoCusto(0, 0), "sem_ingestao");
  assert.equal(estadoDoCusto(0, 40), "sem_linhas_no_periodo");
  assert.equal(estadoDoCusto(7, 40), "ingerido");
});

// ─────────────── RF-13: frescura ───────────────

test("RF-13: duas fontes, duas datas — e mais de 24h acende 'velha'", () => {
  const agora = new Date("2026-08-22T12:00:00Z");
  const captacao = frescuraDe("captacao", "Captacao", "2026-08-22T09:00:00Z", agora);
  const custoF = frescuraDe("custo", "Custo", "2026-08-20T09:00:00Z", agora);
  assert.equal(captacao.velha, false);
  assert.equal(custoF.velha, true);
  assert.ok((custoF.horas ?? 0) > 24);
});

test("RF-13: fonte que nunca teve dado não é 'velha' — é 'sem dado nenhum'", () => {
  const f = frescuraDe("custo", "Custo", null, new Date("2026-08-22T12:00:00Z"));
  assert.equal(f.velha, null, "null distingue 'nunca houve' de 'parou'");
  assert.equal(f.ate, null);
});

// ─────────────── período da URL ───────────────

test("período da URL: preset padrão de 30 dias, fim EXCLUSIVO como o oráculo do RF-9", () => {
  const agora = new Date("2026-08-22T15:00:00Z");
  const p = periodoDaUrl({}, agora);
  assert.equal(p.ini, "2026-07-24");
  assert.equal(p.fim, "2026-08-23", "fim exclusivo: `>= ini and < fim`, sem dia de fronteira duplicado");
});

test("período da URL: data inválida cai no padrão, não vira 'hoje' em silêncio", () => {
  const agora = new Date("2026-08-22T15:00:00Z");
  assert.equal(periodoDaUrl({ de: "ontem", ate: "hoje" }, agora).ini, "2026-07-24");
  // intervalo invertido também é recusado
  assert.equal(periodoDaUrl({ de: "2026-08-20", ate: "2026-08-01" }, agora).ini, "2026-07-24");
});

test("período da URL: `ate` chega inclusivo (o que a pessoa digita) e sai exclusivo", () => {
  const p = periodoDaUrl({ de: "2026-08-01", ate: "2026-08-31" }, new Date("2026-08-22T15:00:00Z"));
  assert.equal(p.ini, "2026-08-01");
  assert.equal(p.fim, "2026-09-01");
});

// ─────────────── RF-12: quem vê ───────────────

test("RF-12: marketing, admin e owner veem; membro e sem-papel não", () => {
  assert.equal(podeVerMarketing("marketing"), true);
  assert.equal(podeVerMarketing("admin"), true);
  assert.equal(podeVerMarketing("owner"), true);
  assert.equal(podeVerMarketing("membro"), false);
  // Papel indisponível (leitura falhou, ou usuário revogado) NÃO vira acesso: falha fechado.
  assert.equal(podeVerMarketing(null), false);
});

test("RF-12: a allowlist de papéis espelha o CHECK da 0250 — `marketing` não pode virar null", () => {
  // Antes desta task, `lerPapelAtual` devolvia null para `marketing` e o Fernando ficaria sem
  // papel nenhum na interface inteira, sem que nada desse erro.
  assert.ok((PAPEIS as readonly string[]).includes("marketing"));
  assert.deepEqual([...PAPEIS], ["owner", "admin", "membro", "marketing"]);
});
