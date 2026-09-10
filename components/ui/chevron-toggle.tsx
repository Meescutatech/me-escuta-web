"use client";

import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Chevron de gatilho — gira 180° enquanto o popover está aberto.
 *
 * **Exige `group` no elemento do gatilho.** Base UI marca o trigger com
 * `data-popup-open` (mesmo atributo em `Popover.Trigger`, `Menu.Trigger` e
 * `Select.Trigger` — verificado em `MenuTriggerDataAttributes`), então o
 * ícone lê o estado do pai pelo `group-`.
 *
 * Existe porque a regra estava copiada em alguns gatilhos e ausente em
 * outros: o mesmo tipo de controle abria girando numa tela e parado na
 * seguinte. O `Select` do `components/ui/select.tsx` não usa este componente
 * — lá o Base UI propaga o estado para a própria parte `Icon`, então a
 * rotação é `data-[popup-open]:rotate-180` direto no ícone.
 */
export function ChevronToggle({ className }: { className?: string }) {
  return (
    <ChevronDownIcon
      data-slot="chevron-toggle"
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
        "group-data-[popup-open]:rotate-180",
        className,
      )}
    />
  );
}
