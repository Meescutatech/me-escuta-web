import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparPorDia,
  carimbo,
  carimboPrazo,
  carimboSoHora,
  contarNaoLidas,
  destino,
  diasDeAtraso,
  filtrar,
  fraseNotificacao,
  maisRecentes,
  naoLida,
  nomeDoAtor,
  podePromover,
  diaEfetivo,
  ehEspecieDeTarefa,
  ESPECIES_DE_TAREFA,
  textoAtraso,
  tituloDoDia,
  type Notificacao,
} from "../lib/notificacoes.ts";

/**
 * Lógica pura das notificações (R13 / Bloco B). O que se prova aqui é a AGREGAÇÃO e a
 * gramática do mockup notificacoes-sino-v3.html: contagem de não-lidas, a frase que substitui
 * o ícone por tipo, o atraso (única exceção cromática), o agrupamento por dia e as regras de
 * promoção a tarefa. Fidelidade visual se prova com o mockup aberto lado a lado, não aqui.
 */

// 22/07/2026, 12:00 local — a mesma âncora do mockup
const AGORA = new Date(2026, 6, 22, 12, 0, 0).getTime();
const iso = (d: Date) => d.toISOString();
const em = (dia: number, h: number, m = 0) => iso(new Date(2026, 6, dia, h, m, 0));

function base(p: Partial<Notificacao> = {}): Notificacao {
  return {
    id: "n1",
    especie: "mencao",
    quando: em(22, 10, 4),
    lida_em: null,
    lead_id: "lead-1",
    trecho: "@Camila Rocha consegue ver antes do retorno de quinta?",
    titulo: null,
    ator: "humano:00000000-0000-4000-8000-000000000001",
    ator_nome: "Sara Almeida",
    origem_tipo: "nota",
    origem_id: "o1",
    mencao_id: "n1",
    tarefa_id: null,
    prazo: null,
    respondida_em: null,
    lead_nome: "Maria Exemplo",
    ...p,
  };
}

test("naoLida e contarNaoLidas: tarefa pendente conta como não-lida", () => {
  const itens = [
    base({ id: "a" }),
    base({ id: "b", lida_em: em(21, 17, 39) }),
    base({ id: "c", especie: "tarefa_atribuida", lida_em: null }),
  ];
  assert.equal(naoLida(itens[0]), true);
  assert.equal(naoLida(itens[1]), false);
  assert.equal(contarNaoLidas(itens), 2);
});

test("fraseNotificacao escreve o TIPO — o mockup não usa ícone por categoria", () => {
  assert.deepEqual(fraseNotificacao(base()), {
    forte: "Sara Almeida",
    resto: " mencionou você numa nota",
  });
  assert.deepEqual(fraseNotificacao(base({ origem_tipo: "tarefa" })), {
    forte: "Sara Almeida",
    resto: " mencionou você numa tarefa",
  });
  assert.deepEqual(
    fraseNotificacao(base({ especie: "tarefa_atribuida", ator_nome: "Diogo Fonseca" })),
    { forte: "Diogo Fonseca", resto: " atribuiu uma tarefa a você" },
  );
  assert.deepEqual(
    fraseNotificacao(
      base({ especie: "tarefa_vencida", titulo: "Confirmar retorno de quinta por vídeo" }),
    ),
    { forte: "Tarefa venceu", resto: " — Confirmar retorno de quinta por vídeo" },
  );
});

test("nomeDoAtor nunca mostra uuid cru", () => {
  assert.equal(nomeDoAtor(base({ ator_nome: null, ator: "humano:bf71ce15-0000-4000-8000-0001" })), "Alguém da equipe");
  assert.equal(nomeDoAtor(base({ ator_nome: null, ator: "agente:levindo" })), "levindo");
  assert.equal(nomeDoAtor(base({ ator_nome: null, ator: "sara@meescuta.com" })), "sara");
  assert.equal(nomeDoAtor(base({ ator_nome: "Sara Almeida", ator: "humano:x" })), "Sara Almeida");
});

test("atraso: só conta quando o prazo já passou, e arredonda para baixo com piso de 1 dia", () => {
  assert.equal(diasDeAtraso(em(20, 9), AGORA), 2);
  assert.equal(textoAtraso(em(20, 9), AGORA), "2 dias de atraso");
  assert.equal(textoAtraso(em(21, 13), AGORA), "1 dia de atraso"); // 23h => piso de 1
  assert.equal(diasDeAtraso(em(24, 9), AGORA), null, "prazo no futuro não é atraso");
  assert.equal(textoAtraso(null, AGORA), "");
});

test("carimbo: hoje = hora, ontem = 'ontem · hora', antes = dd/mm", () => {
  assert.equal(carimbo(em(22, 10, 4), AGORA), "10:04");
  assert.equal(carimbo(em(21, 17, 39), AGORA), "ontem · 17:39");
  assert.equal(carimbo(em(20, 9, 0), AGORA), "20/07");
});

test("carimboPrazo diz vence/venceu conforme o prazo", () => {
  assert.equal(carimboPrazo(em(23, 9, 0), AGORA), "vence 23/07 · 09:00");
  assert.equal(carimboPrazo(em(20, 9, 0), AGORA), "venceu 20/07 · 09:00");
  assert.equal(carimboPrazo(null, AGORA), "sem prazo");
});

test("tituloDoDia usa dia de calendário — 23h atrás pode ser 'Ontem'", () => {
  assert.equal(tituloDoDia(em(22, 0, 30), AGORA), "Hoje · 22 de julho");
  assert.equal(tituloDoDia(em(21, 23, 30), AGORA), "Ontem · 21 de julho");
  assert.equal(tituloDoDia(em(19, 10, 0), AGORA), "19 de julho");
});

test("carimboSoHora não repete o dia que o cabeçalho do grupo já diz", () => {
  assert.equal(carimboSoHora(em(21, 17, 39)), "17:39");
  assert.equal(carimboSoHora("data ruim"), "");
});

test("tarefa vencida é cobrança de AGORA: entra no grupo de hoje, não no dia em que nasceu", () => {
  const vencida = base({
    id: "v",
    especie: "tarefa_vencida",
    quando: em(20, 9, 0),
    prazo: em(20, 9, 0),
  });
  assert.equal(diaEfetivo(vencida, AGORA), AGORA);
  assert.equal(diaEfetivo(base({ quando: em(21, 17, 0) }), AGORA), new Date(em(21, 17, 0)).getTime());

  const grupos = agruparPorDia([base({ id: "m", quando: em(22, 10, 4) }), vencida], AGORA);
  assert.deepEqual(
    grupos.map((g) => [g.titulo, g.itens.map((n) => n.id)]),
    [["Hoje · 22 de julho", ["m", "v"]]],
    "vencida sobe para hoje — é o que o mockup mostra",
  );
});

test("agruparPorDia ordena por recência e agrupa sem repetir cabeçalho", () => {
  const grupos = agruparPorDia(
    [
      base({ id: "a", quando: em(21, 17, 39) }),
      base({ id: "b", quando: em(22, 10, 4) }),
      base({ id: "c", quando: em(21, 15, 12) }),
      base({ id: "d", quando: em(22, 8, 0) }),
    ],
    AGORA,
  );
  assert.deepEqual(
    grupos.map((g) => [g.titulo, g.itens.map((n) => n.id)]),
    [
      ["Hoje · 22 de julho", ["b", "d"]],
      ["Ontem · 21 de julho", ["a", "c"]],
    ],
  );
});

test("filtrar: a aba Tarefas é a LISTA de espécies de tarefa, não 'tudo que não é menção'", () => {
  // O teste antigo cristalizava a semântica por negação (`especie !== "mencao"`) e por isso não
  // falhava quando uma espécie que não é tarefa entrava na aba. `a` é o alarme de cobertura: sem
  // tarefa, sem prazo, sem botão Concluir — ele pertence a "Todas", nunca a "Tarefas".
  const itens = [
    base({ id: "m", especie: "mencao" }),
    base({ id: "t", especie: "tarefa_atribuida" }),
    base({ id: "p", especie: "tarefa_vencendo" }),
    base({ id: "v", especie: "tarefa_vencida" }),
    base({ id: "a", especie: "cobertura_atribuicao_degradada", mencao_id: null, tarefa_id: null }),
    base({ id: "l", especie: "mencao", lida_em: em(21, 9) }),
  ];
  assert.deepEqual(filtrar(itens, "todas").map((n) => n.id), ["m", "t", "p", "v", "a", "l"]);
  assert.deepEqual(filtrar(itens, "mencoes").map((n) => n.id), ["m", "l"]);
  assert.deepEqual(filtrar(itens, "tarefas").map((n) => n.id), ["t", "p", "v"]);
  assert.deepEqual(filtrar(itens, "nao_lidas").map((n) => n.id), ["m", "t", "p", "v", "a"]);
});

test("ehEspecieDeTarefa: quem carimba prazo é a espécie de tarefa — alarme e menção não", () => {
  // Falha sozinho quando alguém acrescentar espécie a ESPECIES_DE_TAREFA sem pensar no carimbo.
  assert.deepEqual([...ESPECIES_DE_TAREFA], ["tarefa_atribuida", "tarefa_vencendo", "tarefa_vencida"]);
  for (const e of ESPECIES_DE_TAREFA) assert.equal(ehEspecieDeTarefa(e), true, e);
  assert.equal(ehEspecieDeTarefa("mencao"), false);
  assert.equal(ehEspecieDeTarefa("cobertura_atribuicao_degradada"), false);
});

test("maisRecentes corta a lista do popover sem mutar a entrada", () => {
  const itens = [
    base({ id: "a", quando: em(20, 9) }),
    base({ id: "b", quando: em(22, 10) }),
    base({ id: "c", quando: em(21, 17) }),
  ];
  assert.deepEqual(maisRecentes(itens, 2, AGORA).map((n) => n.id), ["b", "c"]);
  assert.deepEqual(itens.map((n) => n.id), ["a", "b", "c"], "entrada intacta");
});

test("podePromover: só menção pendente vira tarefa em 1 clique (§7/§10.2)", () => {
  assert.equal(podePromover(base()), true);
  assert.equal(
    podePromover(base({ respondida_em: em(22, 11) })),
    false,
    "menção já promovida não promove de novo",
  );
  assert.equal(podePromover(base({ especie: "tarefa_atribuida" })), false);
  assert.equal(podePromover(base({ mencao_id: null })), false);
});

test("destino leva ao lugar onde a menção vive; sem lead não há para onde ir", () => {
  assert.equal(destino(base()), "/conversas?lead=lead-1");
  assert.equal(destino(base({ lead_id: null })), null);
});
