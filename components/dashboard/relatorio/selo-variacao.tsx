"use client";

import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { cn } from "@/lib/utils";
import { LIMIAR_ESTAVEL, detalheVariacao, rotuloVariacao, tomVariacao } from "./formato";

/**
 * Variação vs o período anterior (portado de `components/report/delta-badge.tsx`).
 *
 * A cor responde ao SIGNIFICADO, não ao sinal: `menorEhMelhor` faz uma queda de tempo de resposta
 * ficar verde e uma alta, vermelha — o inverso do que aconteceria com volume. O sinal está sempre
 * ESCRITO (`+8%`, `−3 dias`); a cor é reforço, nunca o dado. Abaixo de `LIMIAR_ESTAVEL` o selo diz
 * "estável" em vez de "+0%", que não é leitura nenhuma.
 */
export function SeloVariacao({
  delta,
  menorEhMelhor = false,
  rotulo,
  tamanho = "md",
  className,
}: {
  /** Fração vs período anterior (0.082 = +8,2%). null → nada é renderizado. */
  delta?: number | null;
  /** true em métricas de tempo, onde cair é melhorar. */
  menorEhMelhor?: boolean;
  /**
   * Rótulo pronto, para variações que não são percentuais ("−3 dias", "+2,4 p.p."). Substitui o
   * texto derivado de `delta`, mas o TOM continua saindo de `delta`.
   */
  rotulo?: string;
  tamanho?: "sm" | "md";
  className?: string;
}) {
  if (delta == null) return null;

  const detalhe = rotulo
    ? `Variação de ${rotulo} em relação ao período anterior, de mesma duração.${menorEhMelhor ? " Nesta métrica, cair é melhorar." : ""}`
    : detalheVariacao(delta, menorEhMelhor);
  const medida = tamanho === "sm" ? "gap-0.5 rounded-[5px] px-1.5 py-px text-ui-10" : "gap-0.5 rounded-md px-1.5 py-0.5 text-ui-12";

  if (Math.abs(delta) < LIMIAR_ESTAVEL) {
    return (
      <HintTooltip title="Variação" content={detalhe}>
        <span data-slot="selo-variacao" className={cn("inline-flex shrink-0 items-center bg-muted font-medium text-muted-foreground", medida, className)}>
          estável
        </span>
      </HintTooltip>
    );
  }

  const tom = tomVariacao(delta, menorEhMelhor);
  const Seta = delta > 0 ? ArrowUpRightIcon : ArrowDownRightIcon;

  return (
    <HintTooltip title="Variação" content={detalhe}>
      <span
        data-slot="selo-variacao"
        className={cn(
          "inline-flex shrink-0 items-center font-medium tabular-nums",
          tom === "positivo" ? "bg-success-tint text-success-ink" : "bg-danger-tint text-danger-ink",
          medida,
          className,
        )}
      >
        {rotulo ?? rotuloVariacao(delta)}
        <Seta className="size-3" aria-hidden="true" />
      </span>
    </HintTooltip>
  );
}
