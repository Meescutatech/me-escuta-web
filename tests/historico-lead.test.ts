import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITE_HISTORICO,
  TIPOS_HISTORICO,
  colapsarDuplicatas,
  houveCorte,
  lerResponsavel,
  mapaDeAgentes,
  mapaDeEtapas,
  mapaDePessoas,
  resolverAtor,
  tipoDoHistorico,
  traduzirEtapa,
  type EventoHistorico,
} from "../components/lead/regras/historico.ts";

/*
 * M4 · as regras do histórico do lead, exercidas nos DOIS sentidos.
 *
 * O M4 é o único item da R18 que só LÊ — não há guarda de porta para reprovar, não há migration
 * para abortar. **Toda a defesa dele é esta lógica**, então ela é o único lugar onde um defeito
 * pode ser pego antes da tela.
 */

function ev(p: Partial<EventoHistorico> = {}): EventoHistorico {
  return {
    id: "e1",
    posicao_global: 1,
    tipo: "etapa_alterada",
    ator: "humano:11111111-1111-4111-8111-111111111111",
    origem: "ui",
    criado_em: "2026-07-28T12:00:00Z",
    etapa_de: null,
    etapa_para: "qualificando",
    etapa_inicial: null,
    dono_id: null,
    motivo: null,
    ...p,
  };
}

// ───────────────────────── a lista fechada é a guarda do item ─────────────────────────

test("a lista de tipos é FECHADA — é ela que impede a aba de crescer sozinha", () => {
  assert.deepEqual([...TIPOS_HISTORICO], ["lead_criado", "etapa_alterada", "dono_atribuido"]);
  for (const t of TIPOS_HISTORICO) assert.ok(tipoDoHistorico(t));
});

test("tipo FORA da lista é recusado — inclusive o que mais assusta", () => {
  // `mensagem_status` são 3.623 dos 5.598 eventos, hoje todos com lead_id nulo. No dia em que
  // alguém carimbar lead_id neles, um lead saltaria de 3 linhas para dezenas — e ninguém teria
  // tocado no M4. A lista é o que impede isso.
  assert.equal(tipoDoHistorico("mensagem_status"), false);
  assert.equal(tipoDoHistorico("mensagem_recebida"), false);
  assert.equal(tipoDoHistorico("conversa_assumida"), false);
  assert.equal(tipoDoHistorico(""), false);
  assert.equal(tipoDoHistorico(null), false);
  assert.equal(tipoDoHistorico(undefined), false);
});

// ───────────────────────────── resolvedor de ator ─────────────────────────────

test("resolverAtor: as SEIS formas, e NENHUMA renderiza vazio", () => {
  const pessoas = new Map([["11111111-1111-4111-8111-111111111111", "Sara Teles"]]);
  const agentes = new Map([["clara", "Clara"]]);

  const casos: [string, string][] = [
    ["humano:11111111-1111-4111-8111-111111111111", "Sara Teles"],
    ["humano:22222222-2222-4222-8222-222222222222", "Usuário removido (22222222)"],
    ["humano:sara@meescuta.com", "sara@meescuta.com"],
    ["humano:Sara (import)", "Sara (import)"],
    ["agente:clara", "Clara (agente)"],
    ["sistema:backfill", "sistema · backfill"],
  ];
  for (const [ator, esperado] of casos) {
    const r = resolverAtor(ator, pessoas, agentes);
    assert.equal(r.rotulo, esperado, ator);
    assert.ok(r.rotulo.trim().length > 0, `${ator} renderizou vazio`);
  }
});

test("resolverAtor: ator vazio ou desconhecido ainda diz alguma coisa", () => {
  const vazio = resolverAtor("", new Map());
  assert.equal(vazio.rotulo, "origem desconhecida");
  assert.ok(resolverAtor(null, new Map()).rotulo.length > 0);
  assert.ok(resolverAtor("coisa-estranha", new Map()).rotulo.length > 0);
});

test("resolverAtor separa SISTEMA de gente — não é cosmético", () => {
  // "o sistema mudou a etapa" e "a Sara mudou a etapa" são afirmações diferentes; confundi-las
  // faz alguém procurar um responsável que não existe.
  assert.equal(resolverAtor("sistema:backfill", new Map()).especie, "sistema");
  assert.equal(resolverAtor("humano:x@y.com", new Map()).especie, "pessoa");
  assert.equal(resolverAtor("agente:clara", new Map()).especie, "agente");
});

test("agente NÃO é resolvido pelo mapa de pessoas, nem o contrário", () => {
  // espaços de nome distintos: um mapa único faria um slug de agente resolver como pessoa.
  const soPessoas = new Map([["clara", "Clara Pessoa Homônima"]]);
  assert.equal(resolverAtor("agente:clara", soPessoas).rotulo, "clara (agente)");
});

// ───────────────────────────── tradutor de etapa ─────────────────────────────

test("traduzirEtapa usa a CONFIG — mapa hardcode é reprovação declarada (C3)", () => {
  const etapas = new Map([["qualificando", "Qualificando"]]);
  assert.deepEqual(traduzirEtapa("qualificando", etapas), {
    rotulo: "Qualificando",
    foraDaConfig: false,
  });
});

test("etapa FORA da config renderiza o slug MAIS a marca — nunca linha em branco", () => {
  // acontece hoje: `novo` 1× e `qualificando` 1×.
  const r = traduzirEtapa("novo", new Map());
  assert.deepEqual(r, { rotulo: "novo", foraDaConfig: true });
});

test("etapa ausente devolve null — e é o que faz a seta aparecer sozinha", () => {
  assert.equal(traduzirEtapa(null, new Map()), null);
  assert.equal(traduzirEtapa("", new Map()), null);
  assert.equal(traduzirEtapa("   ", new Map()), null);
});

// ─────────────────────── colapsador de duplicata idêntica ───────────────────────

test("colapsa eventos IDÊNTICOS e consecutivos, com contador", () => {
  const a = ev({ id: "a" });
  const b = ev({ id: "b" });
  const linhas = colapsarDuplicatas([a, b]);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].repeticoes, 2);
});

test("NÃO colapsa instantes diferentes — duas trocas no mesmo minuto são INFORMAÇÃO", () => {
  const linhas = colapsarDuplicatas([
    ev({ id: "a", criado_em: "2026-07-28T12:00:00Z" }),
    ev({ id: "b", criado_em: "2026-07-28T12:00:40Z" }),
  ]);
  assert.equal(linhas.length, 2, "uma janela de tempo teria escondido a segunda troca");
});

test("NÃO colapsa atores diferentes — 'quem' é metade do que a linha responde", () => {
  const linhas = colapsarDuplicatas([
    ev({ id: "a", ator: "humano:aaa" }),
    ev({ id: "b", ator: "humano:bbb" }),
  ]);
  assert.equal(linhas.length, 2);
});

test("NÃO colapsa valores diferentes — juntar A→B com B→C inventaria um salto", () => {
  const linhas = colapsarDuplicatas([
    ev({ id: "a", etapa_de: "novo", etapa_para: "qualificando" }),
    ev({ id: "b", etapa_de: "qualificando", etapa_para: "proposta" }),
  ]);
  assert.equal(linhas.length, 2);
});

test("NÃO colapsa eventos idênticos NÃO consecutivos", () => {
  const linhas = colapsarDuplicatas([
    ev({ id: "a" }),
    ev({ id: "meio", etapa_para: "proposta" }),
    ev({ id: "c" }),
  ]);
  assert.equal(linhas.length, 3);
});

test("lista vazia não quebra o colapsador", () => {
  assert.deepEqual(colapsarDuplicatas([]), []);
});

// ─────────────────── os três estados do responsável (E1/E2/E3) ───────────────────

test("E3 · há dono_atribuido → a frase DESAPARECE e os itens falam", () => {
  const r = lerResponsavel(1, "kommo:10248863", "Sara Teles");
  assert.equal(r.estado, "E3");
  assert.equal(r.frase, null);
});

test("E1 · sem evento e sem dono legado → diz que não tem responsável", () => {
  const r = lerResponsavel(0, null, null);
  assert.equal(r.estado, "E1");
  assert.match(r.frase ?? "", /não tem responsável/);
});

test("E1 · dono legado sem de-para → mostra o valor BRUTO, sem fingir que é gente", () => {
  const r = lerResponsavel(0, "kommo:10248863", null);
  assert.equal(r.estado, "E1");
  assert.match(r.frase ?? "", /kommo:10248863/);
  assert.match(r.frase ?? "", /sistema antigo/);
});

test("E2 · com de-para → mostra OS DOIS: o nome E o valor de origem", () => {
  // `core.lead.dono` é origem histórica; `dono_id` é identidade. O valor do Kommo nunca aparece
  // disfarçado de nome de pessoa, e nunca é escondido.
  const r = lerResponsavel(0, "kommo:10248863", "Sara Teles");
  assert.equal(r.estado, "E2");
  assert.match(r.frase ?? "", /Sara Teles/);
  assert.match(r.frase ?? "", /kommo:10248863/);
});

test("E1 e E2 NUNCA viram item de lista — a frase é a única saída", () => {
  // resolver o nome não transforma ESTADO em EVENTO. Renderizar `core.lead.dono` como item
  // datado seria afirmar um registro que não existe no ledger.
  for (const caso of [
    lerResponsavel(0, null, null),
    lerResponsavel(0, "kommo:1", null),
    lerResponsavel(0, "kommo:1", "Alguém"),
  ]) {
    assert.notEqual(caso.frase, null, "E1/E2 devolvem frase");
    assert.notEqual(caso.estado, "E3");
  }
  // e o formato da saída é uma FRASE, não uma estrutura de item — não há campo de data aqui.
  assert.equal(Object.keys(lerResponsavel(0, "kommo:1", null)).sort().join(","), "estado,frase");
});

test("E1/E2 são PERMANENTES do acervo, não transitórios — dono legado com 574 leads", () => {
  // quem implementar esperando que E1/E2 sejam código morto vai cortá-los, e a ficha de 574
  // leads fica sem explicação nenhuma sobre o responsável. Nenhuma atribuição futura cria
  // histórico retroativo: um lead com dono legado e ZERO eventos continua em E1/E2 para sempre.
  assert.equal(lerResponsavel(0, "kommo:10248863", "Sara Teles").estado, "E2");
});

// ────────────────────────────── corte declarado ──────────────────────────────

test("o corte é declarado, e só quando ocorre", () => {
  assert.equal(houveCorte(3), false, "o teto medido hoje é 3 — o corte não pode aparecer");
  assert.equal(houveCorte(LIMITE_HISTORICO - 1), false);
  assert.equal(houveCorte(LIMITE_HISTORICO), true);
});

// ─────────────────── construtores de mapa (as duas telas montam igual) ───────────────────

test("os mapas separam pessoa de agente — e as duas telas usam os MESMOS construtores", () => {
  const menc = [
    { id: "u1", nome: "Sara", tipo: "humano" },
    { id: "clara", nome: "Clara", tipo: "agente" },
  ];
  assert.deepEqual([...mapaDePessoas(menc)], [["u1", "Sara"]]);
  assert.deepEqual([...mapaDeAgentes(menc)], [["clara", "Clara"]]);
  assert.deepEqual([...mapaDeEtapas([{ chave: "novo", nome: "Novo" }])], [["novo", "Novo"]]);
});
