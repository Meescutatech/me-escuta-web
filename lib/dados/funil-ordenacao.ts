import type { CardLead } from "./funil";
import { nivelSla } from "../tempo.ts";

/**
 * ORDENAÇÃO E PRAZO NO CARD — workshop 12/08, o argumento do supermercado:
 * "você sabe quantos segundos você demora pra decidir se pega o produto da prateleira? 3 segundos."
 *
 * A coluna do funil hoje sai na ordem em que a leitura devolveu, que não é ordem nenhuma. As três
 * perguntas que a Sarah faz olhando o board são: quem estourou, quem está parado há mais tempo, e
 * quem está sem responder há mais tempo. Cada uma vira uma ordem — e a de prazo vira COR.
 *
 * Lógica PURA e client-safe (sem I/O), no mesmo contrato de `funil-filtros.ts`.
 */

export type ChaveOrdem = "prazo" | "parado" | "sem_resposta" | "recentes";

export interface OpcaoOrdem {
  chave: ChaveOrdem;
  rotulo: string;
  /** o que a ordem responde, em uma linha — vai no menu abaixo do rótulo */
  ajuda: string;
}

export const ORDENS: OpcaoOrdem[] = [
  { chave: "prazo", rotulo: "Prazo primeiro", ajuda: "Estourado no topo, depois quem está perto" },
  { chave: "parado", rotulo: "Mais parados primeiro", ajuda: "Quem está há mais tempo na mesma etapa" },
  { chave: "sem_resposta", rotulo: "Sem resposta há mais tempo", ajuda: "Última mensagem mais antiga no topo" },
  { chave: "recentes", rotulo: "Mais recentes primeiro", ajuda: "Quem entrou na etapa por último" },
];

export const ORDEM_PADRAO: ChaveOrdem = "prazo";

/**
 * Faixa de prazo do card. Reaproveita `nivelSla` de `lib/tempo.ts` — a função existia desde o
 * croqui (ok ≤2d, atenção ≤4d, estourado >4d) e nenhum componente a chamava. O prazo já estava
 * definido nesta casa; o que faltava era a cor.
 */
export type FaixaPrazo = "estourado" | "perto" | "dentro" | "sem_dado";

export function faixaPrazo(card: Pick<CardLead, "entrou_etapa_em">, agora: number): FaixaPrazo {
  if (!card.entrou_etapa_em) return "sem_dado";
  const n = nivelSla(card.entrou_etapa_em, agora);
  return n === "estourado" ? "estourado" : n === "atencao" ? "perto" : "dentro";
}

/** Texto do title/aria da faixa — cor sozinha não é canal acessível (WCAG 1.4.1). */
export const TEXTO_FAIXA: Record<FaixaPrazo, string> = {
  estourado: "Prazo estourado — parado há mais de 4 dias na etapa",
  perto: "Perto de estourar — 3 a 4 dias na etapa",
  dentro: "Dentro do prazo",
  sem_dado: "Sem data de entrada na etapa",
};

const PESO_FAIXA: Record<FaixaPrazo, number> = { estourado: 0, perto: 1, dentro: 2, sem_dado: 3 };

/** Epoch ms de um ISO, ou `null` quando não dá para saber. Nunca 0 disfarçado de data. */
function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Compara duas datas onde "mais antigo primeiro" é o que interessa. Card SEM a data vai para o
 * fim, sempre: não saber há quanto tempo o lead está parado não é o mesmo que ele estar parado
 * há muito tempo, e jogá-lo no topo seria a UI afirmando uma urgência que ela não mediu.
 */
function maisAntigoPrimeiro(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

/**
 * Ordena uma cópia — a lista original é a projeção e não se mexe nela. Desempate final é sempre
 * `lead_id`, para a ordem ser estável entre dois refreshes (card que troca de lugar sozinho a
 * cada polling é card que a pessoa perde de vista).
 */
export function ordenarCards(cards: CardLead[], ordem: ChaveOrdem, agora: number): CardLead[] {
  const copia = cards.slice();
  copia.sort((a, b) => {
    let d = 0;
    switch (ordem) {
      case "prazo": {
        d = PESO_FAIXA[faixaPrazo(a, agora)] - PESO_FAIXA[faixaPrazo(b, agora)];
        // dentro da mesma faixa, o mais parado manda — senão "estourado" vira um balde sem ordem
        if (d === 0) d = maisAntigoPrimeiro(ms(a.entrou_etapa_em), ms(b.entrou_etapa_em));
        break;
      }
      case "parado":
        d = maisAntigoPrimeiro(ms(a.entrou_etapa_em), ms(b.entrou_etapa_em));
        break;
      case "sem_resposta":
        d = maisAntigoPrimeiro(ms(a.ultima_mensagem?.em), ms(b.ultima_mensagem?.em));
        break;
      case "recentes": {
        const x = ms(a.entrou_etapa_em);
        const y = ms(b.entrou_etapa_em);
        if (x == null && y == null) d = 0;
        else if (x == null) d = 1;
        else if (y == null) d = -1;
        else d = y - x;
        break;
      }
    }
    return d !== 0 ? d : a.lead_id.localeCompare(b.lead_id);
  });
  return copia;
}

/**
 * "que dia foi que ele mandou isso" — a primeira pergunta da Sarah ao olhar um card. Formato
 * curto para caber na linha: "hoje 14:32", "ontem 09:10", "12/08".
 */
export function dataUltimaMensagem(iso: string | null | undefined, agora: number): string {
  const t = ms(iso);
  if (t == null) return "";
  const dia = 86_400_000;
  const meiaNoite = (x: number) => Math.floor((x - 3 * 3_600_000) / dia);
  const delta = meiaNoite(agora) - meiaNoite(t);
  const d = new Date(t - 3 * 3_600_000);
  const hhmm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  if (delta === 0) return `hoje ${hhmm}`;
  if (delta === 1) return `ontem ${hhmm}`;
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
