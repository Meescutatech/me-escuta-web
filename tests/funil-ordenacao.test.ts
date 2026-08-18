import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ORDENS,
  dataUltimaMensagem,
  faixaPrazo,
  ordenarCards,
} from "../lib/dados/funil-ordenacao.ts";
import type { CardLead } from "../lib/dados/funil.ts";

/*
 * Contrato da ordenação e da faixa de prazo (workshop 12/08, "3 segundos pra decidir"). O ponto
 * que estes testes protegem: card SEM data não é card urgente. A ausência de dado vai para o fim
 * da fila em toda ordem — jogá-la no topo seria a UI afirmando uma urgência que ela não mediu.
 */

const AGORA = Date.parse("2025-08-13T17:30:00.000Z"); // qua 14:30 em SP
const DIA = 86_400_000;

function card(id: string, diasNaEtapa: number | null, ultimaHaDias?: number | null): CardLead {
  return {
    lead_id: id,
    nome: id,
    idade: null,
    telefone: null,
    etapa: "novo",
    entrou_etapa_em: diasNaEtapa == null ? null : new Date(AGORA - diasNaEtapa * DIA).toISOString(),
    valor: null,
    origem: null,
    responsavel: null,
    dono_id: null,
    dono_nome: null,
    tags: [],
    proposta: null,
    tem_tarefa_pendente: null,
    ultima_mensagem:
      ultimaHaDias == null
        ? null
        : { texto: "oi", em: new Date(AGORA - ultimaHaDias * DIA).toISOString(), de: "cliente" },
  };
}

test("faixaPrazo espelha o nivelSla: >4d estourado, >2d perto, resto dentro", () => {
  assert.equal(faixaPrazo(card("a", 9), AGORA), "estourado");
  assert.equal(faixaPrazo(card("b", 5), AGORA), "estourado");
  assert.equal(faixaPrazo(card("c", 3), AGORA), "perto");
  assert.equal(faixaPrazo(card("d", 1), AGORA), "dentro");
  assert.equal(faixaPrazo(card("e", 0), AGORA), "dentro");
});

test("card sem data de entrada é sem_dado, nunca estourado", () => {
  assert.equal(faixaPrazo(card("x", null), AGORA), "sem_dado");
});

test("ordem 'prazo': estourado no topo, e dentro da faixa o mais parado manda", () => {
  const r = ordenarCards([card("novo", 1), card("est5", 5), card("perto", 3), card("est9", 9)], "prazo", AGORA);
  assert.deepEqual(r.map((c) => c.lead_id), ["est9", "est5", "perto", "novo"]);
});

test("ordem 'parado': o mais antigo na etapa primeiro; sem data vai para o fim", () => {
  const r = ordenarCards([card("a", 2), card("sem", null), card("b", 8)], "parado", AGORA);
  assert.deepEqual(r.map((c) => c.lead_id), ["b", "a", "sem"]);
});

test("ordem 'sem_resposta': última mensagem mais antiga primeiro; sem mensagem vai para o fim", () => {
  const r = ordenarCards(
    [card("recente", 1, 1), card("antigo", 1, 12), card("mudo", 1, null), card("meio", 1, 5)],
    "sem_resposta",
    AGORA,
  );
  assert.deepEqual(r.map((c) => c.lead_id), ["antigo", "meio", "recente", "mudo"]);
});

test("ordem 'recentes' inverte 'parado', e o sem-data continua no fim", () => {
  const r = ordenarCards([card("a", 2), card("sem", null), card("b", 8)], "recentes", AGORA);
  assert.deepEqual(r.map((c) => c.lead_id), ["a", "b", "sem"]);
});

test("ordenação não muta a lista recebida — a projeção é a verdade", () => {
  const orig = [card("a", 1), card("b", 9)];
  const copia = orig.slice();
  ordenarCards(orig, "prazo", AGORA);
  assert.deepEqual(orig.map((c) => c.lead_id), copia.map((c) => c.lead_id));
});

test("empate resolve por lead_id — a ordem é estável entre dois refreshes", () => {
  const a = ordenarCards([card("zz", 3), card("aa", 3)], "prazo", AGORA);
  const b = ordenarCards([card("aa", 3), card("zz", 3)], "prazo", AGORA);
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
    assert.equal(ordenarCards([card("a", 1), card("b", 9)], o.chave, AGORA).length, 2);
  }
});
