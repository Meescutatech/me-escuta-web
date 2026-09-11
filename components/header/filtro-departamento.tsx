"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import type { Departamento } from "@/lib/departamentos/escopo";
import { PARAM_DEPARTAMENTO } from "@/lib/departamentos/cookie";

/**
 * FILTRO DE DEPARTAMENTO (Diogo, 21:40 — item C): o seletor "Comercial ▾" com ícone saiu do
 * header. No lugar, um segmented control DISCRETO — sem ícone, sem destaque — que:
 *  · SOME para quem vê um departamento só (Sara, fono): não há o que escolher;
 *  · aparece só nas telas em que filtrar faz sentido (funil, conversas, dashboard), não como
 *    seletor global. Departamento é FILTRO, não workspace.
 * As opções são os departamentos "de trabalho" (os filhos de Comercial + os de nível 1 sem
 * filhos) e "Todos". A troca vai por `?departamento=` — o middleware grava o cookie e limpa a
 * URL (uma sede só, header e tela nunca discordam).
 */

/**
 * `/funil` NÃO está aqui de propósito: o board já tem o próprio segmented control na barra de
 * filtros (agente irmão, 22:15) — dois filtros na mesma tela seria pior que nenhum. Quando
 * conversas e dashboard ganharem o deles, esta lista esvazia e o header fica sem filtro nenhum.
 */
// `/` saiu em 10/09 22:50 (W-D4): o dashboard ganhou o próprio segmented na toolbar de filtros.
export const ROTAS_COM_FILTRO = ["/conversas"];

export function rotaTemFiltro(pathname: string): boolean {
  return ROTAS_COM_FILTRO.some((r) => (r === "/" ? pathname === "/" : pathname === r || pathname.startsWith(r + "/")));
}

/**
 * Os departamentos que viram opção: os de nível 2 (Pré-venda, Pós-venda — Cobrança entra dentro de
 * Pós-venda pelo escopo) e os de nível 1 sem filhos (Clínico, Marketing). "Comercial" não vira
 * opção: é o pai, e escolher o pai é escolher "Todos" do comercial — confunde mais do que ajuda.
 */
export function opcoesDoFiltro(visiveis: Departamento[]): Departamento[] {
  const temFilho = (chave: string) => visiveis.some((d) => d.pai === chave);
  return visiveis.filter((d) => d.ativo && (d.nivel === 2 || (d.nivel === 1 && !temFilho(d.chave))));
}

export function FiltroDepartamento({ departamentos, ativo }: { departamentos: Departamento[]; ativo: Departamento | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendente, iniciar] = useTransition();
  const opcoes = opcoesDoFiltro(departamentos);
  if (opcoes.length < 2) return null;

  const ir = (chave: string) =>
    iniciar(() => {
      router.push(`${pathname}?${PARAM_DEPARTAMENTO}=${chave}`);
      router.refresh();
    });

  const item = (chave: string, rotulo: string, marcado: boolean) => (
    <button
      key={chave}
      type="button"
      role="radio"
      aria-checked={marcado}
      onClick={() => !marcado && ir(chave)}
      className={cn(
        "rounded-[5px] px-2 py-[3px] text-[12.5px] transition-colors",
        marcado ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
        pendente && "opacity-60",
      )}
    >
      {rotulo}
    </button>
  );

  return (
    <div role="radiogroup" aria-label="Filtrar por departamento" className="inline-flex items-center gap-0.5 rounded-md border border-border p-0.5">
      {opcoes.map((d) => item(d.chave, d.rotulo, ativo?.chave === d.chave))}
      {item("todos", "Todos", ativo === null)}
    </div>
  );
}
