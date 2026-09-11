"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PERIODOS, type Ator, type PeriodoDias } from "@/lib/dados/dashboard-ceo-calculos";
import { DEPARTAMENTOS_FILTRO, montarHref, type Aba, type DepartamentoFiltro } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";

/**
 * Os controles do dashboard do dono: período (7/30/90), departamento (Pré-venda · Pós-venda ·
 * Todos — só admin/owner) e "ver como" (ator). Os três vivem na URL (`?periodo=30&dep=pre_venda
 * &ator=agente:clara`) junto com a aba — link compartilhável, botão voltar funciona, e o servidor
 * relê tudo com a sessão/RLS certa. Nada de estado de cliente que o servidor não veja.
 *
 * O seletor de departamento é um segmented control de TEXTO, sem ícone e sem fundo — é o recorte
 * mais usado e o menos "controle" dos três: lê como parte do título.
 */

export function ControlesDashboard({
  periodo,
  atorFiltro,
  atores,
  aba,
  departamento,
  mostrarDepartamento,
}: {
  periodo: PeriodoDias;
  atorFiltro: string | null;
  atores: Ator[];
  aba: Aba;
  departamento: DepartamentoFiltro;
  mostrarDepartamento: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const ativos = atores.filter((a) => a.ativo);
  const agentes = ativos.filter((a) => a.tipo === "agente");
  const humanos = ativos.filter((a) => a.tipo === "humano");
  const foco = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", pendente && "opacity-70")}>
      <div role="group" aria-label="Período" className="flex items-center rounded-lg bg-muted p-[3px]">
        {PERIODOS.map((p) => {
          const ativo = p === periodo;
          return (
            <Link
              key={p}
              href={montarHref({ periodo: p, ator: atorFiltro, aba, departamento })}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1 text-ui-12 font-medium tabular-nums transition-colors",
                foco,
                ativo ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p} dias
            </Link>
          );
        })}
      </div>

      {mostrarDepartamento && (
        <nav aria-label="Departamento" className="flex items-center gap-0.5 text-ui-13">
          {DEPARTAMENTOS_FILTRO.map((d, i) => {
            const ativo = d.chave === departamento;
            return (
              <span key={d.rotulo} className="flex items-center">
                {i > 0 && <span aria-hidden className="mx-1.5 text-muted-foreground/50">·</span>}
                <Link
                  href={montarHref({ periodo, ator: atorFiltro, aba, departamento: d.chave })}
                  aria-current={ativo ? "page" : undefined}
                  className={cn(
                    "rounded-sm px-0.5 transition-colors",
                    foco,
                    ativo ? "font-semibold text-foreground underline decoration-foreground/40 underline-offset-[6px]" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {d.rotulo}
                </Link>
              </span>
            );
          })}
        </nav>
      )}

      <label className="flex items-center gap-2 text-ui-12 text-muted-foreground">
        <span>ver como</span>
        <select
          value={atorFiltro ?? ""}
          onChange={(e) => {
            const v = e.target.value || null;
            iniciar(() => router.push(montarHref({ periodo, ator: v, aba, departamento })));
          }}
          className={cn("h-7 rounded-md border border-border bg-card px-2 text-ui-12 font-medium text-foreground", foco)}
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
