import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import { ehDoDia, ordenarDia } from "@/lib/tarefas/dia";
import type { SessaoFocoCookie } from "@/lib/tarefas/sessao-foco";

/**
 * O MODO FOCO — a fila de uma tarefa por vez (W-T, 10/09/2026 noite).
 *
 * Pedido literal do workshop (12/08, R8): *"Não quero que você abra múltiplas telas."* E o número
 * que o justifica é do Rodolfo, na mesma sala: *"Ela tá gastando metade do tempo dela pra poder
 * priorizar e a outra metade pra poder escrever a tarefa."* O modo foco tira as duas metades da
 * frente: a ordem é decidida antes (a fila do dia), e a conversa fica AO LADO — não noutra aba.
 *
 * Benchmark de hoje §4.8: é o "Start [x] tasks" do HubSpot (abre a 1ª e navega uma a uma) sobre a
 * view do §4.7 (o Inbox Today do Close: vencidas ∪ hoje, juntas, porque a pergunta é "o que faço
 * agora").
 *
 * ── A REGRA QUE MOLDA ESTE ARQUIVO ────────────────────────────────────────────────────────────
 * A ORDEM CONGELA quando a sessão começa. Se a fila fosse recalculada a cada ação, concluir uma
 * tarefa reordenaria as outras debaixo da pessoa — e o "3 de 12" mentiria a cada passo (o
 * denominador encolhendo é o pior: parece progresso e é só a régua mudando). Então `ordem` é
 * gravada uma vez, e daí em diante só se REMOVE (concluída, arquivada, adiada para fora do dia) e
 * se REORDENA o que foi PULADO — que vai para o fim, nunca para fora.
 *
 * Pular ≠ adiar. Adiar muda o prazo e é um evento (`tarefa_prazo_repactuado`, com motivo). Pular é
 * "agora não, hoje sim": não toca no prazo, não vira evento hoje, e a tarefa volta no fim da fila.
 * Está em `pesquisa/TAREFAS-MODO-FOCO-E-RESUMO-DO-JARVIS-2026-09-10.md` §5 como candidato a
 * `tarefa_pulada` — enquanto não existir, vive no cookie do ensaio e na memória da sessão.
 *
 * Tudo aqui é puro: recebe as tarefas já com as escritas aplicadas e devolve recortes.
 */

/** a tarefa ainda merece um lugar na fila desta sessão? */
export function segueNaFila(t: TarefaVisao, agoraMs: number): boolean {
  return t.status === "pendente" && ehDoDia(t, agoraMs);
}

/**
 * A ordem em que a sessão vai percorrer — congelada no começo. É a mesma ordenação da view Hoje
 * (`ordenarDia`: vencida primeiro, depois prazo, depois prioridade), para o modo foco não
 * discordar da lista de onde a pessoa veio.
 */
export function ordemInicial(tarefas: TarefaVisao[], agoraMs: number): string[] {
  return ordenarDia(tarefas.filter((t) => segueNaFila(t, agoraMs))).map((t) => t.id);
}

export interface FilaDoFoco {
  /** o que ainda falta, na ordem: as não puladas primeiro, as puladas no fim */
  pendentes: TarefaVisao[];
  /** puladas que continuam pendentes — voltam no fim, e aparecem no "zero por hoje" */
  puladas: TarefaVisao[];
  /** saíram da fila nesta sessão (concluída, arquivada ou adiada para fora do dia) */
  resolvidas: TarefaVisao[];
  /** quantas a sessão tinha quando começou — o denominador do "3 de 12", que nunca muda */
  total: number;
}

/**
 * Recorta a fila viva a partir da ordem congelada. Tarefa que entrou DEPOIS (a criada no "e
 * agora?", por exemplo) não invade a sessão: ela é do dia, mas a ordem desta sessão já foi dada —
 * entra no fim, e por isso o total cresce junto (senão o contador passaria de 12 de 12).
 */
export function filaDoFoco(tarefas: TarefaVisao[], sessao: SessaoFocoCookie | null, agoraMs: number): FilaDoFoco {
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const ordem = sessao?.ordem ?? ordemInicial(tarefas, agoraMs);
  const puladasSet = new Set(sessao?.puladas ?? []);
  const vistos = new Set(ordem);
  // as que nasceram depois da sessão começar entram no fim da ordem
  const novas = ordenarDia(tarefas.filter((t) => !vistos.has(t.id) && segueNaFila(t, agoraMs))).map((t) => t.id);
  const ordemViva = [...ordem, ...novas];

  const pendentes: TarefaVisao[] = [];
  const puladas: TarefaVisao[] = [];
  const resolvidas: TarefaVisao[] = [];
  for (const id of ordemViva) {
    const t = porId.get(id);
    if (!t) continue;
    if (!segueNaFila(t, agoraMs)) {
      resolvidas.push(t);
      continue;
    }
    if (puladasSet.has(id)) puladas.push(t);
    else pendentes.push(t);
  }
  return { pendentes: [...pendentes, ...puladas], puladas, resolvidas, total: ordemViva.length };
}

/**
 * Onde a pessoa está e qual é a atual. `atual` só some quando a fila zera — nunca há um instante
 * de tela vazia no meio do percurso: se a atual saiu, a próxima já ocupa o mesmo lugar.
 */
export function posicaoNoFoco(fila: FilaDoFoco, atualId: string | null): { atual: TarefaVisao | null; indice: number; feitas: number } {
  const feitas = fila.resolvidas.length;
  if (fila.pendentes.length === 0) return { atual: null, indice: -1, feitas };
  const i = atualId ? fila.pendentes.findIndex((t) => t.id === atualId) : -1;
  const indice = i >= 0 ? i : 0;
  return { atual: fila.pendentes[indice], indice, feitas };
}

/** quem entra no lugar de `id` — a próxima da fila, ou a anterior se ele era o último */
export function depoisDe(fila: TarefaVisao[], id: string): string | null {
  const i = fila.findIndex((t) => t.id === id);
  if (i < 0) return fila[0]?.id ?? null;
  return fila[i + 1]?.id ?? fila[i - 1]?.id ?? null;
}

/** "3 de 12" — 1-based, e o denominador é o total congelado */
export function rotuloProgresso(indice: number, feitas: number, total: number): string {
  return `${Math.min(feitas + indice + 1, total)} de ${total}`;
}

/** fração 0..1 do que já saiu da fila — a barra do cabeçalho */
export function fracaoFeita(feitas: number, total: number): number {
  return total > 0 ? Math.min(1, feitas / total) : 0;
}
