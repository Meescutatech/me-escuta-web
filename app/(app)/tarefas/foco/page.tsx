import { redirect } from "next/navigation";

/**
 * `/tarefas/foco` — REDIRECIONA (decisão do Diogo, 11/09 00:20).
 *
 * Esta rota chegou a ser a tela do modo foco (tarefa à esquerda, conversa à direita) no commit
 * `69054a9`. O Diogo fechou o conceito noutro lugar: *"Será a TELA DE CONVERSAS, onde cada
 * conversa será uma tarefa."* O modo foco passou a ser um ESTADO de `/conversas`, e o que /tarefas
 * entrega para ele é dado, não tela — `lib/tarefas/foco.ts`, `components/tarefas/item-lista-foco.tsx`
 * e `components/tarefas/faixa-tarefa-conversa.tsx`.
 *
 * A rota fica de pé em vez de sumir porque o link já circulou nesta sessão (prints, STATUS, o
 * botão da toolbar): link que existiu e vira 404 manda a pessoa procurar o que ela não perdeu.
 */
export default function FocoPage() {
  redirect("/conversas?foco=1");
}
