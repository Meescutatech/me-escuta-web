import type { ResultadoEvento } from "@/app/(app)/funil/actions";
import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import type { AjustePropostaTarefa, PropostaTarefaPendente } from "@/lib/tarefas/propostas";

/**
 * QUEM EXECUTA AS ESCRITAS DA /tarefas (W-D5, 10/09).
 *
 * Os painéis (concluir, adiar, reatribuir, arquivar, "e agora?", proposta do Jarvis) não chamam
 * a server action direto: recebem um executor. Em produção o executor É a server action de
 * sempre (app/(app)/lead/actions.ts, app/(app)/tarefas/actions.ts) — nada mudou no caminho de
 * escrita. No ENSAIO (W-D2, sem banco) o executor é estado local do componente: a tarefa some da
 * fila, o prazo muda, a proposta vira tarefa — na tela, na hora, sem tocar em ledger nenhum.
 *
 * O contrato é o mesmo dos dois lados: devolve `ResultadoEvento`, e `ok:false` traz o motivo em
 * português. Quem desenha o botão não sabe (nem precisa) se por trás há Postgres ou um `Map`.
 */
export interface ExecutorTarefas {
  concluir(t: TarefaVisao, resultado: string): Promise<ResultadoEvento>;
  /** `tarefa_prazo_repactuado` — motivo obrigatório (o preset é o motivo) */
  adiar(t: TarefaVisao, prazoIso: string, motivo: string): Promise<ResultadoEvento>;
  reatribuir(t: TarefaVisao, responsavelId: string): Promise<ResultadoEvento>;
  arquivar(t: TarefaVisao, motivo: string): Promise<ResultadoEvento>;
  /** `tarefa_criada` — a próxima, depois do "e agora?" */
  criar(dados: NovaTarefa): Promise<ResultadoEvento>;
  /**
   * proposta do Jarvis: aceitar (com ou sem ajuste) ou descartar. `motivoDescarte` é o que o card
   * coleta ("já resolvido" / "não faz sentido" / outro + texto) — a porta ainda não tem campo
   * para ele ([E] no STATUS); fica no contrato para não se perder no caminho.
   */
  validarProposta(
    p: PropostaTarefaPendente,
    decisao: "aprovada" | "rejeitada",
    ajuste?: AjustePropostaTarefa,
    motivoDescarte?: string | null,
  ): Promise<ResultadoEvento>;
}

export interface NovaTarefa {
  leadId: string;
  leadNome: string | null;
  titulo: string;
  tipo: string | null;
  responsavelId: string | null;
  prazoIso: string | null;
  prioridade?: "alta" | "media" | "baixa" | null;
}

/** As ações de UMA tarefa, já amarradas a ela — o que os painéis inline recebem. */
export interface AcoesDaTarefa {
  concluir?: (resultado: string) => Promise<ResultadoEvento>;
  adiar?: (prazoIso: string, motivo: string) => Promise<ResultadoEvento>;
  reatribuir?: (responsavelId: string) => Promise<ResultadoEvento>;
  arquivar?: (motivo: string) => Promise<ResultadoEvento>;
}
