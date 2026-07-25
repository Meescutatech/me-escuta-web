"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/*
 * Sidebar de ícones (r9-tokens §6, aprovada 22/07) — substitui o menu de topo:
 *  - colapsada por padrão (60px, só ícones: logo-orelha, Visão geral/Funil/Conversas, avatar);
 *  - expande no hover em OVERLAY (216px, width 180ms ease-out + sombra) — o main tem margem
 *    FIXA de 60px, o conteúdo nunca pula;
 *  - rótulos/contadores em fade 120ms delay 50ms; wordmark desdobra por max-width em sincronia;
 *  - ativo = navy sobre #EAECF5; contador do Funil = total mono neutro; Conversas = não-lidas
 *    em chip laranja (colapsada vira ponto laranja 7px no ícone);
 *  - prefers-reduced-motion: transições desligadas (classe .lateral-r9 no globals.css).
 * /fila /jarvis /timeline seguem fora do menu — acessíveis só por URL, como já era.
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

const ICONES: Record<string, React.ReactNode> = {
  visao: (
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
  configuracoes: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
    </>
  ),
};

function iniciais(email: string): string {
  const nome = email.split("@")[0].replace(/[._-]/g, " ").trim();
  const partes = nome.split(/\s+/);
  const letras = partes.length >= 2 ? partes[0][0] + partes[1][0] : nome.slice(0, 2);
  return letras.toUpperCase();
}

export function Sidebar({
  email,
  contFunil,
  contNaoLidas,
  contVencidas,
}: {
  email: string;
  contFunil: number | null;
  contNaoLidas: number | null;
  /** tarefas VENCIDAS agora (R14) — a fila vermelha; null/0 = sem contador. */
  contVencidas: number | null;
}) {
  const pathname = usePathname();
  const itens = [
    { href: "/", rotulo: "Visão geral", icone: ICONES.visao, ativa: pathname === "/" },
    {
      href: "/funil",
      rotulo: "Funil",
      icone: ICONES.funil,
      ativa: pathname.startsWith("/funil"),
      cont: contFunil != null ? contFunil.toLocaleString("pt-BR") : null,
      laranja: false,
      vermelho: false,
    },
    {
      href: "/conversas",
      rotulo: "Conversas",
      icone: ICONES.conversas,
      ativa: pathname.startsWith("/conversas"),
      cont: contNaoLidas != null && contNaoLidas > 0 ? contNaoLidas.toLocaleString("pt-BR") : null,
      laranja: true,
      vermelho: false,
      ponto: contNaoLidas != null && contNaoLidas > 0,
    },
    {
      // contador SÓ de vencidas: no Kommo a fila vermelha tinha 755 itens e ninguém olhava;
      // aqui o número só aparece quando existe débito — e zero é silêncio, não "0".
      href: "/tarefas",
      rotulo: "Tarefas",
      icone: ICONES.tarefas,
      ativa: pathname.startsWith("/tarefas"),
      cont: contVencidas != null && contVencidas > 0 ? contVencidas.toLocaleString("pt-BR") : null,
      laranja: false,
      vermelho: true,
      ponto: contVencidas != null && contVencidas > 0,
    },
    {
      href: "/configuracoes",
      rotulo: "Configurações",
      icone: ICONES.configuracoes,
      ativa: pathname.startsWith("/configuracoes"),
    },
  ];

  return (
    <aside className="lateral-r9 group fixed bottom-0 left-0 top-0 z-50 flex w-[60px] flex-col gap-0.5 overflow-hidden whitespace-nowrap border-r border-linha bg-branco px-2.5 pb-3.5 pt-3 transition-[width] duration-[180ms] ease-out hover:w-[216px] hover:shadow-[8px_0_28px_rgba(31,35,40,.08)]">
      {/* logo: orelha sempre; wordmark desdobra por max-width em sincronia com a sidebar */}
      <Link href="/" aria-label="Me Escuta" className="mb-3 flex h-12 items-center px-0.5">
        <span className="flex max-w-0 flex-col items-end overflow-hidden pr-2 text-[14.5px] font-extrabold leading-[.9] tracking-[-0.02em] text-navy opacity-0 transition-[max-width,opacity] duration-[180ms,120ms] ease-out group-hover:max-w-[130px] group-hover:opacity-100 group-hover:delay-[0ms,50ms]">
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
            className={cn(
              "relative flex h-10 items-center gap-3 rounded-lg px-2 text-[13.5px] no-underline",
              it.ativa
                ? "bg-[#EAECF5] font-semibold text-navy"
                : "font-medium text-suave hover:bg-hover hover:text-tinta",
            )}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="ml-0.5 h-5 w-5 flex-none"
            >
              {it.icone}
            </svg>
            <span className="opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 group-hover:delay-[50ms]">
              {it.rotulo}
            </span>
            {it.cont && (
              <span
                className={cn(
                  "ml-auto rounded-full px-[7px] py-px font-mono text-[11px] opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 group-hover:delay-[50ms]",
                  it.vermelho
                    ? "bg-vermelho font-semibold text-branco"
                    : it.laranja
                      ? "bg-laranja font-semibold text-branco"
                      : "border border-linha bg-board text-suave",
                )}
              >
                {it.cont}
              </span>
            )}
            {/* colapsada: pendência vira ponto no canto do ícone (laranja = não-lida,
                vermelho = tarefa vencida); some na expansão */}
            {"ponto" in it && it.ponto && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-6 top-2 h-[7px] w-[7px] rounded-full border-[1.5px] border-branco transition-opacity duration-[120ms] group-hover:opacity-0",
                  it.vermelho ? "bg-vermelho" : "bg-laranja",
                )}
              />
            )}
          </Link>
        ))}
      </nav>

      {/* usuário + sair (embaixo) */}
      <div className="mt-auto flex items-center gap-2.5 px-[3px]">
        <span
          title={email}
          className="grid h-7 w-7 flex-none place-items-center rounded-full bg-navy text-[11.5px] font-semibold text-branco"
        >
          {iniciais(email)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-suave opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 group-hover:delay-[50ms]">
          {email.split("@")[0]}
        </span>
        <form action="/auth/signout" method="post" className="opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 group-hover:delay-[50ms]">
          <button
            type="submit"
            title="Sair"
            className="rounded-[6px] border border-linha bg-branco px-2 py-1 text-[11.5px] font-medium text-suave hover:bg-hover hover:text-tinta"
          >
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}
