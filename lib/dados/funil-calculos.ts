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
