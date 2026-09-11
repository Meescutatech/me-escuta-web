import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./apoio/resolucao-alias.mjs", import.meta.url);

import type { TarefaVisao } from "../lib/dados/tarefas-visao-calculos.ts";

const { ORDENS, dinheiroCurto, ordenar, ordenarPorUrgencia, pesoDaTarefa, porQueEstaAqui } = await import(
  "../lib/tarefas/prioridade.ts"
);

/*
 * O PESO DA PRIORIZAÇÃO (W-T, 11/09) — a ordem "Mais urgente primeiro" só vale se for explicável,
 * e explicável só é provável se a conta for pura. Relógio FIXO: quarta 10/09/2026 14:00 em São
 * Paulo. Teste de urgência que depende de `Date.now()` muda de veredito às 23h59.
 */

const AGORA = Date.UTC(2026, 8, 10, 17, 0, 0); // qua 10/09/2026 14:00 SP
const h = (horas: number) => new Date(AGORA + horas * 3_600_000).toISOString();

function tarefa(p: Partial<TarefaVisao> & { id: string }): TarefaVisao {
  return {
    lead_id: null,
    lead_nome: null,
    titulo: p.id,
    descricao: null,
    tipo: null,
    responsavel: null,
    responsavel_id: "me",
    prazo: null,
    status: "pendente",
    resultado: null,
    motivo_arquivo: null,
    criado_em: "2026-09-01T00:00:00.000Z",
    concluida_em: null,
    vencida: false,
    por_que: null,
    fazer: null,
    trecho: null,
    origem: null,
    ...p,
  };
}

// ─────────────── o peso ───────────────

test("sem sinal nenhum, o peso é só o prazo — e a tela não fica pior por não saber", () => {
  const so_prazo = pesoDaTarefa(tarefa({ id: "a", prazo: h(1), vencida: false }), undefined, AGORA);
  assert.deepEqual(
    so_prazo.fatores.map((f) => f.chave),
    ["hoje"],
  );
  assert.equal(so_prazo.total, 35);

  const nada = pesoDaTarefa(tarefa({ id: "b" }), undefined, AGORA);
  assert.equal(nada.total, 0);
  assert.deepEqual(nada.fatores, []);
});

test("vencida pesa mais que hoje, e o atraso satura no teto", () => {
  const ontem = pesoDaTarefa(tarefa({ id: "o", prazo: h(-24), vencida: true }), undefined, AGORA);
  const hoje = pesoDaTarefa(tarefa({ id: "h", prazo: h(2), vencida: false }), undefined, AGORA);
  assert.ok(ontem.total > hoje.total, "vencida ontem tem de pesar mais que vence hoje");
  assert.equal(ontem.total, 60 + 8); // 1 dia de atraso

  const velha = pesoDaTarefa(tarefa({ id: "v", prazo: h(-40 * 24), vencida: true }), undefined, AGORA);
  const menos_velha = pesoDaTarefa(tarefa({ id: "v2", prazo: h(-10 * 24), vencida: true }), undefined, AGORA);
  assert.equal(velha.total, 100, "teto: 60 + 40, nunca mais que isso");
  assert.equal(menos_velha.total, 100, "5 dias de atraso já batem o teto — atraso satura");
});

test("o fator só entra na lista se pontuar, e vem ordenado do que mais empurrou", () => {
  const p = pesoDaTarefa(
    tarefa({ id: "x", prazo: h(-24), vencida: true, prioridade: "alta" }),
    { etapa: "proposta", etapa_nome: "Proposta enviada", valor: 21000, horas_sem_resposta: 30 },
    AGORA,
  );
  assert.deepEqual(
    p.fatores.map((f) => f.chave),
    ["vencida", "prioridade", "etapa", "valor", "espera"],
  );
  assert.ok(p.fatores.every((f) => f.pontos !== 0), "fator com zero ponto não entra");
});

test("o 'por quê' é a frase que o Diogo pediu — vencida há 1 d · lead em Proposta · R$ 21 mil parados", () => {
  const p = pesoDaTarefa(
    tarefa({ id: "x", prazo: h(-24), vencida: true }),
    { etapa: "proposta", etapa_nome: "Proposta enviada", valor: 21000 },
    AGORA,
  );
  assert.equal(porQueEstaAqui(p), "vencida há 1 d · lead em Proposta enviada · R$ 21 mil parados");
});

test("prioridade baixa desce a tarefa, mas não aparece no 'por quê' (que só explica a subida)", () => {
  const baixa = pesoDaTarefa(tarefa({ id: "b", prazo: h(2), prioridade: "baixa" }), undefined, AGORA);
  const media = pesoDaTarefa(tarefa({ id: "m", prazo: h(2) }), undefined, AGORA);
  assert.ok(baixa.total < media.total);
  assert.equal(porQueEstaAqui(baixa), "vence hoje");
});

test("dinheiro em português curto", () => {
  assert.equal(dinheiroCurto(21000), "R$ 21 mil");
  assert.equal(dinheiroCurto(15200), "R$ 15 mil");
  assert.equal(dinheiroCurto(800), "R$ 800");
});

test("a espera do lead vira degrau, não hora exata", () => {
  const duas = pesoDaTarefa(tarefa({ id: "a" }), { horas_sem_resposta: 2 }, AGORA);
  const tres = pesoDaTarefa(tarefa({ id: "b" }), { horas_sem_resposta: 3 }, AGORA);
  assert.equal(duas.total, tres.total, "2 h e 3 h não mudam decisão nenhuma");
  const dois_dias = pesoDaTarefa(tarefa({ id: "c" }), { horas_sem_resposta: 50 }, AGORA);
  assert.equal(dois_dias.fatores[0].texto, "lead esperando há 2 d");
  assert.ok(dois_dias.total > duas.total);
});

// ─────────────── a ordem ───────────────

const SINAIS = {
  quente: { etapa: "proposta", etapa_nome: "Proposta enviada", valor: 21000, horas_sem_resposta: 30 },
  frio: { etapa: "novo", etapa_nome: "Novo lead", valor: null, horas_sem_resposta: null },
};

test("mais urgente primeiro: a vencida do lead em proposta ganha da vencida sem sinal", () => {
  const lista = [
    tarefa({ id: "sem-sinal", prazo: h(-24), vencida: true }),
    tarefa({ id: "com-sinal", prazo: h(-24), vencida: true }),
  ];
  const ordem = ordenarPorUrgencia(lista, { "com-sinal": SINAIS.quente, "sem-sinal": SINAIS.frio }, AGORA);
  assert.equal(ordem[0].t.id, "com-sinal");
  assert.ok(ordem[0].peso.total > ordem[1].peso.total);
});

test("o empate cai no prazo e depois na criação — ordem estável, nunca aleatória", () => {
  const a = tarefa({ id: "a", prazo: h(3), criado_em: "2026-09-02T00:00:00.000Z" });
  const b = tarefa({ id: "b", prazo: h(3), criado_em: "2026-09-01T00:00:00.000Z" });
  const ordem = ordenarPorUrgencia([a, b], {}, AGORA);
  assert.deepEqual(ordem.map((x) => x.t.id), ["b", "a"], "mesma pontuação e mesmo prazo: a mais antiga primeiro");
});

test("as outras ordens: prazo, prioridade, valor e espera", () => {
  const lista = [
    tarefa({ id: "tarde", prazo: h(40) }),
    tarefa({ id: "cedo", prazo: h(2), prioridade: "baixa" }),
    tarefa({ id: "sem-prazo", prioridade: "alta" }),
  ];
  const sinais = { tarde: { valor: 30000, horas_sem_resposta: 4 }, cedo: { valor: 900, horas_sem_resposta: 90 } };

  assert.deepEqual(ordenar(lista, "prazo", sinais, AGORA).map((x) => x.t.id), ["cedo", "tarde", "sem-prazo"]);
  assert.equal(ordenar(lista, "prioridade", sinais, AGORA)[0].t.id, "sem-prazo");
  assert.equal(ordenar(lista, "valor", sinais, AGORA)[0].t.id, "tarde");
  assert.equal(ordenar(lista, "espera", sinais, AGORA)[0].t.id, "cedo");
});

test("toda ordem do seletor é executável — nenhuma opção de menu sem implementação", () => {
  const lista = [tarefa({ id: "a", prazo: h(2) }), tarefa({ id: "b" })];
  for (const o of ORDENS) {
    const r = ordenar(lista, o.chave, {}, AGORA);
    assert.equal(r.length, 2, `${o.chave} perdeu tarefa`);
    assert.ok(r.every((x) => x.peso != null), `${o.chave} não devolveu o peso — o "por quê" ficaria sem fonte`);
  }
});
