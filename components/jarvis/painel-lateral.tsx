"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ConversaJarvis } from "@/components/jarvis/conversa";
import { interpretarContexto, type PapelUsuario } from "@/lib/jarvis/contrato";

/**
 * PAINEL LATERAL DO JARVIS (F9) — a superfície que o header abre NO LUGAR de navegar.
 *
 * Contrato para quem ligar o gatilho (o slot `data-slot="jarvis"` do header, F4): renderize
 * `<PainelLateralJarvis aberto onFechar usuarioId papel />`. O contexto da tela é lido AQUI, do
 * `usePathname()` + `useSearchParams()` do momento em que abriu — o mesmo `pathname+search` que a
 * página `/jarvis` recebe por `?contexto=`. O header não precisa montar nada.
 *
 * Acessível como diálogo: foco entra no painel ao abrir, Esc fecha, foco volta ao gatilho ao
 * fechar, fundo inerte por `aria-modal`. Sem portal para manter o CSS do app (z-50 acima do header
 * e da sidebar, que são z-40/z-50 — o painel fica à direita, longe da sidebar).
 */
export function PainelLateralJarvis({
  aberto,
  onFechar,
  usuarioId,
  papel,
}: {
  aberto: boolean;
  onFechar: () => void;
  usuarioId: string;
  papel: PapelUsuario;
}) {
  const pathname = usePathname();
  const busca = useSearchParams();
  const caixa = useRef<HTMLDivElement>(null);
  const gatilho = useRef<Element | null>(null);

  useEffect(() => {
    if (!aberto) return;
    gatilho.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const g = gatilho.current as HTMLElement | null;
      g?.focus?.();
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const q = busca.toString();
  const contexto = interpretarContexto(`${pathname}${q ? `?${q}` : ""}`);

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        aria-label="Fechar o Jarvis"
        onClick={onFechar}
        className="absolute inset-0 bg-tinta/20"
      />
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label="Jarvis"
        className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col border-l border-linha bg-branco shadow-[0_8px_28px_rgba(31,35,40,.16)]"
      >
        <div className="flex h-[var(--altura-topo)] flex-none items-center gap-2 border-b border-linha px-4">
          <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-navy text-[11px] font-bold text-branco">
            J
          </span>
          <h2 className="text-[14px] font-[650] text-tinta">Jarvis</h2>
          <a
            href={`/jarvis?contexto=${encodeURIComponent(`${pathname}${q ? `?${q}` : ""}`)}`}
            className="ml-auto rounded px-1.5 py-0.5 text-[12px] text-suave outline-none hover:bg-hover hover:text-tinta focus-visible:ring-2 focus-visible:ring-laranja"
          >
            Abrir em tela cheia
          </a>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="grid h-8 w-8 place-items-center rounded-md text-suave outline-none hover:bg-hover hover:text-tinta focus-visible:ring-2 focus-visible:ring-laranja"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <ConversaJarvis usuarioId={usuarioId} papel={papel} contextoInicial={contexto} compacto />
        </div>
      </div>
    </div>
  );
}
