"use client";

import { useProjecaoViva, type FonteViva } from "@/components/projecao-viva";

/**
 * Conversa "viva" (SPEC RF-9/32) — casca fina sobre useProjecaoViva (Rodada 9), mantendo os
 * MESMOS sinais do contrato com a Trilha A (Broadcast from Database):
 *   · canal `conversas`     → mudou a lista (mensagem nova em qualquer conversa)
 *   · canal `conversa:<id>` → mudou a conversa aberta (mensagem/status/sugestão)
 *   · postgres_changes em core.conversa/core.mensagem → dica alternativa
 * O refetch é router.refresh() — a página /conversas re-lê TUDO server-side, incluindo o
 * painel do lead (ficha/tarefas/anotações da R8): mensagem nova → painel re-busca junto.
 * Fallback enquanto a publication não existe: polling 5s com aba visível + refetch no foco.
 */
export function useConversaViva(conversaId: string | null, ativo: boolean) {
  const fontes: FonteViva[] = [
    { canal: "conversas", tabela: { schema: "core", table: "conversa" } },
  ];
  if (conversaId) {
    fontes.push({
      canal: `conversa:${conversaId}`,
      tabela: { schema: "core", table: "mensagem", filter: `conversa_id=eq.${conversaId}` },
    });
  }
  useProjecaoViva(fontes, { intervaloMs: 5000, ativo });
}
