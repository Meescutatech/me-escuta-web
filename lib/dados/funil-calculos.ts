/**
 * Lógica PURA do funil — sem I/O, testável com node --test (as queries ficam em funil.ts,
 * que é server-only e não importa em teste).
 */

/**
 * Teto da leitura do board. O banco já passou de 600 cards (import da Trilha A) e cresce;
 * bater no teto NUNCA pode virar descarte silencioso — lerFunil sinaliza `corte` e a UI avisa.
 * Se o board real chegar perto disso, o caminho é paginação/virtualização (rodada futura).
 */
export const TETO_CARDS = 2000;

/**
 * O board exibe EXATAMENTE as etapas da config vigente (funil_vendas) — a leitura de cards
 * filtra por estas chaves no banco, então etapa fora do funil ('arquivado' etc.) nunca
 * entra no board nem rouba vaga do teto.
 */
export function chavesDoBoard(etapas: Array<{ chave: string }>): string[] {
  return etapas.map((e) => e.chave);
}

/** Leitura bateu no teto? (>= porque o PostgREST nunca devolve mais que o limit). */
export function houveCorte(qtdLida: number, teto: number): boolean {
  return qtdLida >= teto;
}

// ─────────────── régua do funil (assinatura visual R9 — nas 3 telas) ───────────────

export type SegmentoRegua = "ok" | "atual" | "futura" | "fraca";

/**
 * Régua do lead (painel da conversa): 1 segmento por etapa ABERTA, preenchidas até a etapa
 * atual. Etapa fora da lista (ganho/perdido/desconhecida) → tudo "futura" (não inventar
 * progresso).
 */
export function segmentosReguaLead(
  etapasAbertas: Array<{ chave: string }>,
  etapaAtual: string | null,
): SegmentoRegua[] {
  const idx = etapaAtual ? etapasAbertas.findIndex((e) => e.chave === etapaAtual) : -1;
  return etapasAbertas.map((_, i) => (idx < 0 ? "futura" : i < idx ? "ok" : i === idx ? "atual" : "futura"));
}

/** Régua agregada (dashboard): etapa com lead = "ok"; vazia = "fraca"; contagem nula = "fraca". */
export function segmentosReguaAgregada(faixas: Array<{ qtd: number | null }>): SegmentoRegua[] {
  return faixas.map((f) => ((f.qtd ?? 0) > 0 ? "ok" : "fraca"));
}
