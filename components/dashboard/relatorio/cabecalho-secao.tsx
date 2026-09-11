import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DicaInfo } from "./dica-info";

/**
 * Rótulo de seção — a variante LEVE de cabeçalho de bloco (portado de `section-head.tsx`).
 * Custa 14px de altura, contra os ~60px do `CartaoGrafico`. Use quando o bloco abaixo já é uma
 * superfície fechada (uma tabela, uma grade de KPI) e o único trabalho do cabeçalho é nomeá-la.
 * A explicação NÃO fica na tela: vira tooltip no ícone ao lado.
 */
export function CabecalhoSecao({ rotulo, dica, tituloDica, acoes, className }: { rotulo: string; dica: string; tituloDica?: string; acoes?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 pt-2", acoes != null && "min-h-8", className)} data-slot="cabecalho-secao">
      <p className="text-ui-12 font-semibold text-muted-foreground">{rotulo}</p>
      <DicaInfo titulo={tituloDica ?? rotulo} dica={dica} align="start" tamanho="sm" />
      {acoes != null ? <div className="ml-auto flex shrink-0 items-center gap-2">{acoes}</div> : null}
    </div>
  );
}
