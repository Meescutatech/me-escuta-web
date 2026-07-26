/**
 * Read-back do limite de escrita (achado da verificação clicada da R15):
 * "sucesso" só depois de confirmar que a projeção EXISTE — o ledger aceitar não
 * basta. A R14/R15 provou ao vivo que um dispatcher sem o ramo aceita
 * `template_criado` e perde em silêncio: o form fecha "com sucesso" e a lista
 * volta vazia.
 *
 * Por que isso é uma leitura determinística, e não polling: a projeção é
 * SÍNCRONA na mesma transação (`porta.inserir_evento` chama
 * `porta.aplicar_projetores` antes de retornar) e os projetores carimbam
 * `ultima_posicao = posicao_global` do evento. Quando o RPC volta, a linha com
 * essa posição existe — ou nunca vai existir.
 *
 * NÃO generalizar como "dispatcher recusa tipo desconhecido": há tipos
 * deliberadamente sem projetor (ex.: `levindo_acionado` fica só no ledger).
 * A apólice é por ação, no limite de escrita. Para estender a nota/tarefa do
 * composer: mesma avaliação pura, muda só a tabela conferida.
 */

/** O que `api.registrar_evento` devolve (via `porta.recebe_evento_externo`). */
export interface RespostaRegistrarEvento {
  duplicado?: boolean;
  evento_id?: string;
  posicao_global?: number;
}

export const MOTIVO_NAO_PROJETADO =
  "o evento entrou no ledger mas a projeção não apareceu — provável ramo perdido no dispatcher (a tela voltaria a mentir); avise quem cuida do banco";

/**
 * Posição a conferir na projeção, ou null quando não há o que conferir:
 * duplicado é idempotência (não é falha; a projeção vigente é a do evento
 * original) e resposta sem `posicao_global` é contrato antigo — não inventar
 * falha onde não há chave de conferência.
 */
export function posicaoParaConferir(
  resposta: RespostaRegistrarEvento | null | undefined,
): number | null {
  if (!resposta || resposta.duplicado) return null;
  return typeof resposta.posicao_global === "number" ? resposta.posicao_global : null;
}

/** Veredito puro: `encontrou = null` significa "não havia o que conferir". */
export function avaliarProjecao(encontrou: boolean | null): { ok: boolean; motivo?: string } {
  if (encontrou === false) return { ok: false, motivo: MOTIVO_NAO_PROJETADO };
  return { ok: true };
}
