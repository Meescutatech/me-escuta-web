/**
 * A JANELA DE 24 HORAS — regras puras do regime do composer (SPEC-B §7 · desenho aprovado
 * Design/templates-hsm-r22.html, tela 3).
 *
 * Regra da Meta (LIMITES-META-HSM §2): a janela abre quando **o usuário** escreve para o número
 * da empresa e dura 24 horas. Dentro dela sai qualquer mensagem; fora dela sai **só template
 * aprovado**. Mensagem de saída NÃO reabre a janela — só entrada reabre. Conversa que nunca
 * recebeu entrada está fechada, sempre.
 *
 * Três decisões moram aqui, e nenhuma é estética:
 *
 *  J1 — **"não sei" não é "fechada".** Quando a coluna `janela_livre_ate` não é legível neste
 *       ambiente, o regime é `desconhecido` e o composer NÃO muda nada: não avisa, não troca de
 *       modo, não bloqueia. É a mesma doutrina do chip de número do M7 (`origem = null`) e pela
 *       mesma razão: marca ausente é honesta, marca errada não é. Trancar o campo por uma coluna
 *       que não subiu seria transformar defeito de ambiente em impedimento de atendimento.
 *
 *  J2 — **fora da janela o composer não some, troca de regime.** Esconder o campo produziria "o
 *       campo sumiu" como sintoma, e "sumiu" é indistinguível de bug para quem está atendendo.
 *       Por isso `regimeDaJanela` devolve texto — o que aconteceu e o que dá para fazer — em vez
 *       de um booleano que a tela teria de interpretar sozinha.
 *
 *  J3 — o rótulo de tempo é **arredondado para baixo e nunca some**. "Responde livre por 21h"
 *       vira "por 43min" e depois "por menos de 1min", nunca "por 0h": zero lido como "acabou"
 *       quando ainda dá tempo é o erro caro nesta tela.
 */

export type Regime = "aberta" | "fechada" | "desconhecida";

export interface EstadoJanela {
  regime: Regime;
  /** Milissegundos até fechar (`aberta`) ou desde que fechou (`fechada`). `null` se não sei. */
  ms: number | null;
  /** Chip do cabeçalho da conversa. `null` só no regime desconhecido — aí nada é dito. */
  chip: string | null;
  /** Frase da barra de regime. `null` fora do regime fechado. */
  aviso: string | null;
}

export const MS_HORA = 3_600_000;
export const MS_DIA = 86_400_000;

/**
 * O aviso da barra âmbar, palavra por palavra do desenho aprovado. Constante porque este texto
 * aparece em dois lugares (barra e `title` do campo) e o dia em que os dois divergirem, um deles
 * vira mentira.
 */
export const AVISO_FECHADA = "A janela de 24 horas fechou.";
export const EXPLICACAO_FECHADA =
  "Daqui só sai template aprovado. Ele reabre a conversa e libera a resposta livre de novo.";
/** Rótulo do campo trancado. Diz o que está indisponível — nunca "erro". */
export const CAMPO_TRANCADO = "Mensagem livre indisponível";

/**
 * J1/J2/J3 — o regime, a partir do `core.conversa.janela_livre_ate` projetado.
 *
 * @param janelaLivreAte ISO da hora em que a janela fecha. `undefined` = a coluna não veio nesta
 *   leitura (ambiente sem a projeção, ou RLS) ⇒ **desconhecida**. `null` = a coluna veio vazia,
 *   e vazio significa "nunca houve entrada" ⇒ **fechada**, que é a regra da Meta. Os dois casos
 *   parecem iguais em JavaScript e são opostos em consequência; por isso são dois valores.
 * @param agoraMs relógio de fora — a função é pura e testável sem congelar o tempo do processo.
 */
export function regimeDaJanela(
  janelaLivreAte: string | null | undefined,
  agoraMs: number,
): EstadoJanela {
  if (janelaLivreAte === undefined) {
    return { regime: "desconhecida", ms: null, chip: null, aviso: null };
  }
  if (janelaLivreAte === null) {
    return {
      regime: "fechada",
      ms: null,
      chip: "Sem janela aberta",
      aviso: "Esta conversa nunca recebeu mensagem — só template aprovado sai daqui.",
    };
  }

  const fim = Date.parse(janelaLivreAte);
  // Carimbo ilegível não vira "fechada": vira "não sei". Inventar estado a partir de dado podre
  // é como se produz o diagnóstico errado que a §6 da spec descreve.
  if (Number.isNaN(fim)) {
    return { regime: "desconhecida", ms: null, chip: null, aviso: null };
  }

  const delta = fim - agoraMs;
  if (delta > 0) {
    return {
      regime: "aberta",
      ms: delta,
      chip: `Responde livre por ${duracaoCurta(delta)}`,
      aviso: null,
    };
  }
  return {
    regime: "fechada",
    ms: -delta,
    chip: `Janela fechada há ${duracaoCurta(-delta)}`,
    aviso: EXPLICACAO_FECHADA,
  };
}

/**
 * J3 — duração em uma unidade só, arredondada para baixo, e **nunca zero**. Abaixo de um minuto
 * o texto vira "menos de 1min": "0min" lido como "acabou" quando ainda dá tempo é justamente o
 * engano que esta tela existe para não cometer.
 */
export function duracaoCurta(ms: number): string {
  if (ms < 60_000) return "menos de 1min";
  if (ms < MS_HORA) return `${Math.floor(ms / 60_000)}min`;
  if (ms < MS_DIA) return `${Math.floor(ms / MS_HORA)}h`;
  const dias = Math.floor(ms / MS_DIA);
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/**
 * A pergunta que o composer faz antes de deixar digitar. Regime desconhecido responde **true**:
 * na dúvida, o atendimento continua (J1) — a recusa de verdade é da porta e do sender.
 */
export function permiteMensagemLivre(e: EstadoJanela): boolean {
  return e.regime !== "fechada";
}

/** E a inversa: quando o caminho do template é o único que existe (§7). */
export function exigeTemplate(e: EstadoJanela): boolean {
  return e.regime === "fechada";
}
