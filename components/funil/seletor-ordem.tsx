"use client";

import { useEffect, useRef, useState } from "react";
import { ORDENS, type ChaveOrdem } from "@/lib/dados/funil-ordenacao";
import { cn } from "@/lib/utils";

/*
 * ORDENAÇÃO DA COLUNA — workshop 12/08: "quem ela está há mais tempo sem responder, quem está há
 * mais tempo sem interação". Hoje a coluna sai na ordem em que a leitura devolveu, que não é
 * ordem nenhuma; a pergunta que ela faz olhando o board não tem resposta no board.
 *
 * Fica ao lado dos filtros porque é a mesma família de gesto (recortar e ordenar o que se vê), e
 * mostra o rótulo escolhido no próprio botão — ordenação escondida atrás de um ícone é ordenação
 * que ninguém sabe que está ligada.
 */
export function SeletorOrdem({
  ordem,
  onChange,
}: {
  ordem: ChaveOrdem;
  onChange: (o: ChaveOrdem) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  const atual = ORDENS.find((o) => o.chave === ordem) ?? ORDENS[0];

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (!caixaRef.current?.contains(e.target as Node)) setAberto(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={caixaRef} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className="flex items-center gap-1.5 rounded-[6px] border border-linha bg-branco px-2.5 py-1.5 text-[12.5px] text-suave transition-colors hover:border-linha-forte"
      >
        <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 stroke-mute" fill="none">
          <path d="M3 6h13M3 12h9M3 18h5" />
          <path d="M18 9v11m0 0 3-3m-3 3-3-3" />
        </svg>
        <span className="font-medium text-tinta">{atual.rotulo}</span>
        <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={cn("h-3 w-3 stroke-mute transition-transform", aberto && "rotate-180")} fill="none">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-40 w-[268px] overflow-hidden rounded-[10px] border border-linha bg-branco shadow-[0_10px_34px_rgba(37,47,99,.16)]"
        >
          <div className="border-b border-linha px-3.5 py-2 text-[11.5px] font-semibold text-mute">
            Ordenar cada coluna por
          </div>
          {ORDENS.map((o) => (
            <button
              key={o.chave}
              role="menuitemradio"
              aria-checked={o.chave === ordem}
              onClick={() => {
                onChange(o.chave);
                setAberto(false);
              }}
              className={cn(
                "flex w-full items-start gap-2 px-3.5 py-2 text-left transition-colors hover:bg-hover",
                o.chave === ordem && "bg-laranja-cl/60",
              )}
            >
              <span className="mt-[3px] w-3 shrink-0">
                {o.chave === ordem && (
                  <svg viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 stroke-laranja-esc" fill="none">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-tinta">{o.rotulo}</span>
                <span className="block text-[11.5px] leading-snug text-mute">{o.ajuda}</span>
              </span>
            </button>
          ))}
          <p className="border-t border-linha bg-board px-3.5 py-2 text-[11px] leading-snug text-mute">
            A faixa colorida na esquerda do card é o prazo: vermelho estourado, âmbar perto de
            estourar, verde dentro.
          </p>
        </div>
      )}
    </div>
  );
}
