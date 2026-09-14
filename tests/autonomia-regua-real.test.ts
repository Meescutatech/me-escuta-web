import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGO_INDISPONIVEL,
  FUNDAMENTO_FORA_DO_CATALOGO,
  FUNDAMENTO_SEM_CATALOGO,
  FUNDAMENTO_TETO_AUSENTE,
  lerCatalogo,
  linhasDaReguaReal,
  nivelDoJsonb,
  responsavelPadraoDe,
  tetoDa,
} from "../lib/agentes/regua-real.ts";

/*
 * A RÉGUA DE AUTONOMIA COM DADO DE VERDADE — 14/09/2026.
 *
 * O defeito que estes testes impedem tem nome e tamanho medidos: a régua mostrava as capacidades
 * da FIXTURE, e para o Jarvis eram `criar_tarefa · priorizar · atribuir · arquivar_lead`. Em
 * produção, no mesmo dia:
 *
 *     core.agente               jarvis.autonomia_jsonb = {"criar_tarefa": "auto"}
 *     core.v_config_vigente     capacidade_agente → 15 chaves, e `priorizar`, `atribuir` e
 *                               `arquivar_lead` NÃO estão entre elas
 *
 * Enquanto a régua era leitura, isso era enfeite errado. No minuto em que ela grava, são três
 * interruptores que `api.registrar_evento` recusa com "capacidade não existe no catálogo vigente"
 * — ou seja, três botões que prometem e devolvem erro.
 *
 * O CATÁLOGO abaixo é o de produção, reduzido às chaves que este arquivo exercita, com os tetos
 * copiados de `flag.teto_autonomia` v2.
 */

const CATALOGO_PROD = {
  capacidades: [
    { chave: "responder_roteiro", rotulo: "Responder roteiro", descricao: "Responde o que o roteiro cobre", ordem: 10, ativo: true },
    { chave: "criar_tarefa", rotulo: "Criar tarefa", descricao: "Abre tarefa para alguem do time", ordem: 50, ativo: true },
    { chave: "falar_preco", rotulo: "Falar preco", descricao: "Diz valor de aparelho ou servico", ordem: 90, ativo: true },
    { chave: "conduta_clinica", rotulo: "Conduta clinica", descricao: "Afirma diagnostico ou indica aparelho", ordem: 130, ativo: true },
    { chave: "aposentada", rotulo: "Aposentada", descricao: "capacidade inativa", ordem: 999, ativo: false },
  ],
};
const TETOS_PROD = {
  tetos: [
    { chave: "criar_tarefa", teto_nivel: "auto", fundamento: "A tarefa E o protocolo de handoff da operacao." },
    { chave: "responder_roteiro", teto_nivel: "auto", fundamento: "PRD RF-A2: qualificacao e autonoma." },
    { chave: "falar_preco", teto_nivel: "propor", fundamento: "Constituicao 1.2 - preco/negociacao nunca tem autonomia automatica" },
    { chave: "conduta_clinica", teto_nivel: "propor", fundamento: "Constituicao 1.2 - conduta clinica nunca tem autonomia automatica" },
  ],
};
const CATALOGO = lerCatalogo(CATALOGO_PROD, TETOS_PROD);

// ═══════════════════════ o nível cru, como o runtime o lê ═══════════════════════

test("chave ausente NÃO é `proibido` — o runtime a lê como `propor`, e inventar 'desligado' seria mentir", () => {
  // `src/clara/autonomia.ts` (`nivelDe`): `if (typeof bruto !== "string") return "propor"`.
  assert.equal(nivelDoJsonb(undefined), "propor");
  assert.equal(nivelDoJsonb(null), "propor");
  assert.equal(nivelDoJsonb(42), "propor");
  // e valor fora do vocabulário também cai em `propor`, no mesmo fail-closed
  assert.equal(nivelDoJsonb("ligado"), "propor");
  assert.equal(nivelDoJsonb("AUTO"), "auto");
  assert.equal(nivelDoJsonb(" proibido "), "proibido");
});

// ═══════════════════════ o teto: fail-closed em `propor` ═══════════════════════

test("sem linha de teto o resultado é `propor` — o MESMO fail-closed de core.teto_capacidade", () => {
  // o coalesce do corpo vivo: `select coalesce((select t->>'teto_nivel' …), 'propor')`. Trocar
  // isto por `auto` devolveria o furo inteiro, em silêncio.
  assert.equal(tetoDa("capacidade_sem_teto", CATALOGO.tetos), "propor");
  assert.equal(tetoDa("criar_tarefa", CATALOGO.tetos), "auto");
  assert.equal(tetoDa("falar_preco", CATALOGO.tetos), "propor");
});

test("teto `proibido` também vira `propor` aqui — a pergunta da tela é só 'cabe auto?'", () => {
  assert.equal(tetoDa("x", [{ chave: "x", teto_nivel: "proibido", fundamento: "" }]), "propor");
});

// ═══════════════════════ as linhas do agente ═══════════════════════

test("o Jarvis de produção rende UMA linha, com interruptor — e não as quatro da fixture", () => {
  const linhas = linhasDaReguaReal({ criar_tarefa: "auto" }, CATALOGO);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].chave, "criar_tarefa");
  assert.equal(linhas[0].rotulo, "Criar tarefa");
  assert.equal(linhas[0].nivel, "auto");
  assert.equal(linhas[0].teto, "auto");
  assert.equal(linhas[0].travada, false);
  // as três da fixture que a porta recusaria não aparecem em lugar nenhum
  for (const inventada of ["priorizar", "atribuir", "arquivar_lead"]) {
    assert.ok(!linhas.some((l) => l.chave === inventada), inventada);
  }
});

test("capacidade sob teto constitucional vem TRAVADA, com o fundamento do banco", () => {
  const linhas = linhasDaReguaReal({ falar_preco: "proibido", conduta_clinica: "proibido" }, CATALOGO);
  for (const l of linhas) {
    assert.equal(l.travada, true, l.chave);
    assert.equal(l.teto, "propor", l.chave);
    assert.match(l.fundamento, /Constituicao 1\.2/, l.chave);
  }
});

test("chave gravada FORA do catálogo aparece, travada e explicada — é o caso `enviar_mensagem` da Clara", () => {
  // O projetor só faz merge e não sabe apagar chave: `enviar_mensagem` está congelada na linha da
  // Clara em produção. Esconder a linha faria a tela afirmar que ela não existe; oferecer o
  // interruptor faria a porta recusar. Ela aparece, travada, com o motivo.
  const linhas = linhasDaReguaReal({ enviar_mensagem: "auto", criar_tarefa: "auto" }, CATALOGO);
  const legada = linhas.find((l) => l.chave === "enviar_mensagem")!;
  assert.ok(legada);
  assert.equal(legada.travada, true);
  assert.equal(legada.fundamento, FUNDAMENTO_FORA_DO_CATALOGO);
  // e ela vai para o FIM: o que ninguém pode mexer não disputa o topo da lista
  assert.equal(linhas[linhas.length - 1].chave, "enviar_mensagem");
});

test("capacidade INATIVA no catálogo conta como fora do catálogo — `ativo:false` é desligada, não editável", () => {
  const linhas = linhasDaReguaReal({ aposentada: "auto" }, CATALOGO);
  assert.equal(linhas[0].travada, true);
  assert.equal(linhas[0].fundamento, FUNDAMENTO_FORA_DO_CATALOGO);
});

test("capacidade no catálogo e SEM teto declarado não ganha interruptor", () => {
  const catalogoSemTeto = lerCatalogo(CATALOGO_PROD, { tetos: [] });
  const linhas = linhasDaReguaReal({ criar_tarefa: "auto" }, catalogoSemTeto);
  assert.equal(linhas[0].travada, true);
  assert.equal(linhas[0].fundamento, FUNDAMENTO_TETO_AUSENTE);
});

test("a ordem é a do catálogo, não a do jsonb — o jsonb não tem ordem estável", () => {
  const linhas = linhasDaReguaReal(
    { conduta_clinica: "proibido", criar_tarefa: "auto", responder_roteiro: "auto" },
    CATALOGO,
  );
  assert.deepEqual(
    linhas.map((l) => l.chave),
    ["responder_roteiro", "criar_tarefa", "conduta_clinica"],
  );
});

test("`propor` é EXIBIDO — existe no banco, e trocá-lo por 'não faz' seria outra mentira", () => {
  const linhas = linhasDaReguaReal({ criar_tarefa: "propor" }, CATALOGO);
  assert.equal(linhas[0].nivel, "propor");
  assert.equal(linhas[0].travada, false); // o teto deixa; o interruptor existe e está desligado
});

// ═══════════════════════ catálogo ilegível: TUDO em leitura ═══════════════════════

test("catálogo ilegível deixa a régua inteira em leitura, com o motivo — nunca aberta por otimismo", () => {
  const linhas = linhasDaReguaReal({ criar_tarefa: "auto" }, CATALOGO_INDISPONIVEL);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].travada, true);
  assert.equal(linhas[0].fundamento, FUNDAMENTO_SEM_CATALOGO);
  // o NÍVEL continua verdadeiro: não dá para configurar, mas dá para ver o estado
  assert.equal(linhas[0].nivel, "auto");
});

test("catálogo vazio NÃO é catálogo lido — senão toda linha viraria 'fora do catálogo'", () => {
  // Um `v_config_vigente` sem a linha `capacidade_agente` devolveria payload nulo. Tratar isso
  // como catálogo lido acusaria dívida de migration que não existe.
  assert.equal(lerCatalogo(null, TETOS_PROD).lido, false);
  assert.equal(lerCatalogo({ capacidades: [] }, TETOS_PROD).lido, false);
  assert.equal(lerCatalogo(CATALOGO_PROD, null).lido, true); // sem tetos ainda é catálogo
});

test("agente sem capacidade nenhuma rende ZERO linhas, não uma lista inventada", () => {
  assert.deepEqual(linhasDaReguaReal({}, CATALOGO), []);
  assert.deepEqual(linhasDaReguaReal(null, CATALOGO), []);
});

// ═══════════════════════ responsável padrão ═══════════════════════

test("o responsável padrão sai de config_jsonb, e só quando é uuid de verdade no campo", () => {
  assert.equal(responsavelPadraoDe({ responsavel_padrao: "a1b2" }), "a1b2");
  assert.equal(responsavelPadraoDe({ responsavel_padrao: "  a1b2  " }), "a1b2");
  assert.equal(responsavelPadraoDe({ responsavel_padrao: "" }), null);
  assert.equal(responsavelPadraoDe({ responsavel_padrao: 7 }), null);
  // o Jarvis tem `prompt_conversa` no mesmo jsonb: ler a chave errada seria pôr um prompt no lugar
  // de um uuid
  assert.equal(responsavelPadraoDe({ prompt_conversa: "## Quem você é" }), null);
  assert.equal(responsavelPadraoDe(null), null);
});
