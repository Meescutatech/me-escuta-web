"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GRUPOS_CONFIG, type SecaoConfig } from "@/lib/ensaio/config-secoes";
import { ICONES_SECAO } from "@/components/ensaio/icone-secao";

/**
 * HUB DE CONFIGURAÇÕES (W-D2, 10/09 — pedido do Diogo: "uma tela completa, com destaque").
 *
 * Padrão Twenty `SettingsPageLayout` + LiderHub `settings-shell`: navegação lateral PRÓPRIA, com
 * ícone por seção, agrupada pelo que a seção governa — a EMPRESA (quem somos, quem entra, por
 * onde falamos, com quem nos ligamos), a INTELIGÊNCIA (os agentes) e a OPERAÇÃO (funil, textos
 * prontos, o resto). A ordem é a do pedido: Geral · Membros · Números · Integrações · Agentes ·
 * Funil · Templates · Avançado. A lista vive em `lib/ensaio/config-secoes.ts` porque o índice
 * do hub (`page.tsx`, server) desenha os mesmos cards.
 *
 * Sub-rotas antigas continuam vivas e acendem a seção-mãe: `/configuracoes/clara` e
 * `/configuracoes/agentes/jarvis` acendem "Agentes"; `/identidades` e `/suporte`, "Avançado".
 */

export default function ConfiguracoesLayout({ children }: { children: ReactNode }) {
  const rota = usePathname();
  const ativa = (s: SecaoConfig) =>
    rota === s.href || rota.startsWith(s.href + "/") || (s.tambem ?? []).some((t) => rota === t || rota.startsWith(t + "/"));
  const noIndice = rota === "/configuracoes";
  void noIndice;

  return (
    <div className="flex min-h-[calc(100vh-var(--altura-topo))] bg-background">
      <nav aria-label="Configurações" className="w-[240px] flex-none border-r border-border bg-sidebar px-3 pb-8 pt-5">
        <Link
          href="/configuracoes"
          aria-current={noIndice ? "page" : undefined}
          className={cn(
            "mb-4 flex items-center gap-2 rounded-md px-2 py-1.5 text-ui-14 font-semibold",
            noIndice ? "bg-[#EAECF5] text-navy" : "text-foreground hover:bg-accent",
          )}
        >
          Configurações
        </Link>
        {GRUPOS_CONFIG.map((g) => (
          <div key={g.rotulo} className="mb-5 last:mb-0">
            <div className="px-2 pb-1 text-ui-11 font-semibold uppercase tracking-[0.08em] text-muted-foreground">{g.rotulo}</div>
            {g.secoes.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                aria-current={ativa(s) ? "page" : undefined}
                aria-disabled={s.emBreve || undefined}
                className={cn(
                  "mb-px flex items-center gap-2.5 rounded-md px-2 py-1.5 text-ui-13 [&_svg]:size-4 [&_svg]:shrink-0",
                  ativa(s)
                    ? "bg-[#EAECF5] font-semibold text-navy [&_svg]:text-navy"
                    : "font-medium text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:text-muted-foreground",
                  s.emBreve && "opacity-60",
                )}
              >
                {ICONES_SECAO[s.icone]}
                {s.rotulo}
                {s.emBreve && <span className="ml-auto text-ui-10 uppercase tracking-wide text-muted-foreground">breve</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      {/* REGRA GLOBAL (Diogo, 23:20): "olha o tanto de espaço que estamos perdendo" — nada de coluna
          estreita centrada. Largura FLUIDA, gutter 24px (32px em ≥1536), `max-w` só em 1600px.
          Era 720/960/1040px por tipo de tela — apagado. Tabelas e cards preenchem a tela.
          pb-[120px]: respiro para a barra de publicação (sticky). */}
      <main className="min-w-0 flex-1 px-6 pb-[120px] pt-8 2xl:px-8">
        <div className="max-w-[1600px]">{children}</div>
      </main>
    </div>
  );
}
