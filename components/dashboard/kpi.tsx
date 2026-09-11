import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Faisca } from "./graficos";
import { Delta } from "./pecas";

/**
 * KPI compacto (≤ 84px): rótulo 11px · valor 22px com a variação inline · contexto 11px. A faísca
 * cabe em 24px à direita do valor. Hierarquia por peso e tamanho, não por caixa (Refactoring UI);
 * tinta só onde há dado (Few).
 */
export function Kpi({
  icone: Icone,
  rotulo,
  valor,
  base,
  delta,
  menorEhMelhor,
  trajetoria,
  tom,
  comparar = true,
  className,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: string;
  base?: string;
  delta?: number | null;
  menorEhMelhor?: boolean;
  trajetoria?: number[];
  tom?: "verde" | "vermelho";
  comparar?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col rounded-lg border border-border bg-card px-3 py-2.5", className)}>
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icone className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="truncate">{rotulo}</span>
      </span>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className={cn("truncate text-[22px] font-semibold leading-none tracking-tight tabular-nums", tom === "verde" ? "text-success-ink" : tom === "vermelho" ? "text-danger-ink" : "text-foreground")}>{valor}</span>
          {comparar ? <Delta delta={delta} menorEhMelhor={menorEhMelhor} /> : null}
        </span>
        {trajetoria && trajetoria.length > 1 ? <Faisca valores={trajetoria} className="h-6 w-16 shrink-0" /> : null}
      </div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground tabular-nums">{base ?? " "}</div>
    </div>
  );
}
