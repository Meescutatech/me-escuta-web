/**
 * A regra do DESFECHO — extraída do componente em 22/08 para poder ser executada por teste.
 *
 * `components/tarefas/concluir-tarefa.tsx` é .tsx com JSX: o `node --test` deste repo não o
 * importa. Enquanto a regra morava lá dentro, "resultado é obrigatório" era uma frase de
 * comentário e um atributo `disabled` — nenhum dos dois é régua. É o mesmo motivo pelo qual
 * `montarUltimaMensagem` mora no módulo puro (ver o ⚠️ em funil-calculos.ts): regra sem execução
 * coberta é regra que some numa refatoração e ninguém percebe.
 */

export type Desfecho = { ok: true; desfecho: string } | { ok: false; motivo: string };

/**
 * O que vai no `payload.resultado` do `tarefa_concluida` — ou a recusa.
 *
 * ⚠️ VAZIO NÃO VIRA NADA AQUI, e é de propósito. `concluirTarefaNotificacao` (a ação da tarefa
 * ÓRFÃ) faz `resultado.trim() || "concluída"`: se o campo chegar vazio nela, ela mesma preenche e
 * a porta do banco — que EXIGE resultado não-vazio (migration 0037, `check_violation`,
 * "o desfecho é o dado, não o fechamento") — nunca chega a ver o vazio para recusar.
 *
 * O valor que entraria no ledger seria a string "concluída": exatamente o registro sem conteúdo
 * que o benchmark §4.1.2 mede no Kommo, onde 70,9% das tarefas concluídas não dizem o que
 * aconteceu. Barrar aqui é o que impede a /tarefas de reproduzir esse número.
 */
export function desfechoDaConclusao(resultado: string): Desfecho {
  const desfecho = resultado.trim();
  if (!desfecho) return { ok: false, motivo: "descreva o resultado para concluir" };
  return { ok: true, desfecho };
}
