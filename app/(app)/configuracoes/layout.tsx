"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Página de Configurações (mockup configuracoes-membros-v2.html, Rodada 10c):
 * sub-nav própria à esquerda em --fundo + conteúdo em branco separados por hairline.
 * SEM link "Voltar ao app" (removido a pedido do Diogo — a topbar já navega).
 * Membros deixou de ser a única seção viva (Clara e Templates chegaram depois),
 * então o item ativo vem da rota — não mais fixo.
 */
const ATIVO = "mb-px flex items-center gap-2 rounded-md bg-[#EAECF5] px-2 py-1.5 text-[13px] font-semibold text-navy";
const INERTE = "mb-px flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-suave hover:bg-hover hover:text-tinta";

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const rota = usePathname();
  const ativo = (href: string) => rota === href || rota.startsWith(href + "/");
  return (
    <div className="flex min-h-[calc(100vh-58px)] bg-branco">
      <nav aria-label="Configurações" className="w-[224px] flex-none border-r border-linha bg-board px-3 pb-6 pt-5">
        <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
          Configurações
        </div>
        <span
          aria-disabled="true"
          className="mb-px flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-mute"
          title="Em breve"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[15px] w-[15px] flex-none">
            <rect x="4" y="4" width="16" height="16" rx="3" />
            <path d="M4 9.5h16" />
          </svg>
          Área de trabalho
        </span>
        <Link
          href="/configuracoes/membros"
          aria-current={ativo("/configuracoes/membros") ? "page" : undefined}
          className={ativo("/configuracoes/membros") ? ATIVO : INERTE}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[15px] w-[15px] flex-none">
            <circle cx="9" cy="8.5" r="3.2" />
            <path d="M3.8 19c.6-3 2.7-4.6 5.2-4.6s4.6 1.6 5.2 4.6" />
            <circle cx="16.8" cy="9.5" r="2.4" />
            <path d="M15.4 14.6c2.6-.3 4.4 1.2 4.9 3.6" />
          </svg>
          Membros
        </Link>
        <Link
          href="/configuracoes/clara"
          aria-current={ativo("/configuracoes/clara") ? "page" : undefined}
          className={ativo("/configuracoes/clara") ? ATIVO : INERTE}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[15px] w-[15px] flex-none">
            <path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.5-4.4A7.5 7.5 0 1 1 20 11.5Z" />
            <path d="M9 10.5h6M9 13.2h3.6" />
          </svg>
          Clara
        </Link>
        <Link
          href="/configuracoes/templates"
          aria-current={ativo("/configuracoes/templates") ? "page" : undefined}
          className={ativo("/configuracoes/templates") ? ATIVO : INERTE}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[15px] w-[15px] flex-none">
            <path d="M8 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8" />
            <path d="M5 4v16" />
            <path d="M11 9h5M11 12.5h3.5" />
          </svg>
          Templates
        </Link>
        <span
          aria-disabled="true"
          className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-mute"
          title="Em breve"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[15px] w-[15px] flex-none">
            <path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
            <path d="M10 19a2.2 2.2 0 0 0 4 0" />
          </svg>
          Notificações
        </span>
      </nav>
      <main className="min-w-0 flex-1 px-12 pb-16 pt-11 max-md:px-5 max-md:pt-8">
        <div className="max-w-[720px]">{children}</div>
      </main>
    </div>
  );
}
