import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DicaInfo } from "./dica-info";
import { SeloVariacao } from "./selo-variacao";
import { MiniBarras } from "./viz";

/**
 * O card de KPI de TODOS os blocos do dashboard (portado de `components/report/stat-card.tsx`).
 *
 * **As três linhas são sempre renderizadas** em `md`/`lg`, mesmo vazias — reservar a linha do
 * rodapé é o que mantém a fileira alinhada quando um card tem trajetória e o vizinho não.
 *
 * `md` — a densidade padrão: grades de 4 a 6, valor `text-h2`.
 * `lg` — o hero de 3: `text-h1`, para a leitura de relance.
 * `sm` — faixa de contexto (não é o assunto da tela). Sem a terceira linha.
 */
export type TamanhoIndicador = "sm" | "md" | "lg";

const ALTURA: Record<TamanhoIndicador, number> = { sm: 84, md: 110, lg: 130 };

export function CartaoIndicador({
  rotulo,
  dica,
  valor,
  tamanho = "md",
  icone: Icone,
  acento,
  detalhe,
  trajetoria,
  corTrajetoria,
  delta,
  rotuloDelta,
  menorEhMelhor,
  adorno,
  className,
}: {
  rotulo: string;
  /** Explicação da métrica — vai para o painel do "i". */
  dica: string;
  valor: string;
  tamanho?: TamanhoIndicador;
  /** Ícone no canto superior direito: identificação, não decoração — a mesma métrica leva o mesmo ícone em todo bloco. */
  icone?: LucideIcon;
  /** Cor do ícone: token do tema (`var(--chart-1)`), nunca hex. */
  acento?: string;
  /** A base do número, na terceira linha ("de 227 conversas"). */
  detalhe?: string;
  /** Trajetória do número no período (mini-barras, sem eixo). */
  trajetoria?: number[];
  corTrajetoria?: string;
  /** Fração vs período anterior (0.082 = +8,2%). */
  delta?: number | null;
  rotuloDelta?: string;
  menorEhMelhor?: boolean;
  /** Conteúdo extra ao lado do valor. */
  adorno?: ReactNode;
  className?: string;
}) {
  const grande = tamanho === "lg";
  return (
    <Card
      data-slot="cartao-indicador"
      data-tamanho={tamanho}
      className={cn("flex min-w-0 flex-col justify-between", grande ? "gap-3 px-5 py-5" : "gap-2.5 px-4 py-4", className)}
      style={{ minHeight: ALTURA[tamanho] }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-ui-13 font-medium text-muted-foreground">
          <span className="truncate">{rotulo}</span>
          <DicaInfo titulo={rotulo} dica={dica} align="start" tamanho="sm" />
        </span>
        {Icone ? (
          <Icone className={cn("size-4 shrink-0", acento ? "" : "text-muted-foreground/50")} style={acento ? { color: acento } : undefined} strokeWidth={1.75} aria-hidden="true" />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("min-w-0 truncate leading-none font-semibold tracking-tight text-foreground tabular-nums", grande ? "text-h1" : "text-h2")}>{valor}</span>
        {adorno}
        <SeloVariacao delta={delta} rotulo={rotuloDelta} menorEhMelhor={menorEhMelhor} tamanho={grande ? "md" : "sm"} />
      </div>

      {tamanho !== "sm" ? (
        <div className="flex h-4 items-end justify-between gap-2">
          <span className="truncate text-ui-11 text-muted-foreground tabular-nums">{detalhe ?? ""}</span>
          {trajetoria && trajetoria.length > 0 ? <MiniBarras valores={trajetoria} cor={corTrajetoria} className="w-20" /> : null}
        </div>
      ) : null}
    </Card>
  );
}

/** Esqueleto com a MEDIDA real do card, lida da mesma constante. */
export function CartaoIndicadorEsqueleto({ tamanho = "md", className }: { tamanho?: TamanhoIndicador; className?: string }) {
  return <Skeleton className={cn("rounded-xl", className)} style={{ height: ALTURA[tamanho] }} />;
}
