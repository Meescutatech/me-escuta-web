"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type CollapsibleNavGroupProps = {
  label: string;
  icon?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  /**
   * `item` — o grupo se parece com um item de navegação (ícone à esquerda,
   *   mesma altura e tinta dos vizinhos).
   * `section` — cabeçalho de seção: menor, rebaixado, sem ícone. É o rótulo que
   *   ORIENTA a barra, e por isso ele mesmo é o gatilho de colapso: um título
   *   que não faz nada gasta uma linha inteira para não ser clicável.
   */
  variant?: "item" | "section";
  /**
   * Ação na ponta direita do cabeçalho (um "+", por exemplo). Fica FORA do
   * botão de colapso — botão dentro de botão não é HTML válido e o clique da
   * ação abriria/fecharia o grupo junto.
   *
   * Ela só APARECE com o ponteiro na barra (`group/sidebar`, posto no
   * `SidebarContent`): é ação secundária, e uma coluna de "+" permanente compete
   * com os rótulos, que são o que a pessoa está lendo. Três cuidados:
   *
   * - some por `opacity`, não por `hidden`, para continuar na ordem de tabulação;
   * - `focus-visible` a revela, senão quem navega por teclado tabula para um
   *   alvo invisível;
   * - em aparelho sem ponteiro (`hover: none`) ela fica **sempre visível**, senão
   *   no toque não haveria como chegar nela.
   */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function CollapsibleNavGroup({
  label,
  icon,
  isOpen,
  onToggle,
  variant = "item",
  action,
  children,
  className,
}: CollapsibleNavGroupProps) {
  const isSection = variant === "section";

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      {/* O cabeçalho é uma LINHA (o botão de colapso + a ação), não um botão só:
          aninhar `<button>` dentro de `<button>` é inválido, e o clique no "+"
          colapsaria o grupo antes de navegar. */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className={cn(
            "flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 transition-colors",
            isSection
              ? "text-[12px] font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground"
              : "gap-2 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent/60",
          )}
        >
          {icon}
          <span className="truncate text-left">{label}</span>
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 transition-transform duration-200",
              isSection
                ? "text-sidebar-foreground/40"
                : "ml-auto text-sidebar-foreground/40",
            )}
            style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
          />
        </button>
        {action ? (
          <div
            className={cn(
              "shrink-0 pr-1 transition-opacity",
              // Sem ponteiro (toque), fica sempre à mostra.
              "[@media(hover:hover)]:opacity-0",
              "[@media(hover:hover)]:group-hover/sidebar:opacity-100",
              "focus-within:opacity-100",
            )}
          >
            {action}
          </div>
        ) : null}
      </div>

      {/* Colapso animado por `grid-template-rows`: anima altura sem precisar
          medir o conteúdo. */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
        style={{
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          opacity: isOpen ? 1 : 0,
        }}
      >
        {/* `<ul>`, não `<div>`: os filhos são `SidebarMenuItem` (`<li>`) e o
            grupo inteiro já vive dentro de um `<li>` do `SidebarMenu`. Sem uma
            lista no meio o DOM fica com `<li>` dentro de `<li>` — o React
            avisava "cannot contain a nested <li>" no console em toda navegação
            de settings. `list-none` porque isto é um submenu, não uma lista com
            marcador. */}
        <ul className="list-none overflow-hidden">{children}</ul>
      </div>
    </div>
  );
}
