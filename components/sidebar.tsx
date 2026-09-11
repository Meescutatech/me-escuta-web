"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconeJarvis } from "@/components/header/icone-jarvis";
import { itensSidebar, ROTA_SIGNOUT, type ItemSidebar } from "@/lib/header/navegacao";
import { rotuloPapel, type Papel } from "@/lib/membros";

/*
 * Sidebar de ícones (r9-tokens §6, aprovada 22/07) — substitui o menu de topo:
 *  - colapsada por padrão (60px, só ícones: logo-orelha e os destinos);
 *  - expande no hover em OVERLAY (216px, width 180ms ease-out + sombra) — o main tem margem
 *    FIXA de 60px, o conteúdo nunca pula;
 *  - rótulos/contadores em fade 120ms delay 50ms; wordmark desdobra por max-width em sincronia;
 *  - ativo = navy sobre #EAECF5; contador do Funil = total mono neutro; Conversas = não-lidas
 *    em chip laranja (colapsada vira ponto laranja 7px no ícone);
 *  - `focus-within` ABRE a barra pelos mesmos 216px do hover (W3, 22/08) e cada link tem anel;
 *  - prefers-reduced-motion: transições desligadas (classe .lateral-r9 no globals.css).
 *
 * F4 (27/08): A LISTA VEM DE `lib/header/navegacao.ts` — é lá que está escrito o que entra e o
 * que saiu (Jarvis acima de Dashboard; Fila, Configurações e Relatar problema fora do menu).
 * A sidebar responde "para onde eu vou"; identidade e Sair são header (menu do avatar), e por
 * isso o rodapé "admin · Sair" deixou de existir aqui.
 */

/** Orelha do logo — SVG canônico do r9-tokens §5 (copiar como está). */
function Orelha({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 100"
      fill="none"
      stroke="#EC662E"
      strokeWidth={9}
      strokeLinecap="round"
      aria-hidden
      className={className}
    >
      <path d="M12 62 C4 48 6 28 20 16 C34 5 56 5 67 17 C76 26 78 40 71 50 C66 58 58 61 54 68 C50 75 50 82 44 87 C37 93 27 90 24 83" />
      <path d="M34 48 C31 38 37 28 47 28 C56 28 61 36 58 43 C56 49 49 50 45 46" />
      <path d="M84 14 C92 23 92 37 85 46" />
    </svg>
  );
}

const ICONES: Record<Exclude<ItemSidebar["icone"], "jarvis">, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  funil: (
    <>
      <rect x="3.5" y="4" width="4.8" height="16" rx="1.4" />
      <rect x="9.8" y="4" width="4.8" height="11" rx="1.4" />
      <rect x="16.1" y="4" width="4.8" height="7" rx="1.4" />
    </>
  ),
  conversas: (
    <path d="M20 11.5c0 3.6-3.6 6.5-8 6.5-1 0-2-.15-2.9-.43L4.5 19l1.1-3.1C4.6 14.7 4 13.2 4 11.5 4 7.9 7.6 5 12 5s8 2.9 8 6.5z" />
  ),
  tarefas: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="m8.5 12.5 2.5 2.5 5-5.5" />
    </>
  ),
  marketing: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
    </>
  ),
};

function Icone({ nome, className }: { nome: ItemSidebar["icone"]; className: string }) {
  if (nome === "jarvis") return <IconeJarvis className={className} />;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {ICONES[nome]}
    </svg>
  );
}

/**
 * W-D2 (10/09, pedido do Diogo 21:30) · O PERFIL DESCE DO HEADER PARA O RODAPÉ DA SIDEBAR.
 * Padrão LiderHub `sidebar.tsx` / Twenty: avatar + nome + papel embaixo da navegação, e logo acima
 * um item com engrenagem "Configurações". O header fica só com o que é da TELA (Jarvis, relatar,
 * sino). O menu do avatar (e-mail + Sair) continua existindo — abre para cima.
 */
export interface PerfilSidebar {
  nome: string | null;
  email: string;
  papel: Papel | null;
}

export function Sidebar({
  contFunil,
  contNaoLidas,
  contVencidas,
  verMarketing = false,
  perfil = null,
}: {
  contFunil: number | null;
  contNaoLidas: number | null;
  /** tarefas VENCIDAS agora (R14) — a fila vermelha; null/0 = sem contador. */
  contVencidas: number | null;
  /**
   * T7 (RF-12) — o item de Marketing só aparece para marketing/admin/owner.
   * Isto é ORGANIZAÇÃO, não controle de acesso: a rota recusa e a RLS da `0251` defende o dado.
   */
  verMarketing?: boolean;
  /** quem está logado — rodapé da sidebar. `null` = rodapé não renderiza (compatibilidade). */
  perfil?: PerfilSidebar | null;
}) {
  const pathname = usePathname();
  const itens = itensSidebar({ pathname, contFunil, contNaoLidas, contVencidas, verMarketing });
  const emConfig = pathname.startsWith("/configuracoes");

  return (
    <aside className="lateral-r9 group fixed bottom-0 left-0 top-0 z-50 flex w-[60px] flex-col gap-0.5 overflow-hidden whitespace-nowrap border-r border-linha bg-branco px-2.5 pb-3.5 pt-3 transition-[width] duration-[180ms] ease-out hover:w-[216px] focus-within:w-[216px] hover:shadow-[8px_0_28px_rgba(31,35,40,.08)] focus-within:shadow-[8px_0_28px_rgba(31,35,40,.08)]">
      {/* logo: orelha sempre; wordmark desdobra por max-width em sincronia com a sidebar */}
      <Link href="/" aria-label="Me Escuta" className="mb-3 flex h-12 items-center rounded-lg px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45">
        <span className="flex max-w-0 flex-col items-end overflow-hidden pr-2 text-[14.5px] font-extrabold leading-[.9] tracking-[-0.02em] text-navy opacity-0 transition-[max-width,opacity] duration-[180ms,120ms] ease-out group-hover:max-w-[130px] group-hover:opacity-100 group-hover:delay-[0ms,50ms] group-focus-within:max-w-[130px] group-focus-within:opacity-100">
          <span>me</span>
          <span>escuta</span>
        </span>
        <Orelha className="ml-px h-[34px] w-8 flex-none" />
      </Link>

      <nav className="flex flex-col gap-0.5" aria-label="Navegação principal">
        {itens.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            aria-current={it.ativa ? "page" : undefined}
            className={cn(
              "relative flex h-10 items-center gap-3 rounded-lg px-2 text-[13.5px] no-underline",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45",
              it.ativa
                ? "bg-[#EAECF5] font-semibold text-navy"
                : "font-medium text-suave hover:bg-hover hover:text-tinta",
            )}
          >
            <Icone nome={it.icone} className="ml-0.5 h-5 w-5 flex-none" />
            <span className="opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 group-hover:delay-[50ms] group-focus-within:opacity-100">
              {it.rotulo}
            </span>
            {it.cont && (
              <span
                className={cn(
                  "ml-auto rounded-full px-[7px] py-px font-mono text-[11px] opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 group-hover:delay-[50ms] group-focus-within:opacity-100",
                  it.tom === "vermelho"
                    ? "bg-vermelho font-semibold text-branco"
                    : it.tom === "laranja"
                      ? "bg-laranja font-semibold text-branco"
                      : "border border-linha bg-board text-suave",
                )}
              >
                {it.cont}
              </span>
            )}
            {/* colapsada: pendência vira ponto no canto do ícone (laranja = não-lida,
                vermelho = tarefa vencida); some na expansão */}
            {it.ponto && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-6 top-2 h-[7px] w-[7px] rounded-full border-[1.5px] border-branco transition-opacity duration-[120ms] group-hover:opacity-0 group-focus-within:opacity-0",
                  it.tom === "vermelho" ? "bg-vermelho" : "bg-laranja",
                )}
              />
            )}
          </Link>
        ))}
      </nav>

      {perfil && (
        <div className="mt-auto flex flex-col gap-0.5 border-t border-linha pt-2">
          <Link
            href="/configuracoes"
            aria-current={emConfig ? "page" : undefined}
            className={cn(
              "relative flex h-10 items-center gap-3 rounded-lg px-2 text-[13.5px] no-underline",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45",
              emConfig ? "bg-[#EAECF5] font-semibold text-navy" : "font-medium text-suave hover:bg-hover hover:text-tinta",
            )}
          >
            <SettingsIcon strokeWidth={1.8} aria-hidden className="ml-0.5 h-5 w-5 flex-none" />
            <span className="opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 group-hover:delay-[50ms] group-focus-within:opacity-100">
              Configurações
            </span>
          </Link>
          <PerfilRodape perfil={perfil} />
        </div>
      )}
    </aside>
  );
}

function iniciais(quem: string): string {
  const base = quem.includes("@") ? quem.split("@")[0] : quem;
  const nome = base.replace(/[._-]/g, " ").trim();
  const partes = nome.split(/\s+/);
  const letras = partes.length >= 2 ? partes[0][0] + partes[partes.length - 1][0] : nome.slice(0, 2);
  return letras.toUpperCase();
}

/** Avatar + nome + papel; clique abre o menu da conta (e-mail + Sair) para CIMA. */
function PerfilRodape({ perfil }: { perfil: PerfilSidebar }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);
  const nome = perfil.nome ?? perfil.email.split("@")[0];
  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Sua conta: ${nome}`}
        className="flex h-11 w-full items-center gap-3 rounded-lg px-1.5 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45"
      >
        <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-navy text-[11px] font-bold text-branco">
          {iniciais(nome)}
        </span>
        <span className="min-w-0 opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 group-hover:delay-[50ms] group-focus-within:opacity-100">
          <span className="block truncate text-[13px] font-semibold text-tinta">{nome}</span>
          <span className="block truncate text-[11px] text-suave">{perfil.papel ? rotuloPapel(perfil.papel) : "—"}</span>
        </span>
      </button>
      {aberto && (
        <div
          role="menu"
          aria-label="Sua conta"
          className="absolute bottom-[calc(100%+6px)] left-0 z-50 w-[220px] overflow-hidden rounded-[10px] border border-linha bg-branco shadow-[0_4px_16px_rgba(31,35,40,.10)]"
        >
          <div className="border-b border-linha px-3 py-2.5">
            <p className="truncate text-[13px] font-semibold text-tinta">{nome}</p>
            <p className="truncate text-[12px] text-suave">{perfil.email}</p>
          </div>
          <div className="p-1.5">
            <form action={ROTA_SIGNOUT} method="post">
              <button type="submit" role="menuitem" className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-tinta hover:bg-hover">
                Sair
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
