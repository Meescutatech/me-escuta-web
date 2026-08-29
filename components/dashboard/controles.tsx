"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PERIODOS, type Ator, type PeriodoDias } from "@/lib/dados/dashboard-ceo-calculos";
import { cn } from "@/lib/utils";

/**
 * Os dois controles da tela do CEO: periodo (7/30/90) e "ver como" (ator). Os dois vivem na URL
 * (`?periodo=30&ator=agente:clara`) — link compartilhavel, botao voltar funciona, e o servidor
 * relê tudo com a sessao/RLS certa. Nada de estado de cliente que o servidor nao veja.
 */

function montarHref(periodo: PeriodoDias, ator: string | null): string {
  const p = new URLSearchParams();
  p.set("periodo", String(periodo));
  if (ator) p.set("ator", ator);
  return `/?${p.toString()}`;
}

export function ControlesDashboard({
  periodo,
  atorFiltro,
  atores,
}: {
  periodo: PeriodoDias;
  atorFiltro: string | null;
  atores: Ator[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const ativos = atores.filter((a) => a.ativo);
  const agentes = ativos.filter((a) => a.tipo === "agente");
  const humanos = ativos.filter((a) => a.tipo === "humano");

  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", pendente && "opacity-70")}>
      <div
        role="group"
        aria-label="Período"
        className="flex items-center rounded-[8px] border border-linha bg-branco p-0.5"
      >
        {PERIODOS.map((p) => {
          const ativo = p === periodo;
          return (
            <Link
              key={p}
              href={montarHref(p, atorFiltro)}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "rounded-[6px] px-3 py-1 text-[12.5px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45",
                ativo ? "bg-tinta text-branco" : "text-suave hover:bg-hover hover:text-tinta",
              )}
            >
              {p} dias
            </Link>
          );
        })}
      </div>

      <label className="flex items-center gap-2 text-[12.5px] text-suave">
        <span>ver como</span>
        <select
          value={atorFiltro ?? ""}
          onChange={(e) => {
            const v = e.target.value || null;
            iniciar(() => router.push(montarHref(periodo, v)));
          }}
          className="h-[30px] rounded-[8px] border border-linha bg-branco px-2.5 text-[12.5px] font-medium text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45"
        >
          <option value="">Todos</option>
          {agentes.length > 0 && (
            <optgroup label="Agentes">
              {agentes.map((a) => (
                <option key={a.ator} value={a.ator}>
                  {a.nome}
                </option>
              ))}
            </optgroup>
          )}
          {humanos.length > 0 && (
            <optgroup label="Pessoas">
              {humanos.map((a) => (
                <option key={a.ator} value={a.ator}>
                  {a.nome}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
    </div>
  );
}
