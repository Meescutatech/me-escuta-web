import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * 14/09/2026 — OS CONTROLES DE AGENTE TÊM DE GRAVAR.
 *
 * O commit `aac6aec` (11/09) promoveu a tela de ensaio de agente ao caminho real e manteve os
 * handlers locais: `setLigado(v)` mostrava "parado" com o agente ativo, e "Publicar v+1"
 * incrementava um número enquanto o agente seguia com o prompt antigo. Antes dele a rota `[id]`
 * mandava `jarvis` para o `PainelJarvis` e redirecionava o resto para a página da Clara — duas
 * telas que gravam. A capacidade genérica sempre foi lacuna; o que virou regressão foi a ROTA.
 *
 * Estas asserções são sobre o texto-fonte pelo mesmo motivo do `telas-gravam.test.ts`: o que
 * faltava não era uma conta errada, era uma chamada que não existia — e um teste de unidade sobre
 * a função local passa verdinho no estado quebrado.
 *
 * ⚠️ Cada uma foi vista REPROVAR com o arquivo mutado antes de contar como guarda.
 */

const acoes = readFileSync(
  new URL("../app/(app)/configuracoes/agentes/actions.ts", import.meta.url),
  "utf8",
);
const grade = readFileSync(new URL("../components/inteligencia/cartoes-agentes.tsx", import.meta.url), "utf8");
const tela = readFileSync(new URL("../components/inteligencia/tela-agente.tsx", import.meta.url), "utf8");

test("existe action genérica de agente, e o agente é PARÂMETRO — não `clara` cravado", () => {
  assert.ok(acoes.includes("export async function alternarAgente(agenteId: string, ligar: boolean)"));
  assert.ok(acoes.includes("export async function publicarPromptAgente("));
  // o defeito que isto impede é a cópia preguiçosa de clara/actions.ts, que tinha o id cravado
  const corpo = acoes.split("export type { ResultadoAcao };")[1] ?? "";
  assert.ok(!corpo.includes('"clara"'), "o agente não pode ser cravado na action genérica");
  assert.ok(acoes.includes("payload: { agente_id: id, ativo: ligar }"));
  assert.ok(acoes.includes("p_agente_alvo: id"));
});

test("ligar e desligar passam pelo PONTO ÚNICO DE ESCRITA, com readback", () => {
  // O arquivo novo NÃO herda a exceção de `clara/actions.ts`: numa correção cujo assunto é "a tela
  // diz que gravou e não gravou", sucesso sem releitura da projeção seria a ironia cara.
  assert.ok(acoes.includes("registrarEventoComReadback({"));
  assert.ok(acoes.includes('tipo: "config_atualizada"'));
  assert.ok(!acoes.includes('.rpc("registrar_evento"'), "escrita direta pula o readback");
  assert.ok(!acoes.includes('.from("agente").update'), "escrita direta em core.agente é recusada por trigger");
});

test("a conferência de `config_atualizada` olha o EFEITO, não a existência da linha", () => {
  // Conferir só que o agente existe aprovaria uma linha que já existia ANTES da ação — é assim que
  // readback vira decoração. O filtro de `ativo` é o que separa os dois.
  const conf = readFileSync(new URL("../lib/eventos/confirmar-projecao.ts", import.meta.url), "utf8");
  const bloco = (conf.split("config_atualizada: {")[1] ?? "").slice(0, 400);
  assert.ok(bloco.includes('tabela: "agente"'));
  assert.ok(bloco.includes('{ campo: "id", op: "igualPayload", dePayload: "agente_id" }'));
  assert.ok(bloco.includes('{ campo: "ativo", op: "igualPayload", dePayload: "ativo" }'));
});

test("o interruptor da GRADE grava nos dois sentidos", () => {
  assert.ok(grade.includes("alternarAgente(a.chave, v)"), "a grade não chama a action");
  // o `setLigado(v)` solto dentro do onCheckedChange era o defeito: some do caminho do clique
  assert.ok(grade.includes("void alternar(v);"));
  assert.ok(!/onCheckedChange=\{\(v\) => \{[\s\S]{0,400}?\n\s*setLigado\(v\);\n\s*\}\}/.test(grade));
});

test("LIGAR a Clara continua passando pelo diálogo do número — e isso não pode ser 'simplificado'", () => {
  // O roteador `core.agentes_para_gatilho` não filtra por canal: ligar a Clara sem escolher o
  // número a punha para responder na WABA compartilhada com o Kommo (medido 11/09). O desvio é a
  // trava, e `DialogoLigarClara` grava `ativo` + `escopo_patch.canais` no MESMO evento.
  assert.ok(grade.includes('if (a.chave === "clara" && v) {'));
  assert.ok(grade.includes("setDialogoClara(true);"));
});

test("o interruptor da TELA do agente grava", () => {
  assert.ok(tela.includes("alternarAgente(a.chave, v)"));
  assert.ok(!tela.includes("onCheckedChange={setLigado}"), "o switch voltou a ser estado local");
});

test("publicar prompt chama o caminho versionado, com justificativa obrigatória", () => {
  assert.ok(tela.includes("publicarPromptAgente(a.chave, texto, justificativa, versao)"));
  assert.ok(tela.includes('id="prompt-justificativa"'), "sem campo de justificativa o banco recusa");
  assert.ok(tela.includes("const podePublicar = mudou && (ensaio || justificativa.trim().length > 0)"));
  // as duas etapas do 0007/0008: propor com lock por versão, depois validar
  assert.ok(acoes.includes('.rpc("propor_atualizacao_prompt"') && acoes.includes('.rpc("validar_sugestao"'));
  assert.ok(acoes.includes("p_versao_base: versaoBase"), "publicar sem lock sobrescreveria versão alheia");
});

test("a régua de autonomia fica em LEITURA fora do ensaio, e a tela diz por quê", () => {
  // `porta.proj_config_agente` (0107) aplica `ativo`, `config_patch` e `escopo_patch` — nenhum
  // toca `autonomia_jsonb`. Deixar a régua clicável seria o mesmo defeito, com outro nome.
  assert.ok(tela.includes("podeEditar={ensaio && gestao && ligado}"));
  assert.ok(tela.includes("A régua está em leitura porque não existe caminho de gravação"));
});

test("o ensaio continua com estado local — é o comportamento certo onde não há banco", () => {
  for (const arq of [grade, tela]) {
    assert.ok(arq.includes("if (ensaio) {\n      setLigado(v);\n      return;\n    }"));
  }
  // e o default é `false`: quem esquecer de passar `ensaio` vê um erro honesto do servidor,
  // nunca um sucesso de mentira
  assert.ok(grade.includes("ensaio = false,"));
  assert.ok(tela.includes("ensaio = false,"));
});

/*
 * ── "Só não explica o motivo do Levindo estar ligado" (Diogo, 14/09, olhando a tela) ───────────
 *
 * O card mostrava "● Ativo" ao lado do selo "em desenvolvimento", com o interruptor TRAVADO, e não
 * dizia por quê. Medido em produção antes de consertar:
 *     core.agente       levindo ativo=t · priscila ativo=f
 *     core.sugestao_ia  levindo 47, TODAS de 16/07/2026 (o smoke). Nada depois.
 *                       clara 256, a última de hoje — a única viva.
 * Ele está ligado porque NASCEU ligado na semente. "Ativo" é verdade sobre a coluna e mentira sobre
 * a operação, e é a segunda que a pessoa lê.
 */

const leitor = readFileSync(new URL("../lib/dados/agentes.ts", import.meta.url), "utf8");

test("agente que não opera não se anuncia como Ativo", () => {
  assert.ok(
    grade.includes('situacao={ligado && emDev ? "esperando_credencial" : ligado ? "ligado" : a.situacao}'),
    "ligado + em desenvolvimento voltou a mostrar o ponto verde de Ativo",
  );
});

test("o motivo de estar ligado fica VISÍVEL — tooltip é onde a informação vai para não ser lida", () => {
  assert.ok(leitor.includes("Ligado desde a semente de 16/07"));
  assert.ok(grade.includes("Ligado no banco, mas não opera."), "o motivo sumiu do corpo do card");
  // e só aparece no par que gera a contradição: ligado E sem operar
  assert.ok(grade.includes("{emDev && ligado && ("));
  assert.ok(leitor.includes("...(ativo ? [LIGADO_POR_SEMENTE] : [])"));
});

test("dá para DESLIGAR um agente que não opera — travar os dois sentidos era o defeito", () => {
  // Desligar é sempre seguro. Com `emDev` travando os dois lados, o Levindo ficava ligado sem que
  // ninguém pudesse desligá-lo pela tela.
  assert.ok(grade.includes("disabled={!gestao || gravando || ((emDev || impedido) && !ligado)}"));
  assert.ok(!grade.includes("disabled={!gestao || emDev || gravando"), "o travamento antigo voltou");
});

test("LIGAR o que não funciona continua travado", () => {
  // o predicado `(emDev || impedido) && !ligado` é o que guarda esse sentido
  assert.ok(grade.includes("(emDev || impedido) && !ligado"));
});
