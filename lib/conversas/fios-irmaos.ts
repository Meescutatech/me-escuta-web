/**
 * OS FIOS IRMÃOS — as outras conversas da MESMA pessoa, por outros números.
 *
 * Pedido do COO com print do Kommo: *"mesma página em threads diferentes"*. Lá, a página do contato
 * empilha um bloco por canal. Aqui, a conversa aberta continua sendo o centro e os irmãos aparecem
 * abaixo dela — cada um com a etiqueta do número e um jeito de abrir.
 *
 * ── Por que DERIVA em vez de consultar ───────────────────────────────────────────────────────
 * A página `/conversas` já carrega a lista inteira de conversas visíveis, e cada linha
 * (`ConversaResumo`) já traz `lead_id`, `previa`, `previa_saida`, `atualizado_em` e os quatro campos
 * do número (M7). O dado está no cliente; ir ao banco de novo seria pagar duas vezes pelo mesmo.
 * A primeira versão do teste deste módulo exigia uma leitura nova no servidor — estava errada, e foi
 * reescrita antes de virar código.
 *
 * ── A regra de parentesco é o `lead_id`, e só ele ────────────────────────────────────────────
 * Telefone igual NÃO basta: conversa sem lead não tem prova de ser a mesma pessoa, e errar aqui
 * mostra a conversa de um desconhecido dentro da de outro. Sem lead, não há irmão.
 */

export interface FioIrmao {
  id: string;
  lead_id?: string | null;
  atualizado_em?: string | null;
  previa?: string | null;
  previa_saida?: boolean;
  /** os quatro do M7 — o `chipDoNumero` os consome inteiros (ver `rotuloDoFio`). */
  phone_number_id?: string | null;
  numero_apelido?: string | null;
  numero_e164?: string | null;
  finalidade?: "producao" | "teste" | null;
}

/**
 * As conversas do mesmo lead, exceto a que já está aberta, da mais recente para a mais antiga.
 * Fio sem `atualizado_em` vai para o fim e NÃO some: fio invisível é o dano nº 1 desta tela — foi
 * exatamente o que aconteceu no 1b, e o que estas guardas existem para impedir.
 */
export function fiosIrmaos<T extends FioIrmao>(conversas: T[], abertaId: string | null): T[] {
  if (!abertaId) return [];
  const aberta = conversas.find((c) => c.id === abertaId);
  const lead = aberta?.lead_id ?? null;
  if (!lead) return [];

  return conversas
    .filter((c) => c.id !== abertaId && c.lead_id === lead)
    .sort((a, b) => {
      const ta = a.atualizado_em ? Date.parse(a.atualizado_em) : Number.NEGATIVE_INFINITY;
      const tb = b.atualizado_em ? Date.parse(b.atualizado_em) : Number.NEGATIVE_INFINITY;
      return tb - ta;
    });
}
