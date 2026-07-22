/**
 * PRESENÇA (Rodada 11 — Bloco B): lógica PURA dos gatilhos de presença do /conversas.
 * O que a API oficial suporta (research/WHATSAPP-PRESENCA-CLOUD-API.md): mark-as-read e
 * "digitando…" (até 25s), sempre atrelados à última mensagem RECEBIDA — quem resolve wamid/canal
 * e fala com a Graph é o RUNTIME (rota /presenca); aqui só decidimos QUANDO sinalizar.
 *
 * Regras:
 *   - "lida": ao abrir a conversa (1x por abertura — o servidor marca as anteriores junto).
 *   - "digitando": enquanto a Sara digita no composer, com THROTTLE por conversa — o indicador
 *     da Meta dura ~25s, então re-sinalizar a cada 20s mantém o "digitando…" vivo sem martelar.
 *   - Tudo best-effort: falha de presença é silenciosa (no máximo console), nunca UI de erro.
 */

export type AcaoPresenca = "lida" | "digitando";

export function acaoPresencaValida(a: unknown): a is AcaoPresenca {
  return a === "lida" || a === "digitando";
}

/** Janela do throttle do "digitando…": < 25s do indicador da Meta, sem flood (1 POST / 20s). */
export const JANELA_DIGITANDO_MS = 20_000;

export interface GatilhoDigitando {
  /**
   * true ⇒ está na hora de sinalizar "digitando" pra esta conversa (e REGISTRA o disparo).
   * false ⇒ ainda dentro da janela; não sinaliza.
   */
  deve(conversaId: string, agoraMs: number): boolean;
  /** zera o relógio da conversa (ex.: mensagem enviada — o typing caiu na Meta). */
  zerar(conversaId: string): void;
}

/** Throttle POR CONVERSA (trocar de conversa não herda o relógio da anterior). */
export function criarGatilhoDigitando(janelaMs: number = JANELA_DIGITANDO_MS): GatilhoDigitando {
  const ultimo = new Map<string, number>();
  return {
    deve(conversaId: string, agoraMs: number): boolean {
      if (!conversaId) return false;
      const anterior = ultimo.get(conversaId);
      if (anterior !== undefined && agoraMs - anterior < janelaMs) return false;
      ultimo.set(conversaId, agoraMs);
      return true;
    },
    zerar(conversaId: string): void {
      ultimo.delete(conversaId);
    },
  };
}

/** Corpo EXATO do POST /presenca do runtime (contrato web ↔ borda). */
export function montarCorpoPresenca(conversaId: string, acao: AcaoPresenca): string {
  return JSON.stringify({ conversa_id: conversaId, acao });
}
