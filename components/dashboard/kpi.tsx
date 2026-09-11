import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Faisca } from "./graficos";
import { Delta, IconeRotulo } from "./pecas";

/**
 * O card de KPI do painel de referência: ícone + rótulo em caixa alta espaçada, valor grande em
 * `tracking-tighter`, o chip de variação, e embaixo em 11px apagado a base do número ("945 / 1.846").
 * A faísca fica no rodapé, preta e fina — é o formato da trajetória, não um gráfico para ler.
 */
export function Kpi({
  icone,
  rotulo,
  valor,
  base,
  delta,
  menorEhMelhor,
  trajetoria,
  tom,
  className,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: string;
  /** "945 / 1.846" · "Total: R$ 1.230.565 · 1.123 ativas" */
  base?: string;
  delta?: number | null;
  menorEhMelhor?: boolean;
  trajetoria?: number[];
  /** dinheiro ganho fica verde; débito (tarefas vencidas) fica vermelho */
  tom?: "verde" | "vermelho";
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col rounded-lg border border-border bg-card px-4 pt-3.5 pb-2.5", className)}>
      <IconeRotulo icone={icone}>{rotulo}</IconeRotulo>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className={cn("truncate text-2xl font-semibold leading-none tracking-tighter tabular-nums", tom === "verde" ? "text-success-ink" : tom === "vermelho" ? "text-danger-ink" : "text-foreground")}>{valor}</span>
        <Delta delta={delta} menorEhMelhor={menorEhMelhor} />
      </div>
      <div className="mt-1.5 truncate text-[11px] text-muted-foreground tabular-nums">{base ?? " "}</div>
      <div className="mt-2 h-7">{trajetoria && trajetoria.length > 1 ? <Faisca valores={trajetoria} /> : null}</div>
    </div>
  );
}
