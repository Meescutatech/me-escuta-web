import type { Mensagem } from "@/lib/dados/conversas";

/**
 * Lógica pura das REAÇÕES na thread (E2) — sem React, testável.
 *
 * O QUE MUDA: uma reação deixa de ser uma bolha solta rotulada "Reação" com ícone de foto e passa
 * a ser um selo colado na mensagem que ela reagiu — quando essa mensagem está aqui.
 *
 * O TETO, medido contra produção em 10/09 e dito aqui para ninguém descobrir na tela: das 36
 * reações do ledger, 31 têm alvo (`reacao_alvo_wamid`, migration 0333), e **só 4 desses alvos
 * existem em `core.mensagem`**. Os outros 27 apontam para mensagens que a Sara mandou pelo Kommo,
 * que divide a WABA conosco e cujo envio nunca foi ingerido. Ou seja: hoje a reação cola na
 * mensagem certa em ~13% dos casos. O número melhora sozinho conforme o envio migrar para cá.
 *
 * Nos outros 87% a bolha continua existindo — mas diz o que sabe ("reagiu a uma mensagem que não
 * está nesta conversa") em vez de fingir com um ícone de foto.
 *
 * Por que é arquivo próprio e não um `if` no componente: o web testa com `node:test`, sem harness
 * de React. Regra dentro de JSX é regra que ninguém consegue pôr no vermelho (mesmo desenho de
 * `midia.ts` e `interativa.ts`).
 */

const TIPOS_REACAO = new Set(["reacao", "reaction"]);

export function ehReacao(tipo: string | null | undefined): boolean {
  return TIPOS_REACAO.has((tipo ?? "").toLowerCase());
}

/** O que a thread recebe depois de resolver as reações. */
export interface ReacoesResolvidas {
  /**
   * A linha do tempo SEM as reações que encontraram alvo — essas viraram selo, não bolha.
   * As que não encontraram continuam aqui, como bolha honesta.
   */
  linhaDoTempo: Mensagem[];
  /** id da mensagem alvo → emojis colados nela, na ordem em que chegaram. */
  selos: Map<string, string[]>;
}

/**
 * Resolve as reações de uma conversa contra as mensagens que ela tem.
 *
 * Regras, cada uma com o motivo:
 *
 * 1. Reação com alvo PRESENTE e emoji → vira selo no alvo e SAI da linha do tempo. É o "colar na
 *    mensagem" do cartão.
 * 2. Reação com alvo presente e emoji VAZIO → é a pessoa DESFAZENDO a reação (a Meta manda
 *    `reaction` sem emoji). Tira o último selo daquele alvo e some da linha do tempo. Mostrar
 *    "reagiu com nada" seria ruído; mostrar o selo antigo seria mentira.
 * 3. Reação com alvo AUSENTE (fora do nosso ledger) ou sem alvo (anterior ao RF-4.5) → fica na
 *    linha do tempo. A bolha diz que o alvo não está aqui; não inventa um.
 * 4. Reação sem alvo E sem emoji → some. Não há nada a dizer sobre ela.
 *
 * A ordem de `msgs` é a ordem da thread (cronológica): a regra 2 depende disso para tirar o selo
 * certo. Quem chama já passa a lista ordenada.
 *
 * Sem a coluna `reacao_alvo_wamid` no ambiente (a 0333 ainda não aplicada), toda reação cai na
 * regra 3 — que é exatamente o comportamento honesto: a tela não sabe o alvo e diz isso.
 */
export function resolverReacoes(msgs: Mensagem[]): ReacoesResolvidas {
  const idPorWamid = new Map<string, string>();
  for (const m of msgs) {
    if (m.wamid) idPorWamid.set(m.wamid, m.id);
  }

  const selos = new Map<string, string[]>();
  const linhaDoTempo: Mensagem[] = [];

  for (const m of msgs) {
    if (!ehReacao(m.tipo_conteudo)) {
      linhaDoTempo.push(m);
      continue;
    }
    const emoji = (m.corpo ?? "").trim();
    const alvoId = m.reacao_alvo_wamid ? idPorWamid.get(m.reacao_alvo_wamid) : undefined;

    if (alvoId) {
      if (emoji) {
        const lista = selos.get(alvoId) ?? [];
        lista.push(emoji);
        selos.set(alvoId, lista);
      } else {
        const lista = selos.get(alvoId);
        if (lista && lista.length) {
          lista.pop();
          if (!lista.length) selos.delete(alvoId);
        }
      }
      continue; // regras 1 e 2: fora da linha do tempo
    }

    if (emoji) linhaDoTempo.push(m); // regra 3
    // regra 4: sem alvo e sem emoji — nada a dizer
  }

  return { linhaDoTempo, selos };
}

/** Texto do selo: emojis repetidos viram contagem ("👍 2"), como no WhatsApp. */
export function textoDoSelo(emojis: string[]): string {
  const contagem = new Map<string, number>();
  for (const e of emojis) contagem.set(e, (contagem.get(e) ?? 0) + 1);
  return [...contagem.entries()].map(([e, n]) => (n > 1 ? `${e} ${n}` : e)).join(" ");
}
