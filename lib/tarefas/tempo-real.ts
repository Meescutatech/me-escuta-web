"use client";

import { useProjecaoViva, type EstadoVivo } from "@/components/projecao-viva";
import type { FonteViva } from "@/components/projecao-viva";
import { INTERVALOS } from "@/lib/intervalos-vivos";

/**
 * Tarefas "vivas" (F8 · 27/08) — a MESMA casca fina de `components/conversas/tempo-real.ts`
 * (`useConversaViva`), apontada para `core.tarefa`. A dica chega por postgres_changes (a tabela está
 * na publication `supabase_realtime` desde a 0038) e o refetch é o `router.refresh()` do
 * `useProjecaoViva`: a /tarefas re-lê `core.v_tarefa` + `em_andamento` server-side, e o quadro
 * anda sozinho quando outro ator conclui, inicia ou o Jarvis cria (D62).
 *
 * O polling de 15 s (INTERVALOS.tarefas) é rede de segurança, não motor. A colisão de tópico com o
 * sino (que também assina core.tarefa em toda tela) é resolvida DENTRO do hook — ver "TÓPICO ÚNICO"
 * em components/projecao-viva.ts.
 */
export function montarFontesTarefas(): FonteViva[] {
  return [{ tabela: { schema: "core", table: "tarefa" } }];
}

export function useTarefasVivas(): EstadoVivo {
  return useProjecaoViva(montarFontesTarefas(), { intervaloMs: INTERVALOS.tarefas });
}
