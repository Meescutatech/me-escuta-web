import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { GRUPOS_CONFIG } from "@/lib/ensaio/config-secoes";
import { IconeSecao } from "./icone-secao";

/**
 * O índice do hub de Configurações. Título e ponto (pedido do Diogo 21:55: "o destaque vai para
 * CADA ITEM, não para uma frase de abertura"). Cada grupo tem cabeçalho pequeno em caixa alta e
 * os itens são LINHAS clicáveis: ícone lucide · nome (15-16px semibold) · uma linha do que é
 * (13-14px) · e, à direita, o estado em uma frase ("3 de 3 no ar", "2 convites pendentes").
 */
export function HubConfiguracoes({ resumo }: { resumo: Record<string, { linha: string; atencao?: string }> }) {
  return (
    <div className="flex flex-col gap-9">
      <h1 className="text-h1 font-semibold text-foreground">Configurações</h1>

      {GRUPOS_CONFIG.map((g) => (
        <section key={g.rotulo} className="flex flex-col gap-2.5">
          <h2 className="px-1 text-ui-12 font-semibold uppercase tracking-[0.08em] text-muted-foreground">{g.rotulo}</h2>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {g.secoes.map((s, i) => {
              const r = resumo[s.href];
              const conteudo = (
                <>
                  <IconeSecao
                    nome={s.icone}
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-[18px]",
                      s.emBreve ? "bg-muted text-muted-foreground" : "bg-muted text-foreground",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn("text-[15px] font-semibold leading-tight", s.emBreve ? "text-muted-foreground" : "text-foreground")}>{s.rotulo}</span>
                      {s.emBreve && <span className="rounded-full border border-border px-1.5 py-px text-ui-10 uppercase tracking-wide text-muted-foreground">em breve</span>}
                    </span>
                    <span className="mt-0.5 block text-[13.5px] leading-snug text-muted-foreground">{s.descricao}</span>
                  </span>
                  {r && !s.emBreve && (
                    <span className="hidden shrink-0 text-right md:block">
                      <span className="block text-[13px] text-foreground">{r.linha}</span>
                      {r.atencao && <span className="block text-[12.5px] font-medium text-warning-ink">{r.atencao}</span>}
                    </span>
                  )}
                  {!s.emBreve && <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/60" />}
                </>
              );
              const classe = cn("flex items-center gap-4 px-4 py-3.5", i > 0 && "border-t border-border");
              return s.emBreve ? (
                <div key={s.href} className={cn(classe, "cursor-default")}>
                  {conteudo}
                </div>
              ) : (
                <Link key={s.href} href={s.href} className={cn(classe, "transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50")}>
                  {conteudo}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
