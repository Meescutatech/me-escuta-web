"use client";

import { useProjecaoViva, type EstadoVivo } from "@/components/projecao-viva";
import { montarFontesConversa } from "@/lib/tempo-real";
import { INTERVALOS, PISO_SEM_TEMPO_REAL } from "@/lib/intervalos-vivos";

/**
 * Conversa "viva" (SPEC RF-9/32) — casca fina sobre useProjecaoViva (Rodada 9).
 *
 * F5 (Rodada 16): as fontes vêm de `montarFontesConversa`, que assina SÓ postgres_changes
 * (core.conversa para a lista, core.mensagem filtrada para a thread aberta). O canal privado de
 * Broadcast saiu: sem política de leitura em `realtime.messages` ele morre com
 * `CHANNEL_ERROR: Unauthorized` e, por estar no MESMO canal, levava o postgres_changes junto —
 * era esse o motivo de o inbox não ser ao vivo. Religar o Broadcast é acrescentar uma fonte com
 * canal PRÓPRIO, sem tocar nestas.
 *
 * O refetch é router.refresh() — a página /conversas re-lê TUDO server-side, incluindo o painel
 * do lead (ficha/tarefas/anotações da R8): mensagem nova → painel re-busca junto.
 *
 * F4 (mesmo diff): o polling é PISO, e o piso só pode ser longo quando o tempo real está de pé.
 * Com assinatura confirmada → 30 s. Sem ela → 10 s, para o inbox nunca demorar meio minuto para
 * mostrar mensagem nova.
 */
export function useConversaViva(conversaId: string | null, ativo: boolean): EstadoVivo {
  return useProjecaoViva(montarFontesConversa(conversaId), {
    intervaloMs: INTERVALOS.conversas,
    pisoSemTempoRealMs: PISO_SEM_TEMPO_REAL,
    ativo,
  });
}
