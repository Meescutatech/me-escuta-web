/**
 * Lógica PURA da paginação do inbox (F22) — sem I/O, testável com node --test.
 *
 * KEYSET, não offset. A lista do inbox muda embaixo do operador o tempo todo: chega mensagem,
 * conversa sobe. Com offset, uma conversa que sobe entre a página 1 e a 2 faz a página 2 REPETIR
 * uma linha já exibida e PULAR outra. Com keyset ("continue depois deste par"), a virada de
 * página é estável mesmo com a lista se movendo.
 *
 * O cursor é o PAR `(ultima_entrada_em, id)` — o mesmo par que o F21 estabeleceu como ordem. Só
 * o timestamp não serve: dois carimbos iguais empatam, e no empate o keyset ou pula ou repete.
 */

/** Teto de uma página. O problema nunca foi o número — foi esconder as outras 44 calado. */
export const LIMITE_PAGINA = 50;

export interface Cursor {
  /** `ultima_entrada_em` da última linha da página. NULL é posição legítima (nulls last). */
  em: string | null;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paraBase64Url(texto: string): string {
  return btoa(texto).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string): string | null {
  try {
    const b = texto.replace(/-/g, "+").replace(/_/g, "/");
    return atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  } catch {
    return null;
  }
}

/**
 * Cursor opaco. Opaco de propósito: se ele parecesse um par legível, alguém montaria um à mão e
 * passaria a depender do formato — que é detalhe interno da consulta, não contrato de URL.
 */
export function codificar(c: Cursor): string {
  return paraBase64Url(JSON.stringify([c.em ?? "", c.id]));
}

/**
 * Cursor inválido devolve `null`, NUNCA lança e nunca "adivinha" um cursor parecido: quem chama
 * trata null como "começar do começo". Cursor corrompido não pode derrubar o inbox nem, pior,
 * virar silenciosamente uma consulta sem filtro que reembaralha a lista.
 */
export function decodificar(texto: string | null | undefined): Cursor | null {
  if (!texto || typeof texto !== "string") return null;
  const cru = deBase64Url(texto);
  if (cru == null) return null;
  let bruto: unknown;
  try {
    bruto = JSON.parse(cru);
  } catch {
    return null;
  }
  if (!Array.isArray(bruto) || bruto.length !== 2) return null;
  const [em, id] = bruto;
  if (typeof em !== "string" || typeof id !== "string") return null;
  if (!UUID.test(id)) return null;
  if (em !== "" && isNaN(new Date(em).getTime())) return null;
  return { em: em === "" ? null : em, id };
}

/**
 * Cursor da PRÓXIMA página: o par da última linha desta. `null` quando não há próxima — e não
 * haver próxima é uma afirmação, não um palpite: só se declara fim quando o total do servidor
 * confirma que tudo já veio.
 */
export function proximoCursor(
  pagina: Array<{ id: string; ultima_entrada_em?: string | null }>,
  temMais: boolean,
): string | null {
  if (!temMais || pagina.length === 0) return null;
  const ultima = pagina[pagina.length - 1];
  return codificar({ em: ultima.ultima_entrada_em ?? null, id: ultima.id });
}

/**
 * Ainda há conversa além das carregadas?
 *
 * Com o total do servidor, a resposta é EXATA — é por isso que o contador honesto vem antes da
 * paginação na ordem do item. Sem ele (leitura do total falhou), cai na heurística do funil
 * ("página cheia, provavelmente tem mais"), que erra para o lado de DECLARAR o corte. O erro
 * aceitável é avisar de um corte que não existe; esconder conversa calado é o defeito.
 */
export function houveCorte(carregadas: number, total: number | null, limite: number): boolean {
  if (total != null) return carregadas < total;
  return carregadas >= limite;
}

/**
 * Filtro keyset em sintaxe PostgREST, para `.or(...)`, na ordem
 * `ultima_entrada_em desc nulls last, id asc`.
 *
 * "Depois do par (em, id)" tem três caminhos, e é aqui que mora o erro fácil:
 *   - carimbo MENOR que o do cursor (desc → vem depois);
 *   - carimbo IGUAL e id maior (o desempate, sem o qual empate pula ou repete linha);
 *   - carimbo NULO (nulls last: todo NULL vem depois de todo não-nulo).
 * Quando o próprio cursor já está no bloco dos nulos, sobra só o desempate por id.
 *
 * Os valores vão entre aspas porque timestamp tem `+`, `:` e `-`, que são separadores na
 * gramática do PostgREST — sem aspas o filtro é lido errado em vez de dar erro, que é o pior
 * dos dois mundos.
 */
export function filtroKeyset(c: Cursor): string {
  if (c.em == null) return `and(ultima_entrada_em.is.null,id.gt.${c.id})`;
  const em = `"${c.em}"`;
  return [
    `ultima_entrada_em.lt.${em}`,
    `and(ultima_entrada_em.eq.${em},id.gt.${c.id})`,
    `ultima_entrada_em.is.null`,
  ].join(",");
}
