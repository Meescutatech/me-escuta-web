"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

function PopoverContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  portalContainer,
  anchor,
  ...props
}: PopoverPrimitive.Popup.Props & {
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
  align?: "start" | "center" | "end";
  /** Render the popup inside this node (e.g. sheet content) so modal dialog focus trap still applies. */
  portalContainer?:
    | HTMLElement
    | React.RefObject<HTMLElement | ShadowRoot | null>
    | null;
  /**
   * Position against this element instead of the trigger. Needed when the thing
   * that opens the popover is not the thing it should point at — e.g. the
   * calendar's quick-create, which is opened by clicking a day cell but whose
   * trigger lives at the shell level. Base UI's `Positioner` already supports
   * it; this only forwards it.
   */
  anchor?: PopoverPrimitive.Positioner.Props["anchor"];
}) {
  return (
    <PopoverPrimitive.Portal container={portalContainer ?? undefined}>
      <PopoverPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        anchor={anchor}
        // `z-[100]` e não `z-50` como os demais popups: o popover é a única
        // camada ancorada que precisa vencer um `DropdownMenu` — o menu `···` de
        // uma linha abre um popover de confirmação, e empatados em z-50 quem
        // ganha é a ordem do DOM, que aqui é o menu.
        className="isolate z-[100]"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          // Mesmo cromo dos menus (`rounded-lg` + `shadow-md` + o mesmo anel):
          // popover é irmão de dropdown/select/context-menu, não de dialog. Ele
          // era `rounded-xl` + `shadow-lg`, e o resultado é que a linha de Tags
          // do painel do inbox abria uma superfície visivelmente mais pesada que
          // a linha de Atendente logo acima. `shadow-lg` fica para sheet e
          // dialog, que são outro nível de elevação.
          className={cn(
            // `ring-border`, não `ring-foreground/10`: `--foreground` é quase
            // PRETO no tema claro, então 10% dele sobre uma superfície branca
            // some — o popup ficava sem contorno, flutuando sobre a página. No
            // escuro o token `--border` JÁ É branco a 10%, exatamente o valor
            // antigo: a troca conserta o claro sem mexer no escuro.
            "w-72 rounded-lg bg-popover p-4 text-popover-foreground shadow-md ring-1 ring-border",
            // `origin-[var(--transform-origin)]`: o Base UI calcula a origem ancorada
            // no gatilho; sem consumir a variable o zoom nasce do CENTRO do
            // popup, sem pista de onde ele veio. `duration-100` alinha com os
            // demais primitivos de popup (dropdown, context-menu, hover-card) —
            // sem ele o fallback do tw-animate-css é 150ms.
            "origin-[var(--transform-origin)] duration-100 motion-reduce:animate-none",
            "data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95",
            "data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95",
            // ATENÇÃO à forma da variante: o Base UI emite `data-side="bottom"`,
            // então `data-[side-bottom]:` compila para `[data-side-bottom]` e NUNCA
            // casa — o slide fica morto e o popup só faz fade. Tem que ser
            // `data-[side=bottom]:`.
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
            "data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

const PopoverClose = PopoverPrimitive.Close;

export { Popover, PopoverTrigger, PopoverContent, PopoverClose };
