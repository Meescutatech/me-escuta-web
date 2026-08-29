import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diasDaJanela,
  fmtMinutos,
  interpretarAtor,
  interpretarPeriodo,
  janelaDoPeriodo,
  mediana,
  resumirAgora,
  resumirAtendimento,
  resumirFunil,
  resumirPorAtor,
  serieDiaria,
  somarDiasNegocio,
  tendencia,
  textoVariacao,
  valorEmNegociacao,
  type Ator,
  type LinhaAtorDia,
  type LinhaDia,
  type LinhaEtapaDia,
  type LinhaFunil,
  type LinhaPrimeiraResposta,
} from "../lib/dados/dashboard-ceo-calculos.ts";
import { SLA_PADRAO_DECLARADO } from "../lib/dados/funil-ordenacao.ts";

/*
 * Logica PURA do dashboard do CEO (R27 · F6). As views (0300/0301) sao provadas no pgTAP 98;
 * aqui se prova a conta de periodo/comparacao que o web faz sobre as linhas por dia.
 */

// 29/08/2026 12:00 em Sao Paulo
const AGORA = new Date("2026-08-29T15:00:00Z");

test("janela de 7 dias termina hoje (SP) e a anterior encosta nela sem sobrepor", () => {
  const j = janelaDoPeriodo(7, AGORA);
  assert.equal(j.fim, "2026-08-29");
  assert.equal(j.inicio, "2026-08-23");
  assert.equal(j.fimAnterior, "2026-08-22");
  assert.equal(j.inicioAnterior, "2026-08-16");
  assert.equal(diasDaJanela(j).length, 7);
  assert.equal(diasDaJanela(j)[0], "2026-08-23");
});

test("janela de 90 dias atravessa meses e ano sem quebrar", () => {
  const j = janelaDoPeriodo(90, new Date("2026-01-10T15:00:00Z"));
  assert.equal(j.inicio, "2025-10-13");
  assert.equal(diasDaJanela(j).length, 90);
});

test("periodo e ator sao lidos da URL com fallback seguro", () => {
  assert.equal(interpretarPeriodo("30"), 30);
  assert.equal(interpretarPeriodo("15"), 30);
  assert.equal(interpretarPeriodo(undefined), 30);
  assert.equal(interpretarPeriodo(["7"]), 7);
  assert.equal(interpretarAtor("agente:clara"), "agente:clara");
  assert.equal(interpretarAtor("humano:00000000-0000-4000-8000-000000000061"), "humano:00000000-0000-4000-8000-000000000061");
  assert.equal(interpretarAtor("sistema"), null);
  assert.equal(interpretarAtor("agente:clara; drop"), null);
});

test("variacao: sobe, desce, igual, de zero e sem base", () => {
  assert.equal(textoVariacao({ atual: 12, anterior: 10 }), "+20%");
  assert.equal(textoVariacao({ atual: 8, anterior: 10 }), "−20%");
  assert.equal(textoVariacao({ atual: 10, anterior: 10 }), "=");
  assert.equal(textoVariacao({ atual: 3, anterior: 0 }), "+3");
  assert.equal(textoVariacao({ atual: 0, anterior: 0 }), "=");
  assert.equal(textoVariacao({ atual: null, anterior: 4 }), "—");
  assert.equal(tendencia({ atual: 12, anterior: 10 }), "melhor");
  assert.equal(tendencia({ atual: 12, anterior: 10 }, true), "pior"); // tempo de resposta: subir e pior
  assert.equal(tendencia({ atual: 3, anterior: 0 }, true), "pior");
});

const j7 = janelaDoPeriodo(7, AGORA);

const CATALOGO: Ator[] = [
  { ator: "agente:clara", tipo: "agente", nome: "Clara", ativo: true },
  { ator: "agente:jarvis", tipo: "agente", nome: "Jarvis", ativo: true },
  { ator: "humano:u1", tipo: "humano", nome: "Sarah", ativo: true },
  { ator: "humano:u2", tipo: "humano", nome: "Antiga", ativo: false },
];

const linha = (dia: string, ator: string, p: Partial<LinhaAtorDia>): LinhaAtorDia => ({
  dia,
  ator,
  mensagens_enviadas: 0,
  conversas_atendidas: 0,
  transbordos_recebidos: 0,
  devolucoes: 0,
  tarefas_criadas: 0,
  tarefas_concluidas: 0,
  leads_movidos: 0,
  ...p,
});

const ATOR_DIA: LinhaAtorDia[] = [
  linha("2026-08-29", "agente:clara", { mensagens_enviadas: 10, conversas_atendidas: 6 }),
  linha("2026-08-25", "agente:clara", { mensagens_enviadas: 5, conversas_atendidas: 4 }),
  linha("2026-08-20", "agente:clara", { mensagens_enviadas: 7, conversas_atendidas: 7 }), // anterior
  linha("2026-08-28", "humano:u1", { mensagens_enviadas: 3, conversas_atendidas: 2, transbordos_recebidos: 2, leads_movidos: 1, tarefas_concluidas: 2 }),
  linha("2026-08-15", "humano:u1", { mensagens_enviadas: 9 }), // fora das duas janelas (anterior comeca 16/08)
  linha("2026-08-27", "agente:jarvis", { tarefas_criadas: 4 }),
  linha("2026-08-27", "sistema", { leads_movidos: 3 }),
];

const PRIMEIRA: LinhaPrimeiraResposta[] = [
  { conversa_id: "c1", dia: "2026-08-29", respondida_por: "agente:clara", minutos: 1 },
  { conversa_id: "c2", dia: "2026-08-28", respondida_por: "agente:clara", minutos: 3 },
  { conversa_id: "c3", dia: "2026-08-28", respondida_por: "humano:u1", minutos: 120 },
  { conversa_id: "c4", dia: "2026-08-27", respondida_por: null, minutos: null }, // sem resposta
  { conversa_id: "c5", dia: "2026-08-19", respondida_por: "agente:clara", minutos: 9 }, // anterior
];

test("por ator: soma so a janela atual, compara com a anterior, mediana por quem respondeu primeiro", () => {
  const r = resumirPorAtor(CATALOGO, ATOR_DIA, PRIMEIRA, j7);
  const clara = r.find((x) => x.ator === "agente:clara")!;
  assert.equal(clara.mensagens.atual, 15);
  assert.equal(clara.mensagens.anterior, 7);
  assert.equal(clara.conversas.atual, 10);
  assert.equal(clara.primeiraResposta.medianaMin, 2);
  assert.equal(clara.primeiraResposta.amostra, 2);
  assert.equal(clara.primeiraResposta.anteriorMin, 9);

  const sarah = r.find((x) => x.ator === "humano:u1")!;
  assert.equal(sarah.mensagens.atual, 3);
  assert.equal(sarah.mensagens.anterior, 0, "15/08 esta fora das duas janelas");
  assert.equal(sarah.transbordos.atual, 2);
  assert.equal(sarah.tarefasConcluidas.atual, 2);
  assert.equal(sarah.primeiraResposta.medianaMin, 120);

  const jarvis = r.find((x) => x.ator === "agente:jarvis")!;
  assert.equal(jarvis.tarefasCriadas.atual, 4);
  assert.equal(jarvis.conversas.atual, 0);

  assert.ok(!r.some((x) => x.ator === "sistema"), "sistema nao e ator da tabela");
  const antiga = r.find((x) => x.ator === "humano:u2")!;
  assert.equal(antiga.temAtividade, false);
  assert.equal(antiga.ativo, false);
  // ordem: agentes antes de humanos; entre agentes, mais conversas primeiro
  assert.deepEqual(r.map((x) => x.ator).slice(0, 2), ["agente:clara", "agente:jarvis"]);
});

test("atendimento: agente x humano pela 1a resposta, sem resposta fora do denominador", () => {
  const a = resumirAtendimento(PRIMEIRA, ATOR_DIA, j7);
  assert.equal(a.conversasAgente.atual, 2);
  assert.equal(a.conversasHumano.atual, 1);
  assert.equal(a.semResposta.atual, 1);
  assert.equal(a.fracaoAgente, 2 / 3);
  assert.equal(a.transbordos.atual, 2);
  assert.equal(a.primeiraResposta.geralMin.atual, 3);
  assert.equal(a.primeiraResposta.geralMin.anterior, 9);
  assert.equal(a.primeiraResposta.agenteMin, 2);
  assert.equal(a.primeiraResposta.humanoMin, 120);
  assert.equal(a.primeiraResposta.amostra, 3);
});

test("atendimento vazio nao inventa fracao", () => {
  const a = resumirAtendimento([], [], j7);
  assert.equal(a.fracaoAgente, null);
  assert.equal(a.primeiraResposta.geralMin.atual, null);
});

const DIAS: LinhaDia[] = [
  { dia: "2026-08-29", leads_novos: 2, mensagens_recebidas: 20, mensagens_enviadas: 13, conversas_com_entrada: 8, conversas_novas: 2 },
  { dia: "2026-08-24", leads_novos: 1, mensagens_recebidas: 4, mensagens_enviadas: 2, conversas_com_entrada: 3, conversas_novas: 1 },
  { dia: "2026-08-18", leads_novos: 5, mensagens_recebidas: 1, mensagens_enviadas: 0, conversas_com_entrada: 1, conversas_novas: 0 },
];

test("negocio por periodo e serie diaria com zero nos dias sem linha", () => {
  const n = somarDiasNegocio(DIAS, j7);
  assert.equal(n.leadsNovos.atual, 3);
  assert.equal(n.leadsNovos.anterior, 5);
  assert.equal(n.mensagensRecebidas.atual, 24);

  const s = serieDiaria(DIAS, ATOR_DIA, j7, null);
  assert.equal(s.length, 7);
  assert.equal(s[0].rotulo, "23/08");
  assert.equal(s[6].leadsNovos, 2);
  assert.equal(s[6].enviadasAgente, 10);
  assert.equal(s[5].enviadasHumano, 3);
  assert.equal(s[1].leadsNovos, 1);
  assert.equal(s[2].leadsNovos, 0, "dia sem linha vira zero, nao buraco");

  const so = serieDiaria(DIAS, ATOR_DIA, j7, "humano:u1");
  assert.equal(so[6].enviadasAgente, 0, "filtro de ator zera quem nao e ele");
  assert.equal(so[5].enviadasHumano, 3);
});

const FUNIL: LinhaFunil[] = [
  { etapa: "novo", nome: "Novo lead", tipo: "aberto", ordem: 1, fora_do_board: false, leads: 40, leads_com_valor: 0, valor: 0 },
  { etapa: "qualificando", nome: "Qualificando", tipo: "aberto", ordem: 2, fora_do_board: false, leads: 12, leads_com_valor: 3, valor: 9000 },
  { etapa: "proposta", nome: "Proposta", tipo: "aberto", ordem: 4, fora_do_board: false, leads: 5, leads_com_valor: 5, valor: 25000 },
  { etapa: "ganho", nome: "Ganho", tipo: "ganho", ordem: 90, fora_do_board: false, leads: 30, leads_com_valor: 30, valor: 150000 },
  { etapa: "arquivado", nome: "Arquivado", tipo: "arquivado", ordem: 9000, fora_do_board: true, leads: 500, leads_com_valor: 0, valor: 0 },
];
const ETAPA_DIA: LinhaEtapaDia[] = [
  { dia: "2026-08-29", etapa: "novo", ator: "sistema", entradas: 10, leads_distintos: 10 },
  { dia: "2026-08-28", etapa: "qualificando", ator: "agente:clara", entradas: 4, leads_distintos: 4 },
  { dia: "2026-08-27", etapa: "qualificando", ator: "humano:u1", entradas: 2, leads_distintos: 2 },
  { dia: "2026-08-27", etapa: "proposta", ator: "humano:u1", entradas: 3, leads_distintos: 3 },
  { dia: "2026-08-26", etapa: "ganho", ator: "humano:u1", entradas: 1, leads_distintos: 1 },
  { dia: "2026-08-17", etapa: "novo", ator: "sistema", entradas: 20, leads_distintos: 20 }, // anterior
];

test("funil no periodo: entradas por etapa na ordem da config, % ate aqui sobre a 1a aberta", () => {
  const f = resumirFunil(FUNIL, ETAPA_DIA, j7, null);
  assert.deepEqual(f.map((e) => e.etapa), ["novo", "qualificando", "proposta", "ganho", "arquivado"]);
  assert.equal(f[0].entradas.atual, 10);
  assert.equal(f[0].entradas.anterior, 20);
  assert.equal(f[0].pctAteAqui, 1);
  assert.equal(f[1].entradas.atual, 6);
  assert.equal(f[1].pctAteAqui, 0.6);
  assert.equal(f[1].pctDaAnterior, 0.6);
  assert.equal(f[2].pctAteAqui, 0.3);
  assert.equal(f[2].pctDaAnterior, 0.5);
  assert.equal(f[0].estoque, 40);
  assert.equal(f[3].entradas.atual, 1);

  const soSarah = resumirFunil(FUNIL, ETAPA_DIA, j7, "humano:u1");
  assert.equal(soSarah[1].entradas.atual, 2, "ver como Sarah: so o que ela moveu");
  assert.equal(soSarah[0].entradas.atual, 0);
  assert.equal(soSarah[1].pctAteAqui, null, "sem base na 1a etapa nao ha % ate aqui");
});

test("valor em negociacao soma so etapas abertas", () => {
  const v = valorEmNegociacao(FUNIL);
  assert.equal(v.total, 34000);
  assert.equal(v.leadsComValor, 8);
  assert.equal(v.leads, 57);
});

test("% em AGORA usa a regra de cor do funil e o teto de 15%", () => {
  const sla = { ...SLA_PADRAO_DECLARADO, etapas: { qualificando: 24 }, relogio: "etapa" as const };
  const agoraMs = AGORA.getTime();
  const h = (horas: number) => new Date(agoraMs - horas * 3600_000).toISOString();
  const cards = [
    { etapa: "qualificando", entrou_etapa_em: h(30), ultima_mensagem: null, compromisso_em: null }, // 1.25 → AGORA
    { etapa: "qualificando", entrou_etapa_em: h(1), ultima_mensagem: null, compromisso_em: null }, // sem pressa
    { etapa: "qualificando", entrou_etapa_em: h(1), ultima_mensagem: null, compromisso_em: null },
    { etapa: "qualificando", entrou_etapa_em: h(1), ultima_mensagem: null, compromisso_em: null },
    { etapa: "qualificando", entrou_etapa_em: null, ultima_mensagem: null, compromisso_em: null }, // sem_dado: fora do denominador
  ];
  const r = resumirAgora(cards, sla, agoraMs);
  assert.equal(r.porFaixa.agora, 1);
  assert.equal(r.porFaixa.sem_dado, 1);
  assert.equal(r.pctAgora, 0.25);
  assert.equal(r.excedeuTeto, true);
  assert.equal(resumirAgora([], sla, agoraMs).pctAgora, null);
});

test("formatos", () => {
  assert.equal(mediana([]), null);
  assert.equal(mediana([1, 5, 3]), 3);
  assert.equal(mediana([1, 4]), 2.5);
  assert.equal(fmtMinutos(null), "—");
  assert.equal(fmtMinutos(0.4), "< 1 min");
  assert.equal(fmtMinutos(4), "4 min");
  assert.equal(fmtMinutos(80), "1h20");
  assert.equal(fmtMinutos(120), "2h");
  assert.equal(fmtMinutos(60 * 26), "1d 2h");
});
