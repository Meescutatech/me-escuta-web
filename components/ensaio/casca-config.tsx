import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A casca de uma tela de Configurações (portada do `SettingsShell` do LiderHub):
 * título + uma frase de descrição + [ação primária] > hairline > conteúdo.
 *
 * A descrição diz O QUE A TELA DECIDE, não o que ela lista — "quem tem acesso e o que cada um
 * pode fazer" em vez de "lista de membros". A ação primária fica na linha do título porque é a
 * única coisa que a pessoa faz nesta tela que não é olhar.
 */
export function CascaConfig({
  titulo,
  descricao,
  acao,
  largo = false,
  children,
  className,
}: {
  titulo: string;
  descricao: string;
  acao?: ReactNode;
  /** tabela de 5+ colunas — pede os 960px do layout (`data-largo`). */
  largo?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-largo={largo ? "" : undefined} className={cn("flex flex-col gap-5", className)}>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-[560px]">
          <h1 className="text-h2 font-semibold text-foreground">{titulo}</h1>
          <p className="mt-1.5 text-ui-13 leading-relaxed text-muted-foreground">{descricao}</p>
        </div>
        {acao ? <div className="flex shrink-0 items-center gap-2 pt-1">{acao}</div> : null}
      </header>
      <div className="h-px w-full bg-border" role="presentation" />
      {children}
    </div>
  );
}

/** Contagem discreta ao lado da busca: "4 membros · 2 convites". */
export function Contagem({ children }: { children: ReactNode }) {
  return <span className="text-ui-12 tabular-nums text-muted-foreground">{children}</span>;
}
