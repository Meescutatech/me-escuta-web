"use client";

import type { ReactNode } from "react";
import { InfoIcon } from "lucide-react";
import { RichTooltipContent, Tooltip, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * O "i" dos blocos do relatório: um painel só, com a explicação, a legenda das cores e o que dá
 * para fazer. (Portado de `components/report/info-tooltip.tsx` do LiderHub.)
 *
 * É `RichTooltipContent` (painel claro) e não o chip escuro do tooltip comum porque as amostras da
 * legenda são as cores das séries, calibradas contra o fundo do card — sobre o chip escuro a rampa
 * mais clara simplesmente some.
 */
export function DicaInfo({
  titulo,
  dica,
  legenda,
  rodape,
  align = "end",
  tamanho = "md",
}: {
  /** Nome do bloco — primeira linha do painel, em destaque. */
  titulo: string;
  /**
   * O que o bloco mostra e como lê-lo. Duas ou três frases curtas, em voz corrente. A primeira
   * define a métrica; as seguintes avisam do jeito de ler errado.
   */
  dica?: string;
  /** Decodificação das cores — lista de `ItemLegenda`. */
  legenda?: ReactNode;
  /** O que dá para FAZER com o bloco (clicar numa faixa, abrir a listagem). */
  rodape?: ReactNode;
  align?: "start" | "center" | "end";
  /** `sm` (12px) ao lado de um rótulo de KPI; `md` (16px) em cabeçalho de bloco. */
  tamanho?: "sm" | "md";
}) {
  if (!dica && !legenda && !rodape) return null;

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={<span className="inline-flex cursor-default outline-none" tabIndex={0} aria-label={dica ?? `Legenda de ${titulo}`} />}
        >
          <InfoIcon
            className={cn(
              "shrink-0 text-muted-foreground/40 transition-colors hover:text-muted-foreground",
              tamanho === "sm" ? "size-3" : "size-4",
            )}
            aria-hidden="true"
          />
        </TooltipTrigger>
        <RichTooltipContent side="top" align={align} className="flex flex-col gap-2.5 p-3">
          <div className="flex flex-col gap-1">
            <span className="text-ui-13 font-semibold text-foreground">{titulo}</span>
            {dica ? <span className="text-ui-12 leading-relaxed text-pretty text-muted-foreground">{dica}</span> : null}
          </div>
          {legenda ? (
            <div className="flex flex-col gap-2 border-t border-border pt-2.5">
              <span className="text-ui-11 font-medium text-muted-foreground">Legenda</span>
              {legenda}
            </div>
          ) : null}
          {rodape ? (
            <div className="border-t border-border pt-2.5 text-ui-12 leading-relaxed text-pretty text-muted-foreground">{rodape}</div>
          ) : null}
        </RichTooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Item da legenda: amostra da cor + o nome + a frase que diz o que aquela cor quer dizer. O nome
 * sozinho não decodifica nada ("Pendente" pode ser fila ou espera pelo cliente).
 */
export function ItemLegenda({ cor, nome, glosa }: { cor: string; nome: string; glosa: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-[5px] size-2 shrink-0 rounded-full" style={{ backgroundColor: cor }} aria-hidden="true" />
      <span className="text-ui-12 leading-relaxed">
        <span className="font-medium text-foreground">{nome}</span>
        <span className="text-muted-foreground"> {glosa}</span>
      </span>
    </li>
  );
}
