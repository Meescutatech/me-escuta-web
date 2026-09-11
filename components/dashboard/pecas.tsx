import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Peças pequenas compartilhadas pelas abas do dashboard do dono.
 *
 * O par agente × pessoa é a ASSINATURA da tela: azul (`azul-graf`) para agente, laranja para
 * pessoa — o mesmo par validado pela bateria da skill dataviz em 29/08 (CVD e contraste). Ele
 * aparece no trilho, nas barras por dia e no ponto ao lado de cada nome, sempre com o rótulo
 * escrito ao lado: cor nunca sozinha.
 */

export const COR_AGENTE = "#3D53B8";
export const COR_HUMANO = "#EC662E";
export const FILL_AGENTE = "fill-azul-graf";
export const FILL_HUMANO = "fill-laranja";

export function Ponto({ tipo, className }: { tipo: "agente" | "humano" | "sistema"; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-[2px]", tipo === "agente" ? "bg-azul-graf" : tipo === "humano" ? "bg-laranja" : "bg-muted-foreground/40", className)}
      aria-hidden
    />
  );
}

export function LegendaAgenteHumano() {
  return (
    <span className="flex items-center gap-3 text-ui-11 text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Ponto tipo="agente" /> agentes
      </span>
      <span className="flex items-center gap-1.5">
        <Ponto tipo="humano" /> pessoas
      </span>
    </span>
  );
}

/** Link de ação dentro de um bloco — texto, sem seta: o verbo já diz o que acontece. */
export function Acao({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("font-medium text-foreground underline decoration-foreground/30 underline-offset-[3px] hover:decoration-foreground", className)}>
      {children}
    </Link>
  );
}

/** Cabeçalho de coluna de tabela: sentence case, 11px, alinhado à direita quando numérico. */
export function Th({ children, direita = true, className, title }: { children?: React.ReactNode; direita?: boolean; className?: string; title?: string }) {
  return (
    <th scope="col" title={title} className={cn("pb-2 text-ui-11 font-medium text-muted-foreground", direita ? "text-right" : "text-left", className)}>
      {children}
    </th>
  );
}

export function ddmm(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}
