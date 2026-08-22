/**
 * HIGIENIZAR — erro de banco vira frase que a operação pode ler.
 *
 * Nasceu dentro de `app/(app)/fila/actions.ts` em 22/08 (W3) e ficou preso lá. No MESMO commit em
 * que ele foi escrito para não mostrar nome de função à SDR, o botão de audiometria continuava
 * devolvendo o `error.message` cru do Postgres para a mesma pessoa, na mesma tela do lead — a
 * regra existia e valia para um caminho só.
 *
 * Está em `lib/` porque a regra é do sistema, não da fila: NENHUMA tela de operação é lugar de
 * `esquema.objeto`. Quem escrever a próxima ação de escrita passa o motivo por aqui.
 *
 * O que ele NÃO faz: não traduz. Traduzir erro conhecido é trabalho de cada ação (a fila tem o
 * `traduzirFalha`, que sabe o que "vencida" quer dizer). Isto aqui é a REDE do que ninguém
 * mapeou ainda — o desconhecido chega ilegível de qualquer jeito, mas chega sem nome técnico.
 */

/** Remove identificador qualificado (`esquema.objeto`) e a sigla do protocolo de chamada. */
export function higienizar(texto: string): string {
  return (texto ?? "")
    .replace(/\b[a-z_]+\.[a-z_]+\b/gi, "sistema")
    .replace(/\bRPC\b/gi, "chamada")
    .trim();
}
