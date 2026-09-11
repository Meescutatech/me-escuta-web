import * as React from "react";
import { cn } from "@/lib/utils";
import type { AgenteInteligencia } from "@/lib/ensaio/inteligencia";

/**
 * As PEÇAS repetidas da seção Inteligência. Pequenas de propósito: o que separa as seções aqui é
 * hairline, não mais um card dentro de um card.
 */

/** O estado do agente — a única cor que a tela usa para falar de agente. */
export function PontoEstado({ situacao }: { situacao: AgenteInteligencia["situacao"] }) {
  const mapa = {
    ligado: { cor: "bg-success-ink", texto: "Ativo" },
    esperando_credencial: { cor: "bg-warning-ink", texto: "Esperando credencial" },
    desligado: { cor: "bg-muted-foreground/45", texto: "Desligado" },
  } as const;
  const e = mapa[situacao];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn("size-1.5 rounded-full", e.cor)} aria-hidden />
      {e.texto}
    </span>
  );
}

export function TagAgente({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[4px] border border-border px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground">
      {children}
    </span>
  );
}

/** Uma seção da tela do agente: título discreto à esquerda, conteúdo à direita da hairline. */
export function Secao({
  titulo,
  descricao,
  acao,
  children,
  className,
}: {
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-t border-border/60 py-7", className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">{titulo}</h2>
          {descricao && <p className="mt-0.5 max-w-[76ch] text-[12.5px] text-muted-foreground">{descricao}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Um número grande com o rótulo embaixo — no cabeçalho do agente. */
export function NumeroGrande({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-[92px]">
      <p className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground tabular-nums">{valor}</p>
      <p className="mt-1 text-[11.5px] text-muted-foreground">{rotulo}</p>
    </div>
  );
}

export function VazioHonesto({ titulo, linha }: { titulo: string; linha: string }) {
  return (
    <div className="rounded-md border border-dashed border-border px-4 py-6 text-center">
      <p className="text-[13.5px] font-medium text-foreground">{titulo}</p>
      <p className="mx-auto mt-1 max-w-[54ch] text-[12.5px] text-muted-foreground">{linha}</p>
    </div>
  );
}
