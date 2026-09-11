"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarIcon, CheckIcon, ChevronDownIcon, LayoutDashboardIcon, SearchIcon, TableIcon, XIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PERIODOS, type Ator, type Janela } from "@/lib/dados/dashboard-ceo-calculos";
import { DEPARTAMENTOS_FILTRO, montarHref, type EstadoUrl, type FiltrosDashboard } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";
import { ddmm } from "./pecas";

/**
 * A toolbar do dashboard (v3) — uma linha densa, 30px de altura, tudo na URL.
 *
 *   busca · Período (popover: presets + livre + comparar) · Pessoa · Número · Etapa · Origem · Cidade
 *   (multi, popover com caixas) · Departamento (segmented pequeno) · Tabela | Dashboard
 *
 * Referência: a toolbar do painel que o Diogo aprovou (refs/21st-advanced-stats.md §2) e as de
 * Stripe / Linear Insights / Vercel Analytics: controles baixos, rótulo + valor no próprio botão,
 * filtro ativo com fundo escuro, chips removíveis logo abaixo (em `chips.tsx`). Nenhum `<select>`
 * nativo; nenhuma cor além do preto do ativo.
 */

const botao = "inline-flex h-[30px] items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[popup-open]:bg-muted";
const ativo = "border-foreground bg-foreground text-background hover:bg-foreground";

function Multi({
  rotulo,
  opcoes,
  selecionados,
  onChange,
}: {
  rotulo: string;
  opcoes: Array<{ valor: string; rotulo: string; grupo?: string }>;
  selecionados: string[];
  onChange: (v: string[]) => void;
}) {
  const n = selecionados.length;
  const grupos = [...new Set(opcoes.map((o) => o.grupo ?? ""))];
  return (
    <Popover>
      <PopoverTrigger className={cn(botao, n > 0 && ativo)} disabled={opcoes.length === 0} title={opcoes.length === 0 ? "sem opções nesta leitura" : undefined}>
        {rotulo}
        {n > 0 ? <span className="rounded bg-background/20 px-1 text-[11px] tabular-nums">{n}</span> : null}
        <ChevronDownIcon className="size-3.5 opacity-60" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {grupos.map((g) => (
          <div key={g}>
            {g ? <p className="px-2 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</p> : null}
            {opcoes
              .filter((o) => (o.grupo ?? "") === g)
              .map((o) => {
                const marcado = selecionados.includes(o.valor);
                return (
                  <label key={o.valor} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-muted">
                    <Checkbox checked={marcado} onCheckedChange={(c) => onChange(c ? [...selecionados, o.valor] : selecionados.filter((x) => x !== o.valor))} />
                    <span className="truncate">{o.rotulo}</span>
                  </label>
                );
              })}
          </div>
        ))}
        {n > 0 ? (
          <button type="button" onClick={() => onChange([])} className="mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground">
            <XIcon className="size-3" aria-hidden /> Limpar
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function Toolbar({
  estado,
  janela,
  livre,
  atores,
  opcoes,
  mostrarDepartamento,
}: {
  estado: EstadoUrl;
  janela: Janela;
  livre: boolean;
  atores: Ator[];
  opcoes: { numeros: Array<{ id: string; rotulo: string }>; etapas: Array<{ chave: string; nome: string }>; origens: Array<{ chave: string; rotulo: string }>; cidades: string[] };
  mostrarDepartamento: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [q, setQ] = useState(estado.filtros.q);
  const [de, setDe] = useState(livre ? janela.inicio : "");
  const [ate, setAte] = useState(livre ? janela.fim : "");
  const f = estado.filtros;
  const ir = (href: string) => iniciar(() => router.push(href));
  const setFiltros = (mud: Partial<FiltrosDashboard>) => ir(montarHref(estado, { filtros: mud }));

  const hoje = janela.fim;
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const rotuloPeriodo = livre ? `${ddmm(janela.inicio)} – ${ddmm(janela.fim)}` : `Últimos ${estado.periodo} dias`;
  const ativos = atores.filter((a) => a.ativo);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", pendente && "opacity-70")}>
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          setFiltros({ q: q.trim() });
        }}
      >
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar…"
          aria-label="Buscar"
          className="h-[30px] w-[170px] rounded-md border border-border bg-card pl-8 pr-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </form>

      <Popover>
        <PopoverTrigger className={cn(botao, livre && ativo)}>
          <CalendarIcon className="size-3.5 opacity-70" aria-hidden />
          {rotuloPeriodo}
          <ChevronDownIcon className="size-3.5 opacity-60" aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <div className="grid grid-cols-2 gap-1">
            {PERIODOS.map((p) => (
              <Link key={p} href={montarHref(estado, { periodo: p, de: null, ate: null })} className={cn("rounded-md px-2 py-1.5 text-[12.5px] hover:bg-muted", !livre && estado.periodo === p && "bg-muted font-semibold")}>
                Últimos {p} dias
              </Link>
            ))}
            <Link href={montarHref(estado, { de: inicioMes, ate: hoje })} className={cn("rounded-md px-2 py-1.5 text-[12.5px] hover:bg-muted", livre && janela.inicio === inicioMes && janela.fim === hoje && "bg-muted font-semibold")}>
              Este mês
            </Link>
          </div>
          <form
            className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (de && ate) ir(montarHref(estado, { de, ate }));
            }}
          >
            <p className="text-[11px] font-medium text-muted-foreground">Período livre</p>
            <div className="flex items-center gap-1">
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="De" className="h-7 min-w-0 flex-1 rounded-md border border-border bg-card px-1.5 text-[12px]" />
              <span className="text-[11px] text-muted-foreground">a</span>
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" className="h-7 min-w-0 flex-1 rounded-md border border-border bg-card px-1.5 text-[12px]" />
            </div>
            <button type="submit" className="h-7 rounded-md bg-foreground px-2 text-[12px] font-medium text-background">
              Aplicar
            </button>
          </form>
          <label className="mt-2 flex cursor-pointer items-center gap-2 border-t border-border pt-2 text-[12px]">
            <Checkbox checked={f.comparar} onCheckedChange={(c) => setFiltros({ comparar: Boolean(c) })} />
            Comparar com o período anterior
          </label>
        </PopoverContent>
      </Popover>

      <Multi
        rotulo="Pessoa"
        opcoes={ativos.map((a) => ({ valor: a.ator, rotulo: a.nome, grupo: a.tipo === "agente" ? "Agentes" : "Pessoas" }))}
        selecionados={f.pessoas}
        onChange={(v) => setFiltros({ pessoas: v })}
      />
      <Multi rotulo="Número" opcoes={opcoes.numeros.map((n) => ({ valor: n.id, rotulo: n.rotulo }))} selecionados={f.numeros} onChange={(v) => setFiltros({ numeros: v })} />
      <Multi rotulo="Etapa" opcoes={opcoes.etapas.map((e) => ({ valor: e.chave, rotulo: e.nome }))} selecionados={f.etapas} onChange={(v) => setFiltros({ etapas: v })} />
      <Multi rotulo="Origem" opcoes={opcoes.origens.map((o) => ({ valor: o.chave, rotulo: o.rotulo }))} selecionados={f.origens} onChange={(v) => setFiltros({ origens: v })} />
      <Multi rotulo="Cidade" opcoes={opcoes.cidades.map((c) => ({ valor: c, rotulo: c }))} selecionados={f.cidades} onChange={(v) => setFiltros({ cidades: v })} />

      {mostrarDepartamento && (
        <div role="group" aria-label="Departamento" className="ml-1 flex h-[30px] items-center overflow-hidden rounded-md border border-border">
          {DEPARTAMENTOS_FILTRO.map((d, i) => (
            <Link
              key={d.rotulo}
              href={montarHref(estado, { filtros: { departamento: d.chave } })}
              aria-current={d.chave === f.departamento ? "page" : undefined}
              className={cn("inline-flex h-full items-center px-2.5 text-[12px] font-medium transition-colors", i > 0 && "border-l border-border", d.chave === f.departamento ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground")}
            >
              {d.rotulo}
            </Link>
          ))}
        </div>
      )}

      <div role="group" aria-label="Vista" className="ml-auto flex h-[30px] items-center overflow-hidden rounded-md border border-border">
        {(
          [
            ["tabela", "Tabela", TableIcon],
            ["dashboard", "Dashboard", LayoutDashboardIcon],
          ] as const
        ).map(([v, rotulo, Icone], i) => (
          <Link
            key={v}
            href={montarHref(estado, { vista: v })}
            aria-current={estado.vista === v ? "page" : undefined}
            className={cn("inline-flex h-full items-center gap-1.5 px-3 text-[12px] font-medium transition-colors", i > 0 && "border-l border-border", estado.vista === v ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground")}
          >
            <Icone className="size-3.5" aria-hidden />
            {rotulo}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Um chip removível de filtro ativo — o link tira só aquele valor. */
export function Chip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-card pl-2 pr-1.5 text-[11.5px] text-foreground hover:bg-muted">
      {children}
      <XIcon className="size-3 text-muted-foreground" aria-hidden />
    </Link>
  );
}

export function IconeCheck() {
  return <CheckIcon className="size-3" aria-hidden />;
}
