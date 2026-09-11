"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ChavePessoa, PessoaEnsaio } from "@/lib/ensaio/modo";

/**
 * "ver como…" — o seletor de pessoa do MODO ENSAIO. Só monta em ensaio (o layout decide).
 *
 * É o `Select` da casa (`components/ui/select.tsx`) — regra do Diogo (22:40): nenhum dropdown
 * fora do design system. Trigger discreto no canto inferior direito, acima do carimbo de build:
 * ferramenta de quem está criticando a tela, não parte do produto. Trocar de pessoa navega para
 * `?como=<chave>` — o middleware grava o cookie, devolve a URL limpa e o servidor remonta a
 * sessão inteira (papel, departamentos, canais). Nada é filtrado no cliente.
 */
export function VerComo({ atual, pessoas }: { atual: PessoaEnsaio; pessoas: readonly PessoaEnsaio[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const ir = (chave: ChavePessoa) => {
    if (chave === atual.chave) return;
    startTransition(() => {
      router.push(`${pathname}?como=${chave}`);
      router.refresh();
    });
  };

  return (
    <div className={cn("fixed bottom-9 right-4 z-40", pending && "opacity-60")}>
      <Select value={atual.chave} onValueChange={(v) => ir(v as ChavePessoa)}>
        <SelectTrigger size="sm" aria-label="Ver como" className="h-8 rounded-full border-border bg-card px-3 text-ui-12 shadow-forte">
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            <span className="text-muted-foreground">ver como</span>
            <SelectValue>
              <span className="font-medium text-foreground">{atual.nome.split(" ")[0]}</span>
              <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/80">{atual.papel}</span>
            </SelectValue>
          </span>
        </SelectTrigger>
        <SelectContent align="end" className="w-[280px]">
          <div className="border-b border-border px-2 py-1.5 text-ui-11 text-muted-foreground">Modo ensaio · dado fictício, sem banco</div>
          {pessoas.map((p) => (
            <SelectItem key={p.chave} value={p.chave}>
              <span className="flex flex-col">
                <span className="text-ui-13 font-medium text-foreground">{p.nome}</span>
                <span className="text-ui-11 text-muted-foreground">{p.descricao}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
