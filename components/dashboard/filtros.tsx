"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LayoutDashboardIcon, SearchIcon, TableIcon } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERIODOS, type Ator, type Janela, type PeriodoDias } from "@/lib/dados/dashboard-ceo-calculos";
import { DEPARTAMENTOS_FILTRO, montarHref, type Aba, type DepartamentoFiltro, type Vista } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";

/**
 * A linha de filtros do dashboard (v2): busca · ver como · período (7/30/90 + livre) · departamento
 * · Tabela | Dashboard. Tudo na URL — link compartilhável, o servidor relê com a sessão certa.
 *
 * Desenho do painel de referência: lupa no campo de busca, seletores de 30px (o `Select` de
 * components/ui — nenhum `<select>` nativo, regra do Diogo 22:40), segmented de texto para o
 * departamento e o toggle Tabela | Dashboard à direita. Nada colorido: o ativo é fundo escuro.
 */

const campo = "h-[30px] rounded-md border border-border bg-card px-2.5 text-[12.5px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const gatilho = "h-[30px] rounded-md border-border bg-card px-2.5 text-[12.5px] font-medium";

const TODOS = "__todos__";
const LIVRE = "livre";

export function Filtros({
  periodo,
  janela,
  livre,
  atorFiltro,
  atores,
  aba,
  departamento,
  vista,
  busca,
  mostrarDepartamento,
}: {
  periodo: PeriodoDias;
  janela: Janela;
  /** true quando a janela veio de `?de=&ate=` */
  livre: boolean;
  atorFiltro: string | null;
  atores: Ator[];
  aba: Aba;
  departamento: DepartamentoFiltro;
  vista: Vista;
  busca: string;
  mostrarDepartamento: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [q, setQ] = useState(busca);
  const [modoLivre, setModoLivre] = useState(livre);
  const [de, setDe] = useState(livre ? janela.inicio : "");
  const [ate, setAte] = useState(livre ? janela.fim : "");
  const base = { periodo, ator: atorFiltro, aba, departamento, vista, q: busca };
  const ativos = atores.filter((a) => a.ativo);
  const agentes = ativos.filter((a) => a.tipo === "agente");
  const humanos = ativos.filter((a) => a.tipo === "humano");

  const ir = (href: string) => iniciar(() => router.push(href));
  const comLivre = (href: string) => (livre && de && ate ? `${href}&de=${de}&ate=${ate}` : href);

  const itensAtor = [{ value: TODOS, label: "Ver como: todos" }, ...ativos.map((a) => ({ value: a.ator, label: a.nome }))];
  const itensPeriodo = [...PERIODOS.map((p) => ({ value: String(p), label: `Últimos ${p} dias` })), { value: LIVRE, label: "Período personalizado" }];

  return (
    <div className={cn("flex flex-wrap items-center gap-2", pendente && "opacity-70")}>
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          ir(comLivre(montarHref({ ...base, q: q.trim() })));
        }}
      >
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pessoa, número ou etapa…" aria-label="Buscar" className={cn(campo, "w-[230px] pl-8")} />
      </form>

      <Select items={itensAtor} value={atorFiltro ?? TODOS} onValueChange={(v) => ir(comLivre(montarHref({ ...base, ator: v === TODOS || v == null ? null : String(v) })))}>
        <SelectTrigger aria-label="Ver como" className={gatilho}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Ver como: todos</SelectItem>
          {agentes.length > 0 && (
            <SelectGroup>
              <SelectLabel>Agentes</SelectLabel>
              {agentes.map((a) => (
                <SelectItem key={a.ator} value={a.ator}>{a.nome}</SelectItem>
              ))}
            </SelectGroup>
          )}
          {humanos.length > 0 && (
            <SelectGroup>
              <SelectLabel>Pessoas</SelectLabel>
              {humanos.map((a) => (
                <SelectItem key={a.ator} value={a.ator}>{a.nome}</SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>

      <Select
        items={itensPeriodo}
        value={modoLivre ? LIVRE : String(periodo)}
        onValueChange={(v) => {
          if (v === LIVRE) {
            setModoLivre(true);
            return;
          }
          setModoLivre(false);
          ir(montarHref({ ...base, periodo: Number(v) as PeriodoDias }));
        }}
      >
        <SelectTrigger aria-label="Período" className={gatilho}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {itensPeriodo.map((p) => (
            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {modoLivre && (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (de && ate) ir(`${montarHref(base)}&de=${de}&ate=${ate}`);
          }}
        >
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="De" className={cn(campo, "w-[130px] px-2")} />
          <span className="text-[11px] text-muted-foreground">a</span>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" className={cn(campo, "w-[130px] px-2")} />
          <button type="submit" className="inline-flex h-[30px] items-center rounded-md border border-border bg-card px-2.5 text-[12.5px] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            Aplicar
          </button>
        </form>
      )}

      {mostrarDepartamento && (
        <nav aria-label="Departamento" className="ml-1 flex items-center text-[12.5px]">
          {DEPARTAMENTOS_FILTRO.map((d, i) => (
            <span key={d.rotulo} className="flex items-center">
              {i > 0 && <span aria-hidden className="mx-1.5 text-border">·</span>}
              <Link
                href={comLivre(montarHref({ ...base, departamento: d.chave }))}
                aria-current={d.chave === departamento ? "page" : undefined}
                className={cn("rounded-sm px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", d.chave === departamento ? "font-semibold text-foreground underline decoration-foreground/40 underline-offset-[5px]" : "text-muted-foreground hover:text-foreground")}
              >
                {d.rotulo}
              </Link>
            </span>
          ))}
        </nav>
      )}

      <div role="group" aria-label="Vista" className="ml-auto flex items-center overflow-hidden rounded-md border border-border">
        {(
          [
            ["tabela", "Tabela", TableIcon],
            ["dashboard", "Dashboard", LayoutDashboardIcon],
          ] as const
        ).map(([v, rotulo, Icone], i) => (
          <Link
            key={v}
            href={comLivre(montarHref({ ...base, vista: v }))}
            aria-current={vista === v ? "page" : undefined}
            className={cn(
              "inline-flex h-[28px] items-center gap-1.5 px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              i > 0 && "border-l border-border",
              vista === v ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <Icone className="size-3.5" aria-hidden />
            {rotulo}
          </Link>
        ))}
      </div>
    </div>
  );
}
