import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ORDENS,
  SLA_PADRAO_DECLARADO,
  TETO_AGORA,
  dataUltimaMensagem,
  excedeuTetoAgora,
  horasParadas,
  interpretarSlaEtapas,
  ordenarCards,
  prazoDaEtapa,
  prioridadeCard,
  textoExcedente,
  type SlaEtapas,
} from "../lib/dados/funil-ordenacao.ts";
import type { CardLead } from "../lib/dados/funil.ts";

/*
 * Contrato da PRIORIDADE e da ordenação (D55/D56, 22/08/2026).
 *
 * ── por que esta bateria foi REESCRITA ──────────────────────────────────────────────────────
 * A anterior afirmava, no nome do próprio teste, "faixaPrazo espelha o nivelSla: >4d estourado".
 * Ela passava, e o limiar que ela protegia estava errado do jeito mais caro possível: era GLOBAL
 * (não olhava a etapa) e hardcoded. Medido no board em 22/08: 97 dos 97 cards em "estourado", o
 * mais novo há 18d23h na etapa. O teste guardava fielmente uma regra que não separava nada.
 *
 * O que estes testes protegem agora:
 *  1. a cor é uma RAZÃO sobre o prazo DA ETAPA — a mesma cor significa a mesma coisa em qualquer
 *     coluna, e é isso que faz a leitura de 3 segundos funcionar varrendo o board;
 *  2. a regra do sócio ("quanto mais avançado no funil, menor o tempo") sai da tabela de prazos,
 *     não de código novo;
 *  3. ausência de dado NUNCA vira urgência;
 *  4. a ordem "sem resposta" de fato compara a última mensagem — era ela que caía no desempate e
 *     entregava ordem alfabética de UUID quando `ultima_mensagem` nunca era preenchida.
 */

const AGORA = Date.parse("2025-08-13T17:30:00.000Z"); // qua 14:30 em SP
const DIA = 86_400_000;
const HORA = 3_600_000;

/** SLA de teste: duas etapas com prazos deliberadamente distantes (2h × 48h). */
const SLA: SlaEtapas = {
  etapas: { rapida: 2, lenta: 48 },
  faixas: { agora: 1.0, hoje: 0.7, na_semana: 0.3 },
  padraoHoras: 24,
  relogio: "maior",
  pausaComCompromisso: true,
  daConfig: true,
};

function card(
  id: string,
  horasNaEtapa: number | null,
  sobre: Partial<CardLead> = {},
): CardLead {
  return {
    lead_id: id,
    nome: id,
    idade: null,
    telefone: null,
    etapa: "lenta",
    entrou_etapa_em: horasNaEtapa == null ? null : new Date(AGORA - horasNaEtapa * HORA).toISOString(),
    valor: null,
    origem: null,
    responsavel: null,
    dono_id: null,
    dono_nome: null,
    tags: [],
    proposta: null,
    tem_tarefa_pendente: null,
    ultima_mensagem: null,
    compromisso_em: null,
    ...sobre,
  };
}

// ─────────────── a regra de cor ───────────────

test("as QUATRO faixas saem da razão horas_paradas ÷ prazo_da_etapa", () => {
  // etapa 'lenta' = 48h de prazo
  assert.equal(prioridadeCard(card("a", 48), SLA, AGORA).faixa, "agora"); // razão 1,00
  assert.equal(prioridadeCard(card("b", 60), SLA, AGORA).faixa, "agora"); // razão 1,25
  assert.equal(prioridadeCard(card("c", 36), SLA, AGORA).faixa, "hoje"); // razão 0,75
  assert.equal(prioridadeCard(card("d", 20), SLA, AGORA).faixa, "na_semana"); // razão 0,42
  assert.equal(prioridadeCard(card("e", 6), SLA, AGORA).faixa, "sem_pressa"); // razão 0,12
});

test("⭐ a MESMA espera dá cores diferentes conforme a etapa — é o ponto da razão", () => {
  // 3 horas paradas: numa etapa de 2h já estourou; numa de 48h ainda nem esquentou.
  const rapida = prioridadeCard(card("r", 3, { etapa: "rapida" }), SLA, AGORA);
  const lenta = prioridadeCard(card("l", 3, { etapa: "lenta" }), SLA, AGORA);
  assert.equal(rapida.faixa, "agora");
  assert.equal(lenta.faixa, "sem_pressa");
  // e é daqui que a regra do sócio ("mais avançado no funil, menos tempo") sai de graça:
  // ela é a tabela de prazos, não uma segunda regra no código.
});

test("o limiar antigo (4 dias GLOBAL) teria pintado tudo de vermelho — a razão não", () => {
  // 97 de 97 cards estavam "estourado" em 22/08 com o limiar global; o mais NOVO tinha 18d23h.
  const cards = [card("x", 18 * 24 + 23, { etapa: "lenta" })]; // 455h ÷ 48h = 9,5 → estourou mesmo
  assert.equal(prioridadeCard(cards[0], SLA, AGORA).faixa, "agora");
  // mas um lead de 5 dias numa etapa lenta de 20 dias NÃO estoura, e com o limiar antigo estourava
  const sla20d: SlaEtapas = { ...SLA, etapas: { lenta: 480 } };
  assert.equal(prioridadeCard(card("y", 5 * 24), sla20d, AGORA).faixa, "sem_pressa");
});

test("card sem NENHUM relógio é sem_dado — ausência de medida nunca vira urgência", () => {
  const p = prioridadeCard(card("x", null), SLA, AGORA);
  assert.equal(p.faixa, "sem_dado");
  assert.equal(p.razao, null);
  assert.equal(p.horasParadas, null);
});

test("sem entrou_etapa_em mas COM mensagem datada, o relógio da mensagem sustenta a faixa", () => {
  const c = card("m", null, {
    ultima_mensagem: { texto: "oi", em: new Date(AGORA - 60 * HORA).toISOString(), de: "cliente" },
  });
  assert.equal(prioridadeCard(c, SLA, AGORA).faixa, "agora"); // 60h ÷ 48h
});

test("relógio 'maior': quem parou por QUALQUER caminho está parado", () => {
  const c = card("z", 60, {
    ultima_mensagem: { texto: "oi", em: new Date(AGORA - 1 * HORA).toISOString(), de: "cliente" },
  });
  // mensagem de 1h atrás não "resgata" um lead encalhado há 60h na etapa
  assert.equal(horasParadas(c, "maior", AGORA), 60);
  assert.equal(horasParadas(c, "mensagem", AGORA), 1);
  assert.equal(horasParadas(c, "etapa", AGORA), 60);
});

test("etapa fora de sla_etapas cai no padrão, e o padrão é DECLARADO (prazoDeclarado=false)", () => {
  const p = prioridadeCard(card("f", 30, { etapa: "etapa_que_ninguem_cadastrou" }), SLA, AGORA);
  assert.equal(p.horasPrazo, 24);
  assert.equal(p.prazoDeclarado, false, "a UI precisa poder dizer que este prazo não foi definido");
  assert.equal(p.faixa, "agora");
  assert.deepEqual(prazoDaEtapa("lenta", SLA), { horas: 48, declarado: true });
});

test("compromisso marcado no FUTURO pausa o relógio; vencido não pausa nada", () => {
  const futuro = card("p", 200, { compromisso_em: new Date(AGORA + 2 * DIA).toISOString() });
  const p = prioridadeCard(futuro, SLA, AGORA);
  assert.equal(p.pausado, true);
  assert.equal(p.faixa, "sem_pressa", "audiometria marcada pra quinta não fica vermelha na terça");

  const passado = card("q", 200, { compromisso_em: new Date(AGORA - 2 * DIA).toISOString() });
  assert.equal(prioridadeCard(passado, SLA, AGORA).faixa, "agora");

  // e a pausa é CONFIG: desligada, o lead com compromisso volta a gritar
  const semPausa: SlaEtapas = { ...SLA, pausaComCompromisso: false };
  assert.equal(prioridadeCard(futuro, semPausa, AGORA).faixa, "agora");
});

test("o excedente diz QUANTO passou — 'atrasado 2h' e 'atrasado 142d' não podem ser a mesma coisa", () => {
  assert.equal(textoExcedente(prioridadeCard(card("a", 60), SLA, AGORA)), "+12h");
  assert.equal(textoExcedente(prioridadeCard(card("b", 48 + 72), SLA, AGORA)), "+3d");
  assert.equal(textoExcedente(prioridadeCard(card("c", 6), SLA, AGORA)), "", "não estourou, não há excedente");
});

test("teto de 15% em AGORA é o alarme de critério frouxo (D56)", () => {
  assert.equal(TETO_AGORA, 0.15);
  assert.equal(excedeuTetoAgora(10, 100), false);
  assert.equal(excedeuTetoAgora(16, 100), true);
  assert.equal(excedeuTetoAgora(0, 0), false, "board vazio não acusa nada");
  // o estado do Kommo em 17/08: 97,9% da fila vencida
  assert.equal(excedeuTetoAgora(979, 1000), true);
});

// ─────────────── a config ───────────────

test("interpretarSlaEtapas lê a forma do CONTRATO (etapas como lista + faixas)", () => {
  const sla = interpretarSlaEtapas({
    etapas: [
      { etapa: "interessado", horas: 24 },
      { etapa: "teste_aparelho", horas: 8 },
    ],
    faixas: { agora: 1.0, hoje: 0.7, na_semana: 0.3 },
  });
  assert.ok(sla);
  assert.deepEqual(sla!.etapas, { interessado: 24, teste_aparelho: 8 });
  assert.equal(sla!.faixas.na_semana, 0.3);
  assert.equal(sla!.daConfig, true);
});

test("interpretarSlaEtapas também lê a forma do rascunho do benchmark (mapa + limiar/semana)", () => {
  const sla = interpretarSlaEtapas({
    etapas: { interessado: { horas: 24 }, qualificado: { horas: 12 } },
    limiar: { agora: 1.0, hoje: 0.6, semana: 0.25 },
    padrao_horas: 36,
    relogio: "etapa",
    pausa_com_compromisso: false,
  });
  assert.ok(sla);
  assert.deepEqual(sla!.etapas, { interessado: 24, qualificado: 12 });
  assert.equal(sla!.faixas.na_semana, 0.25);
  assert.equal(sla!.padraoHoras, 36);
  assert.equal(sla!.relogio, "etapa");
  assert.equal(sla!.pausaComCompromisso, false);
});

test("payload sem etapa nenhuma devolve null — o chamador cai no padrão DECLARADO", () => {
  assert.equal(interpretarSlaEtapas(null), null);
  assert.equal(interpretarSlaEtapas({}), null);
  assert.equal(interpretarSlaEtapas({ etapas: [] }), null);
  assert.equal(interpretarSlaEtapas({ etapas: { x: { horas: 0 } } }), null, "prazo 0 não é prazo");
  assert.equal(SLA_PADRAO_DECLARADO.daConfig, false, "o padrão SEMPRE se declara padrão");
});

test("o padrão declarado usa as slugs REAIS da config funil_vendas de produção", () => {
  // conferido contra a fixture de tests/funil.test.ts (config lida em 17/08): é `aprovacao_e_envio`,
  // com o `e`. Slug errada aqui não quebra nada — cai no padrão, e o card fica com o prazo errado
  // sem ninguém perceber. É o modo silencioso de errar, e é por isso que ele tem teste.
  for (const chave of ["interessado", "qualificado", "audiometria_agendada", "aprovacao_e_envio", "teste_aparelho"]) {
    assert.ok(SLA_PADRAO_DECLARADO.etapas[chave] > 0, `${chave} precisa de prazo no padrão declarado`);
  }
  // e a regra do sócio está EMBUTIDA na tabela: o fim do funil tem menos tempo que o começo
  assert.ok(SLA_PADRAO_DECLARADO.etapas.teste_aparelho < SLA_PADRAO_DECLARADO.etapas.interessado);
});

// ─────────────── ordenação ───────────────

test("ordem 'prioridade': maior pressão no topo, e a pressão é relativa à etapa", () => {
  const r = ordenarCards(
    [
      card("lenta_20h", 20, { etapa: "lenta" }), // 0,42
      card("rapida_3h", 3, { etapa: "rapida" }), // 1,50
      card("lenta_60h", 60, { etapa: "lenta" }), // 1,25
      card("rapida_1h", 1, { etapa: "rapida" }), // 0,50
    ],
    "prioridade",
    AGORA,
    SLA,
  );
  assert.deepEqual(r.map((c) => c.lead_id), ["rapida_3h", "lenta_60h", "rapida_1h", "lenta_20h"]);
});

test("na ordem 'prioridade', sem medida e pausado vão para o fim — não disputam o topo", () => {
  const r = ordenarCards(
    [
      card("sem", null),
      card("pausado", 200, { compromisso_em: new Date(AGORA + DIA).toISOString() }),
      card("quente", 60),
    ],
    "prioridade",
    AGORA,
    SLA,
  );
  assert.equal(r[0].lead_id, "quente");
  assert.equal(r[2].lead_id, "sem", "ausência de medida é sempre a última");
});

test("ordem 'parado': o mais antigo na etapa primeiro; sem data vai para o fim", () => {
  const r = ordenarCards([card("a", 48), card("sem", null), card("b", 200)], "parado", AGORA, SLA);
  assert.deepEqual(r.map((c) => c.lead_id), ["b", "a", "sem"]);
});

test("⭐ ordem 'sem_resposta' compara a ÚLTIMA MENSAGEM — era ela que caía no desempate por UUID", () => {
  // Todos entraram na etapa na MESMA hora: se a ordenação ignorasse `ultima_mensagem` (como
  // acontecia enquanto montarCard nunca a preenchia), o desempate por lead_id devolveria a ordem
  // alfabética "a, b, c, d" — que é exatamente o bug medido. A ordem certa é pela mensagem.
  const msg = (h: number) => ({ texto: "oi", em: new Date(AGORA - h * HORA).toISOString(), de: "cliente" as const });
  const r = ordenarCards(
    [
      card("a", 10, { ultima_mensagem: msg(1) }),
      card("b", 10, { ultima_mensagem: msg(300) }),
      card("c", 10, { ultima_mensagem: null }),
      card("d", 10, { ultima_mensagem: msg(120) }),
    ],
    "sem_resposta",
    AGORA,
    SLA,
  );
  assert.deepEqual(r.map((c) => c.lead_id), ["b", "d", "a", "c"]);
  assert.notDeepEqual(r.map((c) => c.lead_id), ["a", "b", "c", "d"], "ordem alfabética de id = o bug");
});

test("ordem 'recentes' inverte 'parado', e o sem-data continua no fim", () => {
  const r = ordenarCards([card("a", 48), card("sem", null), card("b", 200)], "recentes", AGORA, SLA);
  assert.deepEqual(r.map((c) => c.lead_id), ["a", "b", "sem"]);
});

test("ordenação não muta a lista recebida — a projeção é a verdade", () => {
  const orig = [card("a", 10), card("b", 200)];
  const copia = orig.slice();
  ordenarCards(orig, "prioridade", AGORA, SLA);
  assert.deepEqual(orig.map((c) => c.lead_id), copia.map((c) => c.lead_id));
});

test("empate resolve por lead_id — a ordem é estável entre dois refreshes", () => {
  const a = ordenarCards([card("zz", 36), card("aa", 36)], "prioridade", AGORA, SLA);
  const b = ordenarCards([card("aa", 36), card("zz", 36)], "prioridade", AGORA, SLA);
  assert.deepEqual(a.map((c) => c.lead_id), b.map((c) => c.lead_id));
  assert.deepEqual(a.map((c) => c.lead_id), ["aa", "zz"]);
});

test("dataUltimaMensagem: hoje e ontem com hora, resto com data", () => {
  assert.match(dataUltimaMensagem(new Date(AGORA - 3600_000).toISOString(), AGORA), /^hoje \d{2}:\d{2}$/);
  assert.match(dataUltimaMensagem(new Date(AGORA - 20 * 3600_000).toISOString(), AGORA), /^ontem \d{2}:\d{2}$/);
  assert.equal(dataUltimaMensagem(new Date(AGORA - 6 * DIA).toISOString(), AGORA), "07/08");
  assert.equal(dataUltimaMensagem(null, AGORA), "");
  assert.equal(dataUltimaMensagem(undefined, AGORA), "");
});

test("toda ordem do menu é aceita pelo ordenador", () => {
  for (const o of ORDENS) {
    assert.equal(ordenarCards([card("a", 10), card("b", 200)], o.chave, AGORA, SLA).length, 2);
  }
});
