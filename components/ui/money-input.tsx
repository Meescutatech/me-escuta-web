"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { digitsToCents, formatCentsDecimal } from "@/lib/money";
import { cn } from "@/lib/utils";

type MoneyInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  /** Valor em CENTAVOS (BRL). */
  value: number;
  /** Recebe o novo valor em CENTAVOS. */
  onValueChange: (value: number) => void;
};

/**
 * Input de moeda em Real padronizado. O valor é sempre CENTAVOS (inteiro) — os
 * dígitos digitados alimentam a direita (ex.: "123456" → R$ 1.234,56). O símbolo
 * "R$" é um prefixo fixo e o número aparece sempre formatado (agrupamento +
 * 2 casas). Casa com `formatCurrency`/`formatProductPrice`.
 */
function MoneyInput({
  value,
  onValueChange,
  className,
  onFocus,
  ...props
}: MoneyInputProps) {
  return (
    <div data-slot="money-input" className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">
        R$
      </span>
      <Input
        inputMode="numeric"
        value={formatCentsDecimal(value)}
        // Caret sempre no fim: o campo funciona como calculadora (dígitos entram
        // pela direita); editar no meio reformataria de forma confusa.
        onFocus={(event) => {
          const end = event.currentTarget.value.length;
          event.currentTarget.setSelectionRange(end, end);
          onFocus?.(event);
        }}
        onChange={(event) => onValueChange(digitsToCents(event.target.value))}
        className={cn("pl-8 tabular-nums", className)}
        {...props}
      />
    </div>
  );
}

export { MoneyInput };
