/**
 * PORTÕES DE TRANSIÇÃO DO FUNIL (item 4f) — a trava que faltava.
 *
 * Contexto: até aqui o board só travava a saída para `perdido` (que exige motivo). Qualquer outra
 * transição — inclusive pular de "Novo" direto para "Proposta" sem a audiometria — passava livre.
 * O Kommo tinha obrigatoriedade por etapa; esta é a fundação equivalente, no lado do sistema novo.
 *
 * DESENHO (piloto expansível):
 *  - `podeTransicionar(de, para, lead, regras)` é uma FUNÇÃO PURA (sem I/O, testável isolada).
 *  - As regras são uma LISTA DE PORTÕES declarativos. Hoje há UM piloto (audiometria antes de
 *    proposta). Regras futuras entram nesta lista — ou, quando a Me Escuta definir todas, migram
 *    para a config `funil_vendas` no banco (config-driven), sem trocar o ponto de chamada.
 *
 * REGRA DE OURO — TRÊS ESTADOS, NUNCA BLOQUEAR NO ESCURO:
 *  Se o dado que o portão precisa é `undefined` (a projeção não expôs / a leitura não voltou), o
 *  portão LIBERA. Espelha a disciplina do resto da web: o card "nunca pinta o gate no escuro".
 *  Bloquear só quando há prova de que o pré-requisito NÃO foi cumprido (`null`/valor negativo).
 */

import type { CardLead } from "../dados/funil";
import type { EtapaFunil } from "../dados/funil-etapas";

/** O que um portão precisa saber do lead para decidir. Subconjunto de CardLead — nada de I/O. */
export type LeadParaPortao = Pick<CardLead, "audiometria">;

export interface Portao {
  /** chave da etapa de destino que este portão protege (ex.: "proposta"). */
  etapaAlvo: string;
  /** rótulo curto do que falta, mostrado no diálogo de bloqueio. */
  exige: string;
  /**
   * Decisão pura. Retorna:
   *  - "ok"        → pré-requisito cumprido, libera
   *  - "bloqueia"  → há PROVA de que falta o pré-requisito
   *  - "sem_dado"  → não dá para saber (dado undefined) → o chamador LIBERA (nunca trava no escuro)
   */
  avaliar: (lead: LeadParaPortao) => "ok" | "bloqueia" | "sem_dado";
}

/**
 * REGRAS VIGENTES — hoje só o piloto. Adicionar regra = adicionar item a esta lista.
 *
 * Piloto: não se envia PROPOSTA a quem não fez a audiometria. É a regra clínica mais dura do
 * negócio (vender aparelho auditivo sem exame não faz sentido) e o campo já existe no card
 * (`audiometria: "fez" | "nao_fez" | null`), então é verificável hoje, ponta a ponta.
 */
export const PORTOES_PADRAO: Portao[] = [
  {
    etapaAlvo: "proposta",
    exige: "audiometria realizada",
    avaliar: (lead) => {
      if (lead.audiometria === undefined) return "sem_dado"; // projeção não expôs → não travar
      if (lead.audiometria === "fez") return "ok";
      return "bloqueia"; // "nao_fez" ou null = há prova de que falta
    },
  },
];

export interface ResultadoPortao {
  /** true = transição permitida (ou porque passou, ou porque não há portão / não há dado). */
  permitido: boolean;
  /** quando `permitido=false`: o que falta, para o diálogo de bloqueio. */
  exige?: string;
  /** a etapa de destino do portão que barrou (eco para a UI/telemetria). */
  etapaAlvo?: string;
}

/**
 * A decisão. Pura: mesmos argumentos ⇒ mesmo resultado, sem tocar banco/rede.
 *
 * Só avalia portões cuja `etapaAlvo` bate com `para`. Movimentos de recuo (voltar etapa) e saída
 * para `perdido`/`ganho`/`arquivado` não são barrados aqui — a guarda de perda já vive no quadro, e
 * recuar nunca deve exigir pré-requisito (o portão protege ENTRADA, não saída).
 */
export function podeTransicionar(
  de: string,
  para: string,
  lead: LeadParaPortao,
  regras: Portao[] = PORTOES_PADRAO,
): ResultadoPortao {
  if (de === para) return { permitido: true };
  for (const portao of regras) {
    if (portao.etapaAlvo !== para) continue;
    const veredito = portao.avaliar(lead);
    if (veredito === "bloqueia") {
      return { permitido: false, exige: portao.exige, etapaAlvo: portao.etapaAlvo };
    }
  }
  return { permitido: true };
}

/**
 * Só existe portão para a etapa de destino? Ajuda a UI a decidir se precisa checar antes de mover.
 * (Opcional — o quadro pode simplesmente chamar `podeTransicionar` sempre.)
 */
export function temPortao(para: string, regras: Portao[] = PORTOES_PADRAO): boolean {
  return regras.some((p) => p.etapaAlvo === para);
}

/** Etapa é de saída (perdido/ganho/arquivado)? Portões não se aplicam a saída — só a entrada. */
export function ehEtapaDeSaida(etapa: EtapaFunil | undefined): boolean {
  return etapa?.tipo === "perdido" || etapa?.tipo === "ganho" || etapa?.tipo === "arquivado";
}
