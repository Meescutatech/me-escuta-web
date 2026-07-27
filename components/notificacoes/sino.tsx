"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useProjecaoViva } from "@/components/projecao-viva";
import { INTERVALOS } from "@/lib/intervalos-vivos";
import { contarNaoLidas, maisRecentes, type Notificacao } from "@/lib/notificacoes";
import { marcarTodasLidas } from "@/app/(app)/notificacoes/actions";
import { ItemNotificacao } from "./item";

/**
 * SINO — canto superior direito, contador de não-lidas, popover com lista curta e ação de
 * expandir (D5). Contrato visual: Product_Management/Design/notificacoes-sino-v3.html,
 * estados (a) sino fechado e (b) popover aberto.
 *
 * O que o mockup deliberadamente NÃO tem, e aqui também não: agrupamento por remetente,
 * pilha de avatares, som/badge do SO, "ver tudo" duplicado, ícone por categoria, contador
 * virando "9+", animação de entrada.
 *
 * Tempo real: core.mencao e core.tarefa entraram na publication supabase_realtime (0038) —
 * a dica chega por postgres_changes e o refetch é o router.refresh() do useProjecaoViva
 * (a verdade continua sendo a releitura server-side). O polling de 30s é a rede de segurança.
 *
 * O app não tem barra de topo compartilhada (a navegação é a sidebar de ícones da R9): o sino
 * é fixo no topo direito, acima do conteúdo, na mesma altura de 52px da topbar do mockup.
 */
export function Sino({
  inicial,
  disponivel,
}: {
  inicial: Notificacao[];
  disponivel: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [agoraMs, setAgoraMs] = useState(0); // 0 = ainda não hidratou (evita mismatch SSR)
  const [pendente, iniciar] = useTransition();
  const caixa = useRef<HTMLDivElement>(null);

  useProjecaoViva(
    [
      { tabela: { schema: "core", table: "mencao" } },
      { tabela: { schema: "core", table: "tarefa" } },
    ],
    { intervaloMs: INTERVALOS.sino },
  );

  useEffect(() => setAgoraMs(Date.now()), [inicial]);

  // fecha no Esc e no clique fora — comportamento esperado de popover, não está no mockup
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    const aoClicar = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("mousedown", aoClicar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("mousedown", aoClicar);
    };
  }, [aberto]);

  const naoLidas = contarNaoLidas(inicial);
  const curtas = maisRecentes(inicial, 4, agoraMs || Date.now());

  return (
    <div ref={caixa} className="fixed right-4 top-2.5 z-40">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label={
          disponivel ? `Notificações: ${naoLidas} não lidas` : "Notificações indisponíveis"
        }
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-[6px] text-suave hover:bg-hover hover:text-tinta",
          aberto && "bg-hover text-tinta",
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
          className="h-[19px] w-[19px]"
        >
          <path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
          <path d="M10 19a2.2 2.2 0 0 0 4 0" />
        </svg>
        {/* contador só aparece quando há não-lidas; nunca vira "9+" */}
        {disponivel && naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-px min-w-[16px] rounded-full border-[1.5px] border-branco bg-laranja px-1 text-center font-mono text-[10px] font-semibold leading-4 tabular-nums text-branco">
            {naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Notificações"
          /* no estreito o popover encosta nas duas bordas (media query do mockup, ≤720px) */
          className="fixed inset-x-2 top-[46px] overflow-hidden rounded-[10px] border border-linha bg-branco shadow-[0_8px_28px_rgba(31,35,40,.12)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[36px] sm:w-[376px]"
        >
          <div className="flex items-center gap-2 border-b border-linha py-[10px] pl-3.5 pr-3">
            <h2 className="text-[13.5px] font-[650]">Notificações</h2>
            <span className="font-mono text-[11.5px] tabular-nums text-suave">
              {naoLidas} não lidas
            </span>
            <span className="ml-auto flex items-center">
              <Link
                href="/notificacoes"
                onClick={() => setAberto(false)}
                title="Expandir"
                aria-label="Expandir notificações"
                className="flex h-[26px] w-[26px] items-center justify-center rounded-[6px] text-suave hover:bg-hover hover:text-tinta"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="h-[15px] w-[15px]"
                >
                  <path d="M9 4.5H4.5V9M15 19.5h4.5V15M19.5 9V4.5H15M4.5 15v4.5H9" />
                </svg>
              </Link>
            </span>
          </div>

          {curtas.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-[12.5px] text-suave">
              {disponivel
                ? "Nada por aqui. Menções e tarefas suas aparecem neste sino."
                : "Não foi possível carregar as notificações agora."}
            </p>
          ) : (
            curtas.map((n) => <ItemNotificacao key={n.id} n={n} agoraMs={agoraMs || Date.now()} />)
          )}

          <div className="flex items-center border-t border-linha p-2 px-2.5">
            <button
              type="button"
              disabled={pendente || naoLidas === 0}
              onClick={() => iniciar(() => void marcarTodasLidas())}
              className="rounded-[6px] px-2 py-[5px] text-[12.5px] font-medium text-suave hover:bg-hover hover:text-tinta disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Marcar todas como lidas
            </button>
            <Link
              href="/notificacoes"
              onClick={() => setAberto(false)}
              className="ml-auto rounded-[6px] px-2 py-[5px] text-[12.5px] font-medium text-suave no-underline hover:bg-hover hover:text-tinta"
            >
              Ver todas
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
