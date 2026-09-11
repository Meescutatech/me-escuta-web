import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DicaInfo } from "./dica-info";

/**
 * Moldura das tabelas de relatório que têm cabeçalho próprio (portado de `table-section.tsx`).
 * A regra de escolha é a mesma do `CartaoGrafico`: **tem controle no cabeçalho ou cor a
 * decodificar → moldura; senão → rótulo.**
 */
export function SecaoTabela({
  titulo,
  descricao,
  icone: Icone,
  meta,
  dica,
  legenda,
  rodape,
  acoes,
  className,
  children,
}: {
  titulo: string;
  /** Uma linha dizendo o que a tabela lista. */
  descricao?: string;
  icone: LucideIcon;
  /** Contagem à direita ("4 pessoas no período"). */
  meta?: ReactNode;
  dica?: string;
  legenda?: ReactNode;
  rodape?: ReactNode;
  acoes?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section data-slot="secao-tabela" className={cn("flex flex-col rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10", className)}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icone className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-ui-13 font-semibold text-foreground">{titulo}</h3>
            {descricao ? <p className="mt-0.5 text-ui-11 text-muted-foreground">{descricao}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {meta ? <span className="text-ui-12 text-muted-foreground tabular-nums">{meta}</span> : null}
          {acoes}
          <DicaInfo titulo={titulo} dica={dica} legenda={legenda} rodape={rodape} />
        </div>
      </header>
      <div className="mt-3">{children}</div>
    </section>
  );
}
