import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * As peças do dashboard do dono (v2, 10/09/2026 — refeito depois da reprovação do Diogo).
 *
 * A estética é a de um painel de administração denso: fundo branco, borda de 1px, raio 10px, Inter,
 * `tabular-nums` em tudo que é número, e NENHUMA cor além do verde/vermelho de dinheiro e de
 * variação. Identidade fica no dado, não no enfeite: número semibold com o percentual em 11px
 * apagado ao lado, linha TOTAL em bold, gráfico de linha preta fina.
 */

/** A moldura de todo bloco: borda, raio 10px, branco. `denso` tira o padding para tabelas. */
export function Bloco({ children, className, denso = false }: { children: React.ReactNode; className?: string; denso?: boolean }) {
  return <section className={cn("rounded-lg border border-border bg-card", denso ? "" : "px-5 py-4", className)}>{children}</section>;
}

/** Cabeçalho de bloco: título 13px semibold + descrição 11px apagada + controles à direita. */
export function CabecalhoBloco({ titulo, descricao, direita, className }: { titulo: string; descricao?: string; direita?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-foreground">{titulo}</h2>
        {descricao ? <p className="mt-0.5 text-[11px] text-muted-foreground">{descricao}</p> : null}
      </div>
      {direita ? <div className="flex shrink-0 items-center gap-2">{direita}</div> : null}
    </header>
  );
}

/** Variação vs período anterior — chip. O sinal é escrito; a cor reforça. `menorEhMelhor` inverte o tom. */
export function Delta({ delta, menorEhMelhor = false, className }: { delta: number | null | undefined; menorEhMelhor?: boolean; className?: string }) {
  if (delta == null) return null;
  const pct = Math.round(delta * 100);
  if (pct === 0) return <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground bg-muted", className)}>0%</span>;
  const bom = menorEhMelhor ? delta < 0 : delta > 0;
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", bom ? "bg-success-tint text-success-ink" : "bg-danger-tint text-danger-ink", className)}>
      {pct > 0 ? "+" : "−"}
      {Math.abs(pct)}%
    </span>
  );
}

/** Número + percentual apagado ao lado — a célula padrão das tabelas ("945 51,2%"). */
export function NumPct({ n, pct, className, tom }: { n: string; pct?: string | null; className?: string; tom?: "verde" | "vermelho" | "amarelo" }) {
  return (
    <span className={cn("inline-flex items-baseline justify-end gap-1.5 tabular-nums", className)}>
      <span className={cn("font-semibold", tom === "verde" && "text-success-ink", tom === "vermelho" && "text-danger-ink", tom === "amarelo" && "text-warning-ink")}>{n}</span>
      {pct ? <span className="text-[11px] text-muted-foreground">{pct}</span> : null}
    </span>
  );
}

export function Th({ children, direita = true, className, title }: { children?: React.ReactNode; direita?: boolean; className?: string; title?: string }) {
  return (
    <th scope="col" title={title} className={cn("whitespace-nowrap px-2.5 py-2 text-[11px] font-medium text-muted-foreground", direita ? "text-right" : "text-left", className)}>
      {children}
    </th>
  );
}

export function Td({ children, direita = true, className, title }: { children?: React.ReactNode; direita?: boolean; className?: string; title?: string }) {
  return (
    <td title={title} className={cn("whitespace-nowrap px-2.5 py-2 text-[13px] tabular-nums text-foreground", direita ? "text-right" : "text-left", className)}>
      {children}
    </td>
  );
}

/** Avatar redondo com iniciais — cinza, sem cor por pessoa. Agente ganha o fundo escuro. */
export function AvatarIniciais({ nome, agente = false, tamanho = 26 }: { nome: string; agente?: boolean; tamanho?: number }) {
  const partes = nome.trim().split(/\s+/);
  const iniciais = ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", agente ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}
      style={{ width: tamanho, height: tamanho }}
    >
      {iniciais}
    </span>
  );
}

export function IconeRotulo({ icone: Icone, children }: { icone: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      <Icone className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

export function ddmm(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "25 mai" — como no eixo do painel de referência. */
export function diaMes(ymd: string): string {
  return `${Number(ymd.slice(8, 10))} ${MESES_CURTOS[Number(ymd.slice(5, 7)) - 1] ?? ""}`;
}
export function mesCurto(ym: string): string {
  return MESES_CURTOS[Number(ym.slice(5, 7)) - 1] ?? ym;
}
