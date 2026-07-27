/**
 * Cache de URL assinada da mídia (F13) — lógica PURA, sem I/O, testável com node --test.
 *
 * O DEFEITO que isto conserta não é "a imagem não carrega". É a imagem carregar DE NOVO, e de novo:
 * `createSignedUrls` devolve um token novo a cada chamada, `lerMensagens` roda a cada
 * `router.refresh()`, e URL nova significa `src` diferente — então o navegador baixa a foto outra
 * vez. O cache do navegador nunca é usado, porque a chave dele é a URL.
 *
 * ESTABILIZAR A URL É A CORREÇÃO. Qualquer outra coisa (comprimir, redimensionar) é sintoma.
 *
 * O cache vive no SERVIDOR, por processo: quem assina é o server component, a cada requisição.
 * Não é cache de dado — é cache de credencial de leitura, e ele some no deploy.
 *
 * A REGRA QUE NÃO PODE SER QUEBRADA: o TTL do cache tem de ser MENOR que o da assinatura. Se
 * empatar, entregamos URL vencida e a bolha cai no estado de erro — que é pior que baixar de novo.
 * Daí a margem, e daí ela estar num lugar só.
 */

/** TTL pedido ao Storage ao assinar. */
export const TTL_ASSINATURA_SEG = 3600;

/**
 * Folga entre "paro de reusar" e "a assinatura vence". 10 min sobre 60 é 6× o pior caso de uma
 * requisição lenta — a URL entregue no último instante do cache ainda tem 10 minutos de vida.
 */
export const MARGEM_SEG = 600;

/** Enquanto isto não passar, a MESMA URL é reusada. Sempre < TTL_ASSINATURA_SEG, por construção. */
export const TTL_CACHE_SEG = TTL_ASSINATURA_SEG - MARGEM_SEG;

export interface EntradaMidia {
  url: string;
  /** instante (ms) em que a assinatura foi pedida — não o de vencimento, para o cálculo ser um só */
  assinadaEm: number;
}

export type ArmazemMidia = Map<string, EntradaMidia>;

export function criarArmazem(): ArmazemMidia {
  return new Map();
}

/** A entrada ainda pode ser reusada? */
export function vigente(entrada: EntradaMidia | undefined, agoraMs: number): boolean {
  if (!entrada) return false;
  const idadeSeg = (agoraMs - entrada.assinadaEm) / 1000;
  // idade negativa = relógio andou para trás; trata como não-vigente em vez de reusar sem saber
  return idadeSeg >= 0 && idadeSeg < TTL_CACHE_SEG;
}

export function guardar(
  armazem: ArmazemMidia,
  caminho: string,
  url: string,
  agoraMs: number,
): void {
  armazem.set(caminho, { url, assinadaEm: agoraMs });
}

/** URL reusável, ou `null` quando não há — e `null` significa "assine de novo", nunca "erro". */
export function obter(armazem: ArmazemMidia, caminho: string, agoraMs: number): string | null {
  const e = armazem.get(caminho);
  return vigente(e, agoraMs) ? e!.url : null;
}

/**
 * Quais caminhos precisam de assinatura nova: os que não estão no cache e os que estão perto de
 * vencer. Assinar só o que falta é o que mantém 1 round-trip barato em vez de nenhum ou todos.
 */
export function precisaAssinar(
  armazem: ArmazemMidia,
  caminhos: string[],
  agoraMs: number,
): string[] {
  return caminhos.filter((c) => !vigente(armazem.get(c), agoraMs));
}

/**
 * Poda as entradas que não servem mais. Chamada no caminho de leitura para que o mapa não cresça
 * sem limite num processo de vida longa — cache de processo que só cresce vira vazamento.
 * Devolve quantas saíram.
 */
export function expirar(armazem: ArmazemMidia, agoraMs: number): number {
  let saíram = 0;
  for (const [caminho, entrada] of armazem) {
    if (!vigente(entrada, agoraMs)) {
      armazem.delete(caminho);
      saíram += 1;
    }
  }
  return saíram;
}
