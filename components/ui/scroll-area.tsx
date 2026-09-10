"use client";

import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import { cn } from "@/lib/utils";

function ScrollArea({
  className,
  children,
  ...props
}: ScrollAreaPrimitive.Root.Props) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      // Root em `flex flex-col` e Viewport em `min-h-0 flex-1`, NÃO `h-full`.
      // Altura percentual só resolve quando a cadeia acima é definida — e o
      // popover de notificações é `max-h-[…]` sem `h-`: ali o `100%` virava
      // `auto`, o Viewport crescia até o conteúdo (2700px com 60 linhas),
      // vazava por cima do rodapé e o popup cortava sem nunca rolar. Como item
      // de flex, o Viewport herda a altura que o flex já resolveu para o Root,
      // seja ela definida (sheet, `h-full`) ou só limitada por `max-h`.
      className={cn("relative flex flex-col", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="min-h-0 w-full flex-1 rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      // `data-[orientation=…]:` e não a forma bare — ver o comentário em
      // `separator.tsx`. O `data-orientation={orientation}` explícito que estava
      // aqui era uma tentativa de fazer a variante bare casar; não fazia (o
      // seletor gerado era `[data-horizontal]`) e o Base UI já emite o atributo
      // sozinho, então saiu junto.
      className={cn(
        "flex touch-none p-px transition-colors select-none data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:border-t data-[orientation=horizontal]:border-t-transparent data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2.5 data-[orientation=vertical]:border-l data-[orientation=vertical]:border-l-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
