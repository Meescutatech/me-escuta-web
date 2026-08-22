import { test } from "node:test";
import assert from "node:assert/strict";
import { desfechoDaConclusao } from "../components/tarefas/regras/conclusao.ts";

/*
 * ── "RESULTADO OBRIGATÓRIO" tinha de ser executável, não uma frase de comentário ───────────────
 *
 * A /tarefas passou a concluir tarefa ÓRFÃ (sem lead) em 22/08. Nesse caminho a ação
 * `concluirTarefaNotificacao` faz `resultado.trim() || "concluída"`: ela mesma preenche o vazio, e
 * a porta do banco — que EXIGE resultado não-vazio (migration 0037, check_violation) — nunca vê o
 * vazio para recusar. Sobrava a UI, e "UI" era um atributo `disabled`, que não é guarda.
 *
 * Estes testes são a régua que faltava. O que eles protegem tem número: §4.1.2 do benchmark mede
 * 29,1% de tarefas concluídas COM resultado no Kommo — os outros 70,9% são "concluída" e variantes
 * vazias. Gravar isso no ledger event-sourced é pior que no Kommo, porque o evento é imutável.
 */

test("vazio, espaço e quebra de linha são RECUSADOS — não viram 'concluída' por conta própria", () => {
  for (const entrada of ["", " ", "   ", "\t", "\n", " \n\t "]) {
    const d = desfechoDaConclusao(entrada);
    assert.equal(d.ok, false, `"${entrada.replace(/\n/g, "\\n")}" deveria ser recusado`);
    assert.equal(d.ok === false && d.motivo, "descreva o resultado para concluir");
  }
});

test("desfecho real passa, já aparado — é o que entra no payload do tarefa_concluida", () => {
  const d = desfechoDaConclusao("  atendeu, quer remarcar para sexta  ");
  assert.equal(d.ok, true);
  assert.equal(d.ok === true && d.desfecho, "atendeu, quer remarcar para sexta");
});

test("um caractere basta: a regra é NÃO-VAZIO, não julgamento de qualidade da escrita", () => {
  // a Sarah tem 697 tarefas atrasadas; um portão que exige redação afugenta o registro e
  // devolve o problema pelo outro lado
  const d = desfechoDaConclusao("x");
  assert.equal(d.ok, true);
  assert.equal(d.ok === true && d.desfecho, "x");
});

test("a recusa concorda com a do caminho COM lead (app/(app)/lead/actions.ts:152)", () => {
  // as duas mensagens têm de ser a mesma: o operador não pode ver textos diferentes para a mesma
  // recusa conforme a tarefa tenha ou não lead
  const d = desfechoDaConclusao("");
  assert.equal(d.ok === false && d.motivo, "descreva o resultado para concluir");
});
