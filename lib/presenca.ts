/**
 * Regras do heartbeat de presença (SPEC-WORKSPACE-USUARIOS §7.1) — lógica PURA, testável.
 * O batimento `presenca_registrada` só é emitido quando TODAS as condições valem:
 *   1. sessão autenticada ativa;
 *   2. aba VISÍVEL (Page Visibility API);
 *   3. interação (tecla/clique/scroll/mouse) nos últimos INTERACAO_MS.
 * Cadência de 60s. A derivação de janelas/tempo online é 100% do banco (view 0036) —
 * o front não calcula nada, só pulsa.
 */

export const BATIMENTO_MS = 60_000;
export const INTERACAO_MS = 300_000;

export interface EstadoPresenca {
  autenticado: boolean;
  abaVisivel: boolean;
  /** ms desde a última interação do usuário (tecla, clique, scroll, mousemove). */
  msDesdeInteracao: number;
}

export function devePulsar(e: EstadoPresenca): boolean {
  return e.autenticado && e.abaVisivel && e.msDesdeInteracao < INTERACAO_MS;
}

/** Envelope da porta p/ eventos de atividade (api.registrar_evento força ator+origem). */
export function montarEnvelopeAtividade(
  tipo: "presenca_registrada" | "sessao_iniciada" | "sessao_encerrada" | "conversa_aberta",
  payload: Record<string, unknown>,
  idExterno: string,
): Record<string, unknown> {
  return { tipo, id_externo: idExterno, versao_payload: 1, payload };
}
