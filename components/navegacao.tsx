"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Só as 3 visualizações da operação (R7 D4, ordem do mockup r9): Visão geral · Funil ·
 * Conversas. /fila, /jarvis e /timeline continuam existindo como rotas — só fora do menu.
 * Item ativo: navy + peso 600 + fundo --hover (r9-tokens §nav).
 */
const ROTAS = [
  { href: "/", rotulo: "Visão geral" },
  { href: "/funil", rotulo: "Funil" },
  { href: "/conversas", rotulo: "Conversas" },
];

export function Navegacao() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {ROTAS.map((r) => {
        const ativa =
          r.href === "/" ? pathname === "/" : pathname === r.href || pathname.startsWith(r.href + "/");
        return (
          <Link
            key={r.href}
            href={r.href}
            className={cn(
              "rounded-[6px] px-3 py-1.5 text-[13.5px] transition-colors",
              ativa
                ? "bg-hover font-semibold text-navy"
                : "font-medium text-suave hover:bg-hover hover:text-tinta",
            )}
          >
            {r.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
