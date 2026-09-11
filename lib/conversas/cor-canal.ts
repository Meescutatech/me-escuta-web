/**
 * COR E INICIAL DE UM NÚMERO (W-D3, 10/09) — a mesma marca em três lugares: a bolinha no avatar
 * da lista, o item do rail "Números" e o "Enviando por:" do composer. Uma cor por canal,
 * determinística pelo `phone_number_id`, para a pessoa aprender uma vez ("navy é o número da
 * empresa, laranja é o da Sara") e reconhecer em qualquer tela.
 *
 * Regra: o número OFICIAL da empresa (WABA de produção) é sempre navy — é a identidade. Os
 * outros (Lite das fonos, teste) tiram a cor de um hash do id sobre uma paleta curta, sem o
 * navy. O rótulo nunca é o id (M7/CA-9): a inicial sai do APELIDO.
 *
 * Só classes Tailwind estáticas — nada de cor montada por string, senão o purge come.
 */

export interface MarcaCanal {
  /** inicial do apelido, em caixa alta. */
  inicial: string;
  /** classes da bolinha cheia (fundo + texto). */
  cheia: string;
  /** classes da pastilha clara (fundo claro + texto colorido). */
  clara: string;
  /** classe do pontinho. */
  ponto: string;
}

const PALETA: Array<Omit<MarcaCanal, "inicial">> = [
  { cheia: "bg-laranja text-branco", clara: "bg-laranja-cl text-laranja-esc", ponto: "bg-laranja" },
  { cheia: "bg-azul text-branco", clara: "bg-azul-bg text-azul", ponto: "bg-azul" },
  { cheia: "bg-verde text-branco", clara: "bg-verde-bg text-verde", ponto: "bg-verde" },
  { cheia: "bg-amarelo-barra text-branco", clara: "bg-amarelo-bg text-amarelo", ponto: "bg-amarelo-barra" },
  { cheia: "bg-vermelho text-branco", clara: "bg-vermelho-bg text-vermelho", ponto: "bg-vermelho" },
];

const NAVY: Omit<MarcaCanal, "inicial"> = { cheia: "bg-navy text-branco", clara: "bg-bolha-out text-navy", ponto: "bg-navy" };
const SEM_NUMERO: Omit<MarcaCanal, "inicial"> = { cheia: "bg-hover text-mute", clara: "bg-hover text-mute", ponto: "bg-linha-forte" };

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function inicialDoApelido(apelido: string | null | undefined): string {
  const limpo = (apelido ?? "").trim();
  if (!limpo) return "?";
  return limpo[0].toUpperCase();
}

export function marcaDoCanal(c: {
  phone_number_id: string | null | undefined;
  numero_apelido: string | null | undefined;
  finalidade?: "producao" | "teste" | null;
}): MarcaCanal {
  const inicial = inicialDoApelido(c.numero_apelido);
  if (!c.phone_number_id || !c.numero_apelido) return { inicial, ...SEM_NUMERO };
  const oficial = c.phone_number_id.startsWith("waba:") && c.finalidade === "producao";
  if (oficial) return { inicial, ...NAVY };
  // +4: só desloca o hash para os dois Lite da fixture caírem em laranja (Sara) e verde (fono)
  return { inicial, ...PALETA[(hash(c.phone_number_id) + 4) % PALETA.length] };
}
