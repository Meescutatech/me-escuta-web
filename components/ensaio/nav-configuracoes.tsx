"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeftIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GRUPOS_CONFIG, type EstadoSecao, type SecaoConfig } from "@/lib/ensaio/config-secoes";
import { ICONES_SECAO } from "./icone-secao";

/**
 * A NAV DE CONFIGURAÇÕES — e ela é a navegação inteira, porque não existe mais página-índice.
 *
 * O hub mostrava o estado de cada seção numa lista de cards; a lista estava certa e o card era
 * o desperdício. O estado veio para cá (`estados`), e aí a tela-índice não tinha mais o que
 * mostrar: `/configuracoes` passou a redirecionar para Membros. É o mesmo desenho do Twenty
 * (`/settings` cai no Perfil) e do LiderHub (a rail de settings troca a sidebar do app).
 *
 * Três decisões de desenho, e cada uma tem uma medição atrás:
 *  · **240px** — entre os 220 do Twenty (`NavigationDrawerConstraints.ts`) e os 246 do LiderHub
 *    (`components/ui/sidebar.tsx:31`), e os nossos rótulos são mais longos que os deles.
 *  · **Barra de 2px à esquerda no ativo**, além do fundo. Os dois benchmarks marcam só com fundo;
 *    numa lista de 14 itens isso não se acha de relance.
 *  · **O estado à direita é texto muted, nunca badge vermelho de contagem.** No Kommo a fila
 *    vermelha tinha 755 itens e ninguém olhava.
 *
 * Colapsar é estado de React, sem `localStorage` de propósito: o layout do segmento não remonta ao
 * navegar entre as telas de Configurações, então a escolha sobrevive à navegação — e não há leitura
 * de storage no primeiro paint, que é o que produziria o pulo.
 */
export function NavConfiguracoes({ estados }: { estados: Record<string, EstadoSecao> }) {
  const rota = usePathname();
  const [fechada, setFechada] = useState(false);

  const ativa = (s: SecaoConfig) =>
    rota === s.href || rota.startsWith(s.href + "/") || (s.tambem ?? []).some((t) => rota === t || rota.startsWith(t + "/"));

  return (
    <nav
      aria-label="Configurações"
      data-fechada={fechada || undefined}
      className={cn(
        "flex flex-none flex-col overflow-hidden border-r border-border bg-sidebar pb-8 pt-4 transition-[width] duration-200 ease-out motion-reduce:transition-none",
        fechada ? "w-[60px]" : "w-[240px]",
      )}
    >
      <div className={cn("mb-4 flex items-center gap-1 px-3", fechada && "justify-center px-0")}>
        {!fechada && <span className="min-w-0 flex-1 truncate px-2 text-ui-13 font-semibold text-foreground">Configurações</span>}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setFechada((f) => !f)}
                aria-label={fechada ? "Abrir a navegação" : "Fechar a navegação"}
                aria-pressed={fechada}
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PanelLeftIcon className="size-4" />
              </button>
            }
          />
          <TooltipContent side="right">{fechada ? "Abrir a navegação" : "Fechar a navegação"}</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3">
        {GRUPOS_CONFIG.map((g) => (
          <div key={g.rotulo}>
            {fechada ? (
              <div className="mb-1.5 h-px bg-border" role="presentation" />
            ) : (
              <div className="px-2 pb-1 text-ui-11 font-semibold uppercase tracking-[0.08em] text-muted-foreground">{g.rotulo}</div>
            )}
            {g.secoes.map((s) => {
              const acesa = ativa(s);
              const e = estados[s.href];
              const item = (
                <Link
                  href={s.href}
                  aria-current={acesa ? "page" : undefined}
                  aria-disabled={s.emBreve || undefined}
                  className={cn(
                    "relative mb-px flex h-8 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[18px] [&_svg]:shrink-0",
                    fechada ? "justify-center px-0" : "gap-2.5 px-2",
                    acesa
                      ? "bg-muted text-foreground [&_svg]:text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:text-muted-foreground",
                    s.emBreve && "opacity-55",
                  )}
                >
                  {acesa && <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" aria-hidden />}
                  {ICONES_SECAO[s.icone]}
                  {!fechada && (
                    <>
                      <span className={cn("min-w-0 flex-1 truncate text-[14px] leading-none", acesa ? "font-semibold" : "font-medium")}>
                        {s.rotulo}
                      </span>
                      {e && (
                        <span className={cn("shrink-0 text-ui-11 tabular-nums", e.atencao ? "text-warning-ink" : "text-muted-foreground")}>
                          {e.texto}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              );
              return fechada ? (
                <Tooltip key={s.href}>
                  <TooltipTrigger render={item} />
                  <TooltipContent side="right">
                    {s.rotulo}
                    {e ? ` · ${e.texto}` : ""}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span key={s.href} className="contents">
                  {item}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
