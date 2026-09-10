"use client";

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "@/lib/utils";

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      // `data-[orientation=horizontal]:`, NUNCA `data-[horizontal]:`. A forma bare
      // compila para `[data-horizontal]` e o Base UI emite
      // `data-orientation="horizontal"` — a regra entra no CSS e nunca casa.
      // Falha silenciosa clássica (CLAUDE.md): sem erro de tsc, sem erro de
      // lint, só o separador SEM ALTURA NENHUMA em todos os call sites. Mesmo
      // bug já corrigido em `toggle-group.tsx`.
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
