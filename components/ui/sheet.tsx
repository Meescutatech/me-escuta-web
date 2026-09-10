"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 transition-opacity duration-300 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  overlayClassName,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
  /** Estiliza o backdrop (ex.: scrim mais escuro para modais empilhados). */
  overlayClassName?: string;
}) {
  return (
    <SheetPortal>
      <SheetOverlay className={overlayClassName} />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-[ending-style]:translate-y-[2.5rem] data-[side=bottom]:data-[starting-style]:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-[ending-style]:translate-x-[-2.5rem] data-[side=left]:data-[starting-style]:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-[ending-style]:translate-x-[2.5rem] data-[side=right]:data-[starting-style]:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-[ending-style]:translate-y-[-2.5rem] data-[side=top]:data-[starting-style]:translate-y-[-2.5rem]",
          // Largura máxima padrão dos sheets laterais.
          //
          // Precisa ser classe PLANA e aplicada por condição em JS, não
          // `data-[side=right]:sm:max-w-sm`. Aquela variante compila com
          // seletor de atributo (especificidade 0,2,0) e vencia o
          // `sm:max-w-2xl` do consumidor (0,1,0) — e o tailwind-merge não
          // deduplica as duas, porque os prefixos de variante diferem.
          // Resultado: TODO sheet lateral ficava travado em 384px,
          // ignorando a largura que pedia.
          (side === "left" || side === "right") && "sm:max-w-sm",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              // `top-4 right-4` alinha o centro do botão (16+14=30px) com o
              // centro da primeira linha do header `divided` (20+12=32px).
              // Em top-3 ele ficava 10px acima do título.
              <Button
                variant="ghost"
                className="absolute top-4 right-4"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Fechar</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

/**
 * Chrome do sheet.
 *
 * `plain` é o comportamento histórico e segue o default — o sheet de negócio
 * do CRM usa `px-5 pt-12` de propósito e não deve mudar.
 *
 * `divided` é o padrão de sheet de formulário: divisor, respiro de 24px e a
 * folga à direita para o botão de fechar. Existia escrito à mão em 8
 * variações de header e 6 de footer; qualquer ajuste de padding precisava ser
 * repetido em cada arquivo.
 */
type SheetChromeVariant = "plain" | "divided";

function SheetHeader({
  className,
  variant = "plain",
  ...props
}: React.ComponentProps<"div"> & { variant?: SheetChromeVariant }) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex flex-col gap-0.5",
        variant === "divided"
          ? // `pr-12` reserva a coluna do botão de fechar (que vai até 44px):
            // sem ela um título longo passa por baixo do X. `pt-5` põe a
            // primeira linha na mesma altura óptica do botão.
            "border-b border-border px-6 pt-5 pr-12 pb-4"
          : "p-4",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Região rolável entre header e footer. `min-h-0` é o que faz o scroll
 * acontecer AQUI e não no sheet inteiro — sem ele o flex child recusa
 * encolher e o footer some para fora da viewport.
 */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5",
        className,
      )}
      {...props}
    />
  );
}

function SheetFooter({
  className,
  variant = "plain",
  ...props
}: React.ComponentProps<"div"> & { variant?: SheetChromeVariant }) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex flex-col gap-2",
        variant === "divided"
          ? // `flex-row-reverse` + `justify-start` empacota os botões à
            // DIREITA mantendo o primeiro filho do JSX (a ação primária) na
            // ponta — sem isso os dois ficavam empilhados um sobre o outro.
            // Empilhado só no mobile, onde não cabem lado a lado.
            "border-t border-border px-6 py-4 sm:flex-row-reverse sm:justify-start"
          : "p-4",
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
