import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Estado de vazio dos blocos (portado de `states.tsx`). A regra: **o vazio é do BLOCO, não da
 * tela** — os números que já chegaram continuam visíveis. Sem ícone de propósito: é uma linha de
 * direção, não um cartão de erro. `acao` é o que a pessoa faz para o bloco deixar de estar vazio.
 */
export function BlocoVazio({ titulo, descricao, acao, className }: { titulo: string; descricao?: string; acao?: React.ReactNode; className?: string }) {
  return (
    <div data-slot="bloco-vazio" className={cn("flex flex-col items-center justify-center gap-2 px-6 py-8 text-center", className)}>
      <p className="text-ui-13 font-medium text-foreground">{titulo}</p>
      {descricao ? <p className="max-w-[420px] text-ui-12 text-muted-foreground">{descricao}</p> : null}
      {acao ? <div className="mt-1">{acao}</div> : null}
    </div>
  );
}
