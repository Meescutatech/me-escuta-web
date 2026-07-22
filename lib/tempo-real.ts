/**
 * Lógica PURA do tempo real (Rodada 9, fase 1) — sem I/O, testável com node --test.
 * O hook (components/projecao-viva.ts) usa estas funções; a "verdade" é sempre a releitura
 * das projeções via server component (router.refresh) — realtime é só DICA.
 */

/** Debounce do refetch: várias dicas em rajada viram UMA releitura. */
export function deveRefazer(ultimaMs: number, agoraMs: number, folgaMs: number): boolean {
  return agoraMs - ultimaMs >= folgaMs;
}

/**
 * Cards que ENTRARAM desde a última leitura (pro pulso visual discreto de 1x).
 * Primeira leitura não pulsa nada (prevIds vazio + primeiraLeitura=true).
 */
export function novosIds(
  prevIds: ReadonlySet<string>,
  atuais: readonly string[],
  primeiraLeitura: boolean,
): string[] {
  if (primeiraLeitura) return [];
  return atuais.filter((id) => !prevIds.has(id));
}

/** Carimbo "atualizado há Xs" do dashboard. <5s = "agora". */
export function fmtAtras(segundos: number): string {
  if (segundos < 5) return "agora";
  if (segundos < 60) return `há ${Math.floor(segundos)}s`;
  const min = Math.floor(segundos / 60);
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  return `há ${h}h`;
}
