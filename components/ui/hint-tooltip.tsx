"use client";

import type { ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type HintTooltipProps = {
  /** Texto exibido no hover. Uma ou duas frases curtas, em voz corrente. */
  content: string;
  /**
   * Primeira linha, em destaque — o nome do que está sendo explicado.
   * Sem ela o texto vira um bloco só e o leitor precisa achar o assunto no meio
   * da frase.
   */
  title?: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  /** Atraso antes de abrir (ms). */
  delay?: number;
  className?: string;
};

/**
 * Tooltip padronizado para badges, ícones e chips informativos.
 * Use em vez de `title` nativo quando precisar de texto mais longo ou estilo consistente.
 *
 * O texto é alinhado à esquerda, não centralizado: centralizado só não atrapalha
 * quando cabe numa linha, e qualquer explicação de duas linhas fica com as
 * bordas serrilhadas, que é justamente o caso em que alguém está lendo de fato.
 */
function HintTooltip({
  content,
  title,
  children,
  side = "top",
  align = "center",
  delay = 300,
  className,
}: HintTooltipProps) {
  return (
    // O atraso vai no `Trigger`, NÃO num `TooltipProvider` local.
    //
    // Havia um provider por instância aqui, embora o `App.tsx` já envolva o app
    // inteiro em um. Além do provider extra por chip — a barra de filtros do
    // inbox monta três encostados —, o provider aninhado quebra o agrupamento
    // que ele existe para dar: tooltips que compartilham provider abrem sem
    // atraso enquanto um deles já está aberto, e cada `HintTooltip` no seu
    // próprio provider volta a esperar os 300ms ao andar de um chip para o
    // vizinho. Com `delay` no gatilho, todos ficam no provider do app e o
    // agrupamento volta a valer.
    <Tooltip>
      <TooltipTrigger
        delay={delay}
        render={
          <span
            className={cn("inline-flex cursor-default outline-none", className)}
            tabIndex={0}
            aria-label={title ? `${title}: ${content}` : content}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        className="max-w-xs flex-col items-start gap-1 py-2 text-left leading-relaxed text-pretty"
      >
        {title ? <span className="font-semibold">{title}</span> : null}
        <span className={cn(title && "text-background/80")}>{content}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export { HintTooltip };
