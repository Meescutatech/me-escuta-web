"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ROTAS = [
  { href: "/funil", rotulo: "Funil" },
  { href: "/conversas", rotulo: "Conversas" },
  { href: "/timeline", rotulo: "Timeline" },
  { href: "/fila", rotulo: "Fila" },
];

/** Navegação principal com destaque da rota ativa (client — usa usePathname). */
export function Navegacao() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {ROTAS.map((r) => {
        const ativa = pathname === r.href || pathname.startsWith(r.href + "/");
        return (
          <Link
            key={r.href}
            href={r.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              ativa ? "bg-laranja-cl text-laranja-esc" : "text-suave hover:bg-creme hover:text-navy",
            )}
          >
            {r.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
