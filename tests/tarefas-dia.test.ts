import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./apoio/resolucao-alias.mjs", import.meta.url);

import type { TarefaVisao } from "../lib/dados/tarefas-visao-calculos.ts";

// os módulos usam o alias `@/` — entram DEPOIS do hook (import estático é içado para antes dele)
const { abaAtiva, contagemAbas, filaDoDia, filtrosDaAba, proximaNaFila } = await import("../lib/tarefas/dia.ts");
const { diasAteProximaSegunda, manhaSP, prazoCurtoParaIso, presetsAdiar } = await import("../lib/tarefas/adiar.ts");
const { derivarProximaTarefa, proximaTarefaDoLead } = await import("../lib/tarefas/proxima.ts");
const { houveAjuste, payloadDaProposta, tarefaDaProposta } = await import("../lib/tarefas/propostas.ts");
const { aplicarEscritas, escritasVazias } = await import("../lib/tarefas/ensaio-local.ts");
const { FILTROS_PADRAO } = await import("../lib/dados/tarefas-visao-calculos.ts");
const { leadIdDeEnsaio, visaoTarefasDeEnsaio } = await import("../lib/dados/tarefas-ensaio.ts");

/*
 * W-D5 (10/09) — a lógica pura da view "Hoje", do adiar em um clique, da próxima tarefa do lead
 * e da proposta do Jarvis. Tudo que a tela decide sem desenhar mora aqui e roda sem navegador.
 *
 * O relógio é FIXO (quarta 10/09/2026 14:00 SP = 17:00 UTC): teste de fila do dia que depende de
 * `Date.now()` muda de resultado às 23h59, e o que se quer provar é a regra, não a hora.
 */

const AGORA = Date.UTC(2026, 8, 10, 17, 0, 0); // qua 10/09/2026 14:00 SP

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

const h = (horas: number) => new Date(AGORA + horas * 3_600_000).toISOString();

// ─────────────── fila do dia ───────────────

test("fila do dia = vencidas ∪ hoje; sem prazo e amanhã ficam fora", () => {
  const fila = filaDoDia(
    [
      tarefa({ id: "amanha", prazo: h(20) }), // 10:00 de amanhã
      tarefa({ id: "hoje", prazo: h(4) }),
      tarefa({ id: "vencida", prazo: h(-30), vencida: true }),
      tarefa({ id: "sem_prazo" }),
      tarefa({ id: "concluida", prazo: h(1), status: "concluida" }),
    ],
    AGORA,
  );
  assert.deepEqual(
    fila.map((t) => t.id),
    ["vencida", "hoje"],
  );
});

test("ordem: vencida antes de hoje; dentro do bloco, prioridade e depois hora", () => {
  const fila = filaDoDia(
    [
      tarefa({ id: "hoje_baixa_cedo", prazo: h(1), prioridade: "baixa" }),
      tarefa({ id: "hoje_alta_tarde", prazo: h(5), prioridade: "alta" }),
      tarefa({ id: "venc_media", prazo: h(-2), vencida: true }),
      tarefa({ id: "venc_alta", prazo: h(-1), vencida: true, prioridade: "alta" }),
      tarefa({ id: "hoje_media", prazo: h(3) }),
    ],
    AGORA,
  );
  assert.deepEqual(
    fila.map((t) => t.id),
    ["venc_alta", "venc_media", "hoje_alta_tarde", "hoje_media", "hoje_baixa_cedo"],
  );
});

test("proximaNaFila anda, recomeça do primeiro se o atual sumiu, e acaba em null", () => {
  assert.equal(proximaNaFila(["a", "b", "c"], "a"), "b");
  assert.equal(proximaNaFila(["a", "b", "c"], "c"), null);
  assert.equal(proximaNaFila(["a", "b", "c"], "x"), "a");
  assert.equal(proximaNaFila([], "a"), null);
});

// ─────────────── abas ───────────────

test("aba é derivada dos filtros e a ida/volta é estável", () => {
  const base = { ...FILTROS_PADRAO, minhas: true, exibicao: "hoje" as const };
  assert.equal(abaAtiva(base), "hoje");
  const semana = filtrosDaAba("semana", base);
  assert.equal(abaAtiva(semana), "semana");
  assert.equal(semana.exibicao, "funil"); // sair de Hoje devolve as colunas do Diogo
  const time = filtrosDaAba("time", semana);
  assert.equal(abaAtiva(time), "time");
  assert.equal(time.minhas, false);
  // recorte próprio não acende nenhuma
  assert.equal(abaAtiva({ ...time, vencidas: true }), null);
  assert.equal(abaAtiva({ ...time, responsavelId: "x" }), null);
});

test("contagem das abas conta só pendentes e minhas quando há meuId", () => {
  const c = contagemAbas(
    [
      tarefa({ id: "1", prazo: h(-1), vencida: true }),
      tarefa({ id: "2", prazo: h(2) }),
      tarefa({ id: "3", prazo: h(48) }), // sexta — dentro da semana
      tarefa({ id: "4", prazo: h(24 * 10) }), // depois
      tarefa({ id: "5", responsavel_id: "outra" }),
      tarefa({ id: "6", status: "concluida" }),
    ],
    "me",
    AGORA,
  );
  assert.deepEqual(c, { hoje: 2, semana: 3, todas: 4, time: 5 });
  assert.equal(contagemAbas([tarefa({ id: "1" })], null, AGORA).todas, 0);
});

// ─────────────── adiar ───────────────

test("presets caem às 09:00 de São Paulo e a segunda nunca é hoje", () => {
  const [amanha, tres, segunda] = presetsAdiar(AGORA);
  assert.equal(amanha.prazoIso, "2026-09-11T12:00:00.000Z");
  assert.equal(tres.prazoIso, "2026-09-13T12:00:00.000Z");
  assert.equal(segunda.prazoIso, "2026-09-14T12:00:00.000Z");
  assert.equal(amanha.motivo, "adiada para amanhã");
  // numa segunda, "próxima segunda" é daqui a 7
  const segundaMs = Date.UTC(2026, 8, 14, 12, 0, 0);
  assert.equal(diasAteProximaSegunda(segundaMs), 7);
  assert.equal(manhaSP(segundaMs, 7), "2026-09-21T12:00:00.000Z");
});

test("prazo curto → ISO: hoje 18h (ou +1h se passou), esta semana = sexta", () => {
  assert.equal(prazoCurtoParaIso("hoje", AGORA), "2026-09-10T21:00:00.000Z");
  const noite = Date.UTC(2026, 8, 10, 23, 0, 0); // 20:00 SP
  assert.equal(prazoCurtoParaIso("hoje", noite), new Date(noite + 3_600_000).toISOString());
  assert.equal(prazoCurtoParaIso("esta_semana", AGORA), "2026-09-11T12:00:00.000Z"); // sexta 11/09
  const sabado = Date.UTC(2026, 8, 12, 15, 0, 0);
  assert.equal(prazoCurtoParaIso("esta_semana", sabado), "2026-09-14T12:00:00.000Z"); // segunda
});

// ─────────────── próxima tarefa do lead ───────────────

test("derivarProximaTarefa: menor prazo vence, sem prazo por último, sem pendente = sem_tarefa", () => {
  const p = derivarProximaTarefa(
    [
      tarefa({ id: "sem", lead_id: "L" }),
      tarefa({ id: "tarde", lead_id: "L", prazo: h(30) }),
      tarefa({ id: "cedo", lead_id: "L", prazo: h(2), responsavel_id: "me" }),
      tarefa({ id: "feita", lead_id: "L", prazo: h(-50), status: "concluida" }),
    ],
    AGORA,
    (id) => (id === "me" ? "Sara" : null),
  );
  assert.equal(p.tarefa_id, "cedo");
  assert.equal(p.estado, "hoje");
  assert.equal(p.responsavel, "Sara");
  assert.equal(derivarProximaTarefa([tarefa({ id: "x", status: "arquivada" })], AGORA).estado, "sem_tarefa");
  assert.equal(derivarProximaTarefa([tarefa({ id: "v", prazo: h(-1), vencida: true })], AGORA).estado, "vencida");
  assert.equal(derivarProximaTarefa([tarefa({ id: "f", prazo: h(72) })], AGORA).estado, "futura");
});

test("proximaTarefaDoLead lê a fixture do funil: Cleusa vencida, lead sem tarefa, id vazio = null", () => {
  const cleusa = proximaTarefaDoLead(leadIdDeEnsaio(23), new Date(AGORA));
  assert.ok(cleusa);
  assert.equal(cleusa.estado, "vencida");
  assert.equal(cleusa.titulo, "Mandar o endereço da clínica para a Cleusa");
  assert.equal(cleusa.responsavel, "Sara");
  const semTarefa = proximaTarefaDoLead(leadIdDeEnsaio(9), new Date(AGORA));
  assert.deepEqual(semTarefa, { titulo: null, prazo: null, responsavel: null, estado: "sem_tarefa", tarefa_id: null });
  assert.equal(proximaTarefaDoLead(""), null);
  // Maria (índice 0) aparece com o id do FUNIL só com `leadsDoFunil`
  const maria = proximaTarefaDoLead(leadIdDeEnsaio(0), new Date(AGORA));
  assert.equal(maria?.estado, "vencida");
  assert.equal(visaoTarefasDeEnsaio(new Date(AGORA)).tarefas[0].lead_id, "3594fd74-1fbf-55e0-ab03-affedf0f55ef");
});

// ─────────────── proposta do Jarvis ───────────────

const PROPOSTA = {
  id: "s1",
  lead_id: "L",
  lead_nome: "Arlindo",
  fazer: "Responder com a faixa de preço",
  por_que: "perguntou preço",
  trecho: "quanto fica?",
  tipo: "acompanhar_follow_up",
  prioridade: "alta" as const,
  prazo_sugerido: h(2),
  responsavel_sugerido_id: "me",
  criado_em: h(-1),
};

test("payload da proposta: sem ajuste não leva ajustada_de; com ajuste leva e usa os campos novos", () => {
  const puro = payloadDaProposta(PROPOSTA);
  assert.equal(puro.titulo, PROPOSTA.fazer);
  assert.equal(puro.origem, "jarvis_conversa");
  assert.equal("ajustada_de" in puro, false);
  assert.equal(houveAjuste(PROPOSTA, { fazer: PROPOSTA.fazer }), false);
  const ajustado = payloadDaProposta(PROPOSTA, { fazer: "Ligar", responsavel_id: "outra" });
  assert.equal(ajustado.titulo, "Ligar");
  assert.equal(ajustado.responsavel_id, "outra");
  assert.equal(ajustado.ajustada_de, "s1");
  const t = tarefaDaProposta(PROPOSTA, {}, AGORA, "t1");
  assert.equal(t.origem, "jarvis_conversa");
  assert.equal(t.prioridade, "alta");
  assert.equal(t.vencida, false);
});

// ─────────────── ensaio local ───────────────

test("escritas do ensaio reaplicam sobre a fixture: concluir some da fila, adiar muda o prazo", () => {
  const e = escritasVazias();
  e.concluidas.set("a", "atendeu");
  e.prazos.set("b", h(40));
  const [a, b] = aplicarEscritas([tarefa({ id: "a", prazo: h(-1), vencida: true }), tarefa({ id: "b", prazo: h(-2), vencida: true })], e, AGORA);
  assert.equal(a.status, "concluida");
  assert.equal(a.resultado, "atendeu");
  assert.equal(b.vencida, false);
  assert.equal(b.prazo, h(40));
});
