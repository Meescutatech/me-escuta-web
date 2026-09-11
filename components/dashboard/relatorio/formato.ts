/**
 * Formatação compartilhada dos blocos de relatório (portado de `lib/report-format.ts` do
 * LiderHub, 10/09/2026). Lógica pura, sem React — testável com `node --test`.
 */

const PCT_1_SINAL = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "always",
});

const PCT_0_SINAL = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 0,
  signDisplay: "always",
});

const PCT_0 = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 0,
});

/**
 * Variação vs período anterior, SEM casa decimal ("+8%"). O selo fica ao lado de um número
 * grande e é lido de relance; a casa decimal só engrossa o selo sem mudar decisão nenhuma. A
 * precisão não se perde: `detalheVariacao` devolve o valor cheio para o tooltip.
 */
export function rotuloVariacao(delta: number | null | undefined): string {
  return delta == null ? "—" : PCT_0_SINAL.format(delta);
}

/**
 * Texto do tooltip da variação: o valor exato que o rótulo truncou, mais contra o que ele
 * compara. Em métrica de tempo diz explicitamente que cair é melhorar — sem isso um "−22%"
 * verde parece erro de cor.
 */
export function detalheVariacao(delta: number | null | undefined, menorEhMelhor = false): string {
  if (delta == null) return "Sem período anterior para comparar.";
  const exato = `Variação de ${PCT_1_SINAL.format(delta)} em relação ao período anterior, de mesma duração.`;
  return menorEhMelhor ? `${exato} Nesta métrica, cair é melhorar.` : exato;
}

/** Proporção sem sinal ("67%") — para fatias do total, não para variação. */
export function fracaoPct(fracao: number): string {
  return PCT_0.format(fracao);
}

/**
 * Tom do delta. Em tempo (1ª resposta, ciclo) CAIR É BOM — o mesmo "+5%" que é ótimo em volume
 * é ruim em tempo de resposta. Sem essa distinção o relatório pinta de verde uma piora.
 */
export type TomVariacao = "positivo" | "negativo" | "neutro";

export function tomVariacao(delta: number | null | undefined, menorEhMelhor = false): TomVariacao {
  if (delta == null || delta === 0) return "neutro";
  const bom = menorEhMelhor ? delta < 0 : delta > 0;
  return bom ? "positivo" : "negativo";
}

/**
 * Abaixo disto a variação é ruído de arredondamento, não tendência: o selo diz "estável" em vez
 * de "+0%", que não é leitura nenhuma.
 */
export const LIMIAR_ESTAVEL = 0.005;

/** Fração `(atual − anterior) / anterior`; null quando não dá para comparar. */
export function variacaoRelativa(atual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (atual == null || anterior == null) return null;
  if (anterior === 0) return atual === 0 ? 0 : null;
  return (atual - anterior) / anterior;
}

// ─── Barras das tabelas de pessoa/canal ───────────────────────────────────────

export type TomMetrica = "bom" | "atencao" | "ruim" | "neutro";

export interface BarraMetrica {
  /** Fração 0–1 do trilho preenchida (saturada em 1). */
  fracao: number;
  tom: TomMetrica;
}

/** Proporção saturada em 1 — a fração que alimenta `BarraMetrica.fracao`. */
export function fracaoDoMaximo(valor: number, max: number): number {
  return max > 0 ? Math.min(valor / max, 1) : 0;
}

/**
 * Barra de TEMPO comparada com a média da própria equipe — nunca com meta. O produto não tem
 * meta de tempo configurável, e uma régua tirada de constante de código seria um acordo que
 * ninguém fez. O trilho vai até 2× a média (o valor médio cai no meio); acima disso satura e o
 * número ao lado carrega a verdade. Cor só nos extremos: na média ou abaixo é `bom`; acima de
 * `fatorAlerta` × média é `ruim`; o meio fica `atencao` (neutro no texto).
 */
export function barraDeTempo(
  valor: number | null,
  mediaEquipe: number | null,
  fatorAlerta = 1.5,
): (BarraMetrica & { tomTexto: TomMetrica }) | null {
  if (valor == null || mediaEquipe == null || mediaEquipe <= 0) return null;
  const razao = valor / mediaEquipe;
  const tom: TomMetrica = razao <= 1 ? "bom" : razao >= fatorAlerta ? "ruim" : "atencao";
  return { fracao: Math.min(razao / 2, 1), tom, tomTexto: tom === "atencao" ? "neutro" : tom };
}
