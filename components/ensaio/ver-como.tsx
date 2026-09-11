"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import type { ChavePessoa, PessoaEnsaio } from "@/lib/ensaio/modo";

/**
 * "ver como…" — o seletor de pessoa do MODO ENSAIO. Só monta em ensaio (o layout decide).
 *
 * Fica no canto inferior direito, discreto, acima do carimbo de build: é ferramenta de quem está
 * criticando a tela, não parte do produto. Trocar de pessoa é navegar para `?como=<chave>` — o
 * middleware grava o cookie e devolve a URL limpa, e o servidor remonta a sessão inteira (papel,
 * departamentos, canais, o que a pessoa vê). Nada é filtrado no cliente.
 */
export function VerComo({ atual, pessoas }: { atual: PessoaEnsaio; pessoas: readonly PessoaEnsaio[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();

  const ir = (chave: ChavePessoa) => {
    setAberto(false);
    startTransition(() => {
      router.push(`${pathname}?como=${chave}`);
      router.refresh();
    });
  };

  return (
    <div className="fixed bottom-9 right-4 z-40 flex flex-col items-end gap-1.5">
      {aberto && (
        <div
          role="menu"
          className="w-[264px] overflow-hidden rounded-lg border border-border bg-popover shadow-forte animate-rise"
        >
          <div className="border-b border-border px-3 py-2 text-ui-11 text-muted-foreground">
            Modo ensaio · dado fictício, sem banco
          </div>
          {pessoas.map((p) => (
            <button
              key={p.chave}
              role="menuitemradio"
              aria-checked={p.chave === atual.chave}
              onClick={() => ir(p.chave)}
              className={cn(
                "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent",
                p.chave === atual.chave && "bg-primary/10",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
                  p.chave === atual.chave ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {p.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </span>
              <span className="min-w-0">
                <span className="block text-ui-13 font-medium text-foreground">{p.nome}</span>
                <span className="block truncate text-ui-11 text-muted-foreground">{p.descricao}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-ui-12 text-muted-foreground shadow-forte transition-colors hover:text-foreground",
          pending && "opacity-60",
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
        ver como
        <span className="font-medium text-foreground">{atual.nome.split(" ")[0]}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">{atual.papel}</span>
      </button>
    </div>
  );
}
