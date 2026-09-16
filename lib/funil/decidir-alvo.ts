export interface CardMedido {
  leadId: string;
  meio: number;
}

export interface ColunaSnapshot {
  etapa: string;
  esquerda: number;
  direita: number;
  topo: number;
  base: number;
  cards: CardMedido[];
}

export interface Snapshot {
  colunas: ColunaSnapshot[];
  scrollLeft: number;
}

export interface AlvoArraste {
  etapa: string;
  indice: number;
}

/**
 * Função pura: dado o snapshot do quadro, as coordenadas do ponteiro e o scrollLeft atual,
 * decide em qual coluna e posição o card deve cair.
 */
export function decidirAlvo(
  snap: Snapshot,
  x: number,
  y: number,
  scrollLeft: number,
  atual: AlvoArraste | null,
): AlvoArraste | null {
  const xAjustado = x + (scrollLeft - snap.scrollLeft);

  const candidatas = snap.colunas.filter(
    (c) => xAjustado >= c.esquerda && xAjustado <= c.direita,
  );

  if (candidatas.length === 0) return atual;

  const col =
    candidatas.length === 1
      ? candidatas[0]
      : candidatas.find((c) => y >= c.topo && y <= c.base);

  if (!col) return atual;

  let indice = col.cards.length;
  for (let i = 0; i < col.cards.length; i++) {
    if (y < col.cards[i].meio) {
      indice = i;
      break;
    }
  }
  return { etapa: col.etapa, indice };
}
