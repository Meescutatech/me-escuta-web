"use client";

/**
 * O Diálogo do KIT, extraído para módulo próprio na integração `r18/integracao-web`.
 *
 * POR QUE ELE SAIU DO `kit.tsx`: é a ÚNICA peça do kit que usa hooks (`useRef`/`useEffect`). Com ele
 * lá dentro, o `kit.tsx` inteiro precisava ser Client Component — e o M5 passou a importar o kit de
 * `app/(app)/suporte/[numero]/page.tsx`, que é Server Component. O build quebrava com
 * "You're importing a component that needs useRef".
 *
 * A alternativa era marcar `kit.tsx` com "use client" e arrastar as outras DOZE peças (todas puras,
 * todas presentacionais) para o bundle do cliente junto. Sai mais barato mover uma peça do que
 * reclassificar doze — e o kit continua servindo Server Components, que é o que ele sempre foi.
 *
 * O `kit.tsx` reexporta este módulo, então nenhum import existente mudou de forma.
 *
 * As duas correções do parecer do Vitrine ME continuam aqui, e as duas são de ALCANCE, não de
 * estética:
 *
 *  C4 · a ação primária tem de receber clique em qualquer viewport. O caso medido foi "Registrar
 *       resposta" (F12) inalcançável abaixo de 768px — sem rolagem e sem Esc, o painel crescia
 *       além da tela e a linha de ações caía fora. Agora o painel tem teto de altura e rola por
 *       dentro; o rodapé de ações é sempre alcançável.
 *  C5 · `aria-modal` manda o leitor de tela ignorar tudo fora do diálogo. Sem mover o foco para
 *       dentro, quem usa teclado fica numa região que a tecnologia assistiva considera morta. O
 *       foco vai para a AÇÃO SEGURA ao abrir (a primeira focável é sempre Cancelar/Fechar), o Tab
 *       fica preso dentro, Esc fecha, e o foco volta ao gatilho ao sair.
 */

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

const FOCAVEIS =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialogo({
  titulo,
  children,
  acoes,
  largura = 440,
  aoFechar,
}: {
  titulo: ReactNode;
  children?: ReactNode;
  acoes: ReactNode;
  largura?: number;
  aoFechar: () => void;
}) {
  const painel = useRef<HTMLDivElement>(null);
  const gatilho = useRef<Element | null>(null);

  useEffect(() => {
    gatilho.current = document.activeElement;
    painel.current?.querySelector<HTMLElement>(FOCAVEIS)?.focus();
    return () => {
      if (gatilho.current instanceof HTMLElement) gatilho.current.focus();
    };
  }, []);

  function teclado(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      aoFechar();
      return;
    }
    if (e.key !== "Tab") return;
    const focaveis = painel.current?.querySelectorAll<HTMLElement>(FOCAVEIS);
    if (!focaveis || focaveis.length === 0) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(31,35,40,.28)] p-5"
      onKeyDown={teclado}
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: largura }}
        className="flex max-h-[calc(100vh-40px)] w-full flex-col overflow-y-auto rounded-[10px] bg-branco p-5 shadow-forte"
      >
        <h2 className="mb-1.5 flex-none text-[15px] font-semibold text-tinta">{titulo}</h2>
        {children}
        <div className="mt-4 flex flex-none items-center justify-end gap-2.5">{acoes}</div>
      </div>
    </div>
  );
}
