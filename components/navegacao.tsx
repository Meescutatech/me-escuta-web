"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Só as 3 visualizações da operação (Rodada 7, D4): Funil · Conversas · Dashboard.
 * /fila, /jarvis e /timeline continuam existindo como rotas (a fila é o coração HITL da
 * Clara) — só saem do menu.
 */
const ROTAS = [
  { href: "/funil", rotulo: "Funil" },
  { href: "/conversas", rotulo: "Conversas" },
  { href: "/", rotulo: "Dashboard" },
];

/**
 * Navegação principal — texto puro, sem pills (redesign Notion-minimalista, fase 1).
 * Item ativo se distingue por PESO + cor navy, não por cápsula (spec §2 do kanban-v2.html).
 */
export function Navegacao() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-0.5">
      {ROTAS.map((r) => {
        const ativa =
          r.href === "/" ? pathname === "/" : pathname === r.href || pathname.startsWith(r.href + "/");
        return (
          <Link
            key={r.href}
            href={r.href}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-sm transition-colors",
              ativa
                ? "font-semibold text-navy"
                : "font-normal text-suave hover:bg-hover hover:text-tinta",
            )}
          >
            {r.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
