import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arvoreOrigem,
  brl,
  estadoDoCusto,
  estadoDoPeriodo,
  funilPorOrigem,
  gastoPorCampanha,
  indexarVocabulario,
  montarVisao,
  nosDoNivel,
  pct,
  periodoDaUrl,
  primeiroToquePorLead,
  resolverMarcos,
  serieLeadsPorDia,
  tabelaCampanhas,
  taxa,
  type CustoCru,
  type EtapaConfig,
  type FonteVocabulario,
  type ToqueCru,
} from "../lib/dados/marketing-calculos.ts";
import { DIAS_ENSAIO, entradaDeEnsaio, gerarEnsaio } from "../lib/dados/marketing-ensaio.ts";
import { PAPEIS, podeVerMarketing } from "../lib/membros.ts";

/*
 * Marketing — testes de calculo PUROS (sem banco). Cada um e um jeito especifico de a tela
 * mentir, virado em assercao: lead contado duas vezes, gasto multiplicado por dia, CPL com
 * zero no denominador, zero onde o certo e "—".
 */

const VOCAB: FonteVocabulario[] = [
  { chave: "meta_leadads", rotulo: "Meta Lead Ads", ativo: true, pago_organico: "pago", plataforma: "meta" },
  { chave: "google_ads", rotulo: "Google Ads", ativo: true, pago_organico: "pago", plataforma: "google" },
  { chave: "indicacao", rotulo: "Indicacao", ativo: true, pago_organico: "organico", plataforma: null },
  { chave: "landing", rotulo: "Landing", ativo: true, pago_organico: null, plataforma: null },
];
const vocab = indexarVocabulario(VOCAB);

const ETAPAS: EtapaConfig[] = [
  { chave: "novo", nome: "Novo", ordem: 1, tipo: "aberto" },
  { chave: "qualificando", nome: "Qualificando", ordem: 2, tipo: "aberto" },
  { chave: "qualificado", nome: "Qualificado", ordem: 40, tipo: "aberto" },
  { chave: "audiometria_realizada", nome: "Audiometria", ordem: 70, tipo: "aberto" },
  { chave: "proposta", nome: "Proposta", ordem: 80, tipo: "aberto" },
  { chave: "ganho", nome: "Ganho", ordem: 90, tipo: "ganho" },
  { chave: "perdido", nome: "Perdido", ordem: 91, tipo: "perdido" },
];

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
    anuncio_nome: "Anuncio 1",
    utm: { cidade: "Campinas" },
    clids: null,
    hierarquia_estado: "resolvida",
    capturado_em: "2026-08-10T14:00:00Z",
    criado_em: "2026-08-10T14:00:05Z",
    ...p,
  };
}
function custo(p: Partial<CustoCru> = {}): CustoCru {
  return { dia: "2026-08-10", plataforma: "meta", campanha_id: "c1", campanha_nome: "Campanha 1", custo: "100.00", impressoes: 10, cliques: 2, ingerido_em: "2026-08-11T06:00:00Z", ...p };
}
const organico = (p: Partial<ToqueCru> = {}) =>
  toque({ fonte: "indicacao", plataforma: null, campanha_id: null, campanha_nome: null, anuncio_id: null, anuncio_nome: null, utm: null, hierarquia_estado: "nao_aplicavel", ...p });

// ─── formatos ───

test("taxa: denominador zero e null, nunca 0%", () => {
  assert.equal(taxa(0, 0), null);
  assert.equal(taxa(null, 10), null);
  assert.equal(taxa(3, 12), 0.25);
  assert.equal(pct(null), "—");
  assert.equal(pct(0.25), "25%");
  assert.equal(brl(null), "—");
});

test("periodoDaUrl: preset e intervalo livre, data invalida cai no padrao de 30 dias", () => {
  const agora = new Date("2026-08-27T15:00:00-03:00");
  const p30 = periodoDaUrl({}, agora);
  assert.equal(p30.preset, "30d");
  assert.equal(p30.ini, "2026-07-29");
  assert.equal(p30.fim, "2026-08-28");
  assert.equal(periodoDaUrl({ p: "7d" }, agora).ini, "2026-08-21");
  assert.equal(periodoDaUrl({ p: "90d" }, agora).ini, "2026-05-30");
  const livre = periodoDaUrl({ de: "2026-08-01", ate: "2026-08-10" }, agora);
  assert.equal(livre.preset, null);
  assert.equal(livre.fim, "2026-08-11");
  assert.equal(periodoDaUrl({ de: "10/08", ate: "2026-08-10" }, agora).preset, "30d");
});

// ─── origem ───

test("primeiroToquePorLead: o lead conta uma vez, na origem mais antiga", () => {
  const t1 = toque({ lead_id: "L", capturado_em: "2026-08-12T10:00:00Z", campanha_id: "c2" });
  const t2 = toque({ lead_id: "L", capturado_em: "2026-08-10T10:00:00Z", campanha_id: "c1" });
  const origens = primeiroToquePorLead([t1, t2]);
  assert.equal(origens.size, 1);
  assert.equal(origens.get("L")?.campanha_id, "c1");
});

test("arvoreOrigem: balde -> plataforma -> campanha -> anuncio, leads sem dupla contagem", () => {
  const toques = [
    toque({ lead_id: "a" }),
    toque({ lead_id: "a", anuncio_id: "a2", anuncio_nome: "Anuncio 2" }), // segundo toque do mesmo lead
    toque({ lead_id: "b", anuncio_id: "a2", anuncio_nome: "Anuncio 2", utm: { cidade: "Jundiai" } }),
    toque({ lead_id: "c", fonte: "google_ads", plataforma: "google", campanha_id: "g1", campanha_nome: "Pesquisa" }),
    organico({ lead_id: "d" }),
    organico({ lead_id: "e", fonte: "landing" }),
  ];
  const arvore = arvoreOrigem(toques, [], vocab);
  assert.deepEqual(
    arvore.map((n) => [n.chave, n.leads]),
    [
      ["pago", 3],
      ["organico", 1],
      ["nao_classificado", 1],
    ],
  );
  const pago = arvore[0];
  assert.deepEqual(pago.filhos.map((n) => [n.chave, n.leads]), [["meta", 2], ["google", 1]]);
  const c1 = pago.filhos[0].filhos[0];
  assert.equal(c1.rotulo, "Campanha 1");
  assert.equal(c1.leads, 2);
  assert.deepEqual(c1.cidades, ["Campinas", "Jundiai"]);
  assert.deepEqual(c1.filhos.map((n) => [n.chave, n.leads]), [["a1", 1], ["a2", 1]]);
  assert.equal(pago.fracao, 3 / 5);
  // Organico nao tem plataforma: o filho e a fonte.
  assert.equal(arvore[1].filhos[0].rotulo, "Indicacao");
  assert.equal(arvore[1].gasto, null);
});

test("arvoreOrigem: gasto agrega por campanha (nao por dia) e sobe pela arvore; CPL so onde ha lead", () => {
  const toques = [toque({ lead_id: "a" }), toque({ lead_id: "b" })];
  const custos = [custo({ dia: "2026-08-10", custo: "100" }), custo({ dia: "2026-08-11", custo: "50" }), custo({ campanha_id: "c9", campanha_nome: "Sem lead", custo: "30" })];
  const arvore = arvoreOrigem(toques, custos, vocab);
  const meta = arvore[0].filhos[0];
  assert.equal(meta.gasto, 180);
  assert.equal(arvore[0].gasto, 180);
  const campanhas = nosDoNivel(arvore, "campanha");
  const c1 = campanhas.find((c) => c.chave === "c1")!;
  assert.equal(c1.gasto, 150);
  assert.equal(c1.cpl, 75);
  const c9 = campanhas.find((c) => c.chave === "c9")!;
  assert.equal(c9.leads, 0);
  assert.equal(c9.gasto, 30);
  assert.equal(c9.cpl, null);
});

test("gastoPorCampanha: id igual em plataformas diferentes nao casa", () => {
  const g = gastoPorCampanha([custo({ plataforma: "meta", campanha_id: "1", custo: 10 }), custo({ plataforma: "google", campanha_id: "1", custo: 20 })]);
  assert.equal(g.size, 2);
});

test("arvoreOrigem: sem vocabulario, tudo cai em nao classificado — nunca inventa pago", () => {
  const arvore = arvoreOrigem([toque(), organico()], [], new Map());
  assert.deepEqual(arvore.map((n) => n.chave), ["nao_classificado"]);
});

test("tabelaCampanhas: ordena por gasto e omite o balde 'sem campanha'", () => {
  const toques = [toque({ lead_id: "a" }), toque({ lead_id: "b", campanha_id: null, campanha_nome: null, anuncio_id: null, hierarquia_estado: "falhou" })];
  const custos = [custo({ custo: 10 }), custo({ campanha_id: "c2", campanha_nome: "Dois", custo: 90 })];
  const linhas = tabelaCampanhas(arvoreOrigem(toques, custos, vocab));
  assert.deepEqual(linhas.map((l) => l.campanhaId), ["c2", "c1"]);
  assert.equal(linhas[1].cpl, 10);
});

// ─── serie ───

test("serieLeadsPorDia: cobre todos os dias (vazios inclusive), por plataforma, no fuso -03", () => {
  const toques = [
    toque({ lead_id: "a", capturado_em: "2026-08-11T01:30:00Z" }), // 10/08 22:30 em SP
    toque({ lead_id: "b", fonte: "google_ads", plataforma: "google", capturado_em: "2026-08-11T12:00:00Z" }),
    organico({ lead_id: "c", capturado_em: "2026-08-11T12:00:00Z" }),
    toque({ lead_id: "d", capturado_em: null }),
  ];
  const serie = serieLeadsPorDia(toques, vocab, "2026-08-10", "2026-08-13");
  assert.equal(serie.length, 3);
  assert.deepEqual(serie.map((p) => p.total), [1, 2, 0]);
  assert.equal(serie[0].meta, 1);
  assert.equal(serie[1].google, 1);
  assert.equal(serie[1].organico, 1);
  assert.equal(serie[0].rotulo, "seg 10/08");
});

// ─── funil por origem ───

test("resolverMarcos: usa a chave que existe no funil vigente; sem etapa, marco e null", () => {
  const m = resolverMarcos(ETAPAS);
  assert.deepEqual(m.chave, { qualificado: "qualificado", consulta: "audiometria_realizada", venda: "ganho" });
  const so = resolverMarcos([{ chave: "novo", nome: "Novo", ordem: 1, tipo: "aberto" }, { chave: "fechado", nome: "Fechado", ordem: 9, tipo: "ganho" }]);
  assert.equal(so.ordem.qualificado, null);
  assert.equal(so.chave.venda, "fechado");
});

test("funilPorOrigem: etapa atual conta para todos os marcos anteriores; perdido em coluna propria", () => {
  const toques = [
    toque({ lead_id: "a" }),
    toque({ lead_id: "b" }),
    toque({ lead_id: "c" }),
    toque({ lead_id: "d" }),
    toque({ lead_id: "e", fonte: "google_ads", plataforma: "google" }),
    organico({ lead_id: "f" }),
  ];
  const etapaPorLead = new Map([
    ["a", "novo"],
    ["b", "proposta"], // passou por qualificado e consulta
    ["c", "ganho"],
    ["d", "perdido"],
    ["e", "qualificado"],
    ["f", "sem_etapa_conhecida"],
  ]);
  const linhas = funilPorOrigem(toques, etapaPorLead, ETAPAS, vocab);
  assert.deepEqual(linhas.map((l) => l.rotulo), ["Meta", "Google", "Organico"]);
  const meta = linhas[0];
  assert.equal(meta.leads, 4);
  assert.deepEqual(meta.marcos, { qualificado: 2, consulta: 2, venda: 1 });
  assert.equal(meta.perdidos, 1);
  assert.equal(meta.taxas.venda, 0.25);
  const google = linhas[1];
  assert.deepEqual(google.marcos, { qualificado: 1, consulta: 0, venda: 0 });
  const org = linhas[2];
  assert.equal(org.leads, 1);
  assert.deepEqual(org.marcos, { qualificado: 0, consulta: 0, venda: 0 });
});

test("funilPorOrigem: sem etapa de consulta no funil, a coluna e null (nao zero)", () => {
  const etapas = ETAPAS.filter((e) => e.chave !== "audiometria_realizada");
  const linhas = funilPorOrigem([toque({ lead_id: "a" })], new Map([["a", "proposta"]]), etapas, vocab);
  assert.equal(linhas[0].marcos.consulta, null);
  assert.equal(linhas[0].marcos.qualificado, 1);
});

// ─── estados ───

test("estadoDoPeriodo e estadoDoCusto: zero nao e uma coisa so", () => {
  assert.equal(estadoDoPeriodo(0, null, "2026-08-28"), "serie_nao_iniciada");
  assert.equal(estadoDoPeriodo(0, "2026-09-01T00:00:00Z", "2026-08-28"), "antes_da_serie");
  assert.equal(estadoDoPeriodo(0, "2026-07-01T00:00:00Z", "2026-08-28"), "sem_dado_no_periodo");
  assert.equal(estadoDoPeriodo(3, null, "2026-08-28"), "com_dado");
  assert.equal(estadoDoCusto(0, 0), "sem_ingestao");
  assert.equal(estadoDoCusto(0, 5), "sem_linhas_no_periodo");
  assert.equal(estadoDoCusto(2, 5), "ingerido");
});

// ─── visao ───

test("montarVisao: gasto e CPL sao null sem ingestao; CPL geral divide pelos leads pagos", () => {
  const periodo = periodoDaUrl({ de: "2026-08-10", ate: "2026-08-12" });
  const base = { periodo, etapasLeads: [], etapas: ETAPAS, parcial: false, leituraFalhou: false, inicioSerie: "2026-08-01T00:00:00Z", vocabulario: VOCAB, flagAtiva: null, agora: new Date("2026-08-13T12:00:00Z") };
  const toques = [toque({ lead_id: "a" }), toque({ lead_id: "b" }), organico({ lead_id: "c" })];
  const semCusto = montarVisao({ ...base, toques, custos: [], custoLinhasTotal: 0 });
  assert.equal(semCusto.resumo.gasto, null);
  assert.equal(semCusto.resumo.cpl, null);
  assert.equal(semCusto.resumo.leads, 3);
  assert.equal(semCusto.resumo.fracaoPaga, 2 / 3);
  assert.equal(semCusto.ensaio, false);
  const comCusto = montarVisao({ ...base, toques, custos: [custo({ custo: "90" })], custoLinhasTotal: 1 });
  assert.equal(comCusto.resumo.gasto, 90);
  assert.equal(comCusto.resumo.cpl, 45);
  assert.equal(comCusto.serie.length, 3);
});

// ─── ensaio ───

test("ensaio: determinista, 60 dias, 3 campanhas Meta + 2 Google, cidades, e NUNCA ligado por padrao", () => {
  const periodo = periodoDaUrl({ p: "30d" }, new Date("2026-08-27T12:00:00-03:00"));
  const a = gerarEnsaio(periodo);
  const b = gerarEnsaio(periodo);
  assert.deepEqual(a.toques.length, b.toques.length);
  assert.equal(a.toques[0].lead_id, b.toques[0].lead_id);
  const dias = new Set(a.custos.map((c) => c.dia));
  assert.equal(dias.size, DIAS_ENSAIO);
  const camps = new Map<string, string>();
  for (const c of a.custos) camps.set(c.campanha_id, c.plataforma);
  assert.equal([...camps.values()].filter((p) => p === "meta").length, 3);
  assert.equal([...camps.values()].filter((p) => p === "google").length, 2);
  assert.ok(a.toques.some((t) => t.utm?.cidade === "Campinas"));
  assert.ok(a.toques.some((t) => t.fonte === "indicacao"));
  assert.ok(a.toques.length > 100, `poucos toques: ${a.toques.length}`);

  const entrada = entradaDeEnsaio(periodo);
  assert.equal(entrada.ensaio, true);
  assert.ok(entrada.toques.every((t) => t.capturado_em! >= `${periodo.ini}T00:00:00-03:00`));
  const visao = montarVisao(entrada);
  assert.equal(visao.estado, "com_dado");
  assert.equal(visao.estadoCusto, "ingerido");
  assert.ok(visao.resumo.cpl! > 0);
  assert.equal(visao.serie.length, 30);
  assert.ok(visao.funil.some((l) => (l.marcos.venda ?? 0) > 0));
});

test("ensaioLigado: so com NEXT_PUBLIC_MARKETING_ENSAIO=1 (conferido pelo valor, sem importar o modulo de I/O)", () => {
  // O modulo `marketing.ts` importa `@/` e nao roda no node --test; a regra e trivial e fica
  // asserida aqui pela mesma expressao, para que ninguem a afrouxe para "truthy".
  const liga = (env: Record<string, string | undefined>) => env.NEXT_PUBLIC_MARKETING_ENSAIO === "1";
  assert.equal(liga({}), false);
  assert.equal(liga({ NEXT_PUBLIC_MARKETING_ENSAIO: "true" }), false);
  assert.equal(liga({ NEXT_PUBLIC_MARKETING_ENSAIO: "1" }), true);
});

// ─── acesso ───

test("podeVerMarketing: so marketing, admin e owner", () => {
  for (const p of PAPEIS) {
    const esperado = p === "marketing" || p === "admin" || p === "owner";
    assert.equal(podeVerMarketing(p), esperado, p);
  }
  assert.equal(podeVerMarketing(null), false);
});

// ─── funil REAL de producao (v4, 15 etapas + arquivado) — E-360: a coluna nunca pode mentir ───

const ETAPAS_PRODUCAO: EtapaConfig[] = [
  { chave: "lead", nome: "Lead", ordem: 10, tipo: "aberto" },
  { chave: "contato_feito", nome: "Contato feito", ordem: 20, tipo: "aberto" },
  { chave: "qualificando", nome: "Qualificando", ordem: 30, tipo: "aberto" },
  { chave: "qualificado", nome: "Qualificado", ordem: 40, tipo: "aberto" },
  { chave: "audiometria_agendada", nome: "Audiometria agendada", ordem: 50, tipo: "aberto" },
  { chave: "faltou_audiometria", nome: "Faltou audiometria", ordem: 55, tipo: "aberto" },
  { chave: "audiometria_realizada", nome: "Audiometria realizada", ordem: 60, tipo: "aberto" },
  { chave: "consulta_agendada", nome: "Consulta agendada", ordem: 70, tipo: "aberto" },
  { chave: "faltou_consulta", nome: "Faltou consulta", ordem: 75, tipo: "aberto" },
  { chave: "consulta_realizada", nome: "Consulta realizada", ordem: 80, tipo: "aberto" },
  { chave: "proposta", nome: "Proposta", ordem: 90, tipo: "aberto" },
  { chave: "negociacao", nome: "Negociacao", ordem: 100, tipo: "aberto" },
  { chave: "venda_ganha", nome: "Venda ganha", ordem: 110, tipo: "ganho" },
  { chave: "venda_perdida", nome: "Venda perdida", ordem: 120, tipo: "perdido" },
  { chave: "arquivado", nome: "Arquivado", ordem: 9000, tipo: "arquivado" },
];

test("resolverMarcos: no funil de producao, consulta e consulta_realizada — nunca audiometria", () => {
  const m = resolverMarcos(ETAPAS_PRODUCAO);
  assert.deepEqual(m.chave, { qualificado: "qualificado", consulta: "consulta_realizada", venda: "venda_ganha" });
  assert.deepEqual(m.nome, { qualificado: "Qualificado", consulta: "Consulta realizada", venda: "Venda ganha" });
  // Sem etapa de consulta, audiometria realizada entra como ultimo recurso.
  const semConsulta = ETAPAS_PRODUCAO.filter((e) => !e.chave.startsWith("consulta_"));
  assert.equal(resolverMarcos(semConsulta).chave.consulta, "audiometria_realizada");
});

test("funilPorOrigem: arquivado (ordem 9000) nao entra em marco nenhum; audiometria nao conta como consulta", () => {
  const toques = [toque({ lead_id: "a" }), toque({ lead_id: "b" }), toque({ lead_id: "c" }), toque({ lead_id: "d" })];
  const etapaPorLead = new Map([
    ["a", "lead"],
    ["b", "arquivado"],
    ["c", "venda_perdida"],
    ["d", "audiometria_realizada"], // passou por qualificado, NAO chegou a consulta
  ]);
  const [meta] = funilPorOrigem(toques, etapaPorLead, ETAPAS_PRODUCAO, vocab);
  assert.equal(meta.leads, 4);
  assert.deepEqual(meta.marcos, { qualificado: 1, consulta: 0, venda: 0 });
  assert.equal(meta.perdidos, 1);
});
