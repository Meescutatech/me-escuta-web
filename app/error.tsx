"use client";

import { useEffect } from "react";
import { Marca } from "@/components/ui/marca";
import { carimboBuild } from "@/components/ui/marca-build";

/**
 * Erro de renderizacao dentro do shell — o boundary de rota do App Router.
 *
 * Aparece quando uma tela estoura (consulta que falhou, dado em formato inesperado). O `reset()` do
 * Next re-renderiza o segmento sem recarregar a pagina, entao "Tentar de novo" e barato e resolve a
 * maioria dos casos transitorios — e por isso e a acao PRIMARIA aqui.
 *
 * O `digest` e o unico fio que liga esta tela ao log do servidor. Se ele nao aparecer para quem
 * usou, o relato vira "deu erro" e ninguem acha nada. Ele fica visivel, em mono, selecionavel.
 */
export default function ErroDeRota({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sem servico de telemetria ainda (22/08): o console e o unico destino honesto. Quando houver,
    // e aqui que entra — este efeito e o gancho.
    console.error("[erro-de-rota]", error);
  }, [error]);

  return (
    <main className="grid min-h-[70vh] place-items-center bg-board px-4 py-10">
      <div className="w-full max-w-[440px]">
        <div className="rounded-[10px] border border-linha bg-branco p-8">
          <Marca className="mb-6" />

          <h1 className="text-[20px] font-[650] tracking-[-0.01em] text-tinta">
            Esta tela não carregou
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-suave">
            O erro foi registrado. Tentar de novo costuma resolver; se repetir, mande o código
            abaixo junto com o que você estava fazendo.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center rounded-md bg-laranja px-4 py-2 text-sm font-semibold text-branco outline-none transition-colors hover:bg-laranja-esc focus-visible:ring-2 focus-visible:ring-laranja focus-visible:ring-offset-2"
            >
              Tentar de novo
            </button>
            <a
              href="/funil"
              className="inline-flex items-center rounded-md border-[1.5px] border-linha-forte bg-branco px-4 py-2 text-sm font-semibold text-suave outline-none transition-colors hover:bg-hover hover:text-navy focus-visible:ring-2 focus-visible:ring-laranja focus-visible:ring-offset-2"
            >
              Ir para o funil
            </a>
          </div>

          <dl className="mt-6 space-y-1 border-t border-linha pt-4 font-mono text-[11px] text-mute">
            <div className="flex gap-2">
              <dt className="shrink-0">código</dt>
              <dd className="text-suave">{error.digest ?? "sem código"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0">build</dt>
              <dd className="text-suave">{carimboBuild}</dd>
            </div>
          </dl>
        </div>
      </div>
    </main>
  );
}
