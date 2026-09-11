"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDownIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Ator, Janela } from "@/lib/dados/dashboard-ceo-calculos";
import { DEPARTAMENTOS_FILTRO, montarHref, type EstadoUrl, type FiltrosDashboard, type TipoLead } from "@/lib/dados/dashboard-dono-calculos";
import type { OpcoesFiltros } from "@/lib/dados/dashboard-dono";
import { cn } from "@/lib/utils";
import { SeletorPeriodo } from "./periodo";

/**
 * A toolbar do dashboard (v4) — uma linha, 30px, tudo na URL. Primários: busca · período (calendário
 * com presets e dois meses) · Pessoa (quem atendeu) · Responsável (dono do lead) · Etapa ·
 * Departamento. Secundários atrás de "Ver mais": Origem · Número · Cidade · Tipo de lead. Filtros
 * ativos viram chips logo abaixo (`chips.tsx`). Nenhum `<select>` nativo, nenhuma cor além do preto.
 */

const botao = "inline-flex h-[30px] items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[popup-open]:bg-muted";
const ativo = "border-foreground bg-foreground text-background hover:bg-foreground";

type Opcao = { valor: string; rotulo: string; grupo?: string };

function ListaMulti({ opcoes, selecionados, onChange }: { opcoes: Opcao[]; selecionados: string[]; onChange: (v: string[]) => void }) {
  const grupos = [...new Set(opcoes.map((o) => o.grupo ?? ""))];
  return (
    <div>
      {grupos.map((g) => (
        <div key={g}>
          {g ? <p className="px-2 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</p> : null}
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
      {selecionados.length > 0 ? (
        <button type="button" onClick={() => onChange([])} className="mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground">
          <XIcon className="size-3" aria-hidden /> Limpar
        </button>
      ) : null}
    </div>
  );
}

function Multi({ rotulo, opcoes, selecionados, onChange }: { rotulo: string; opcoes: Opcao[]; selecionados: string[]; onChange: (v: string[]) => void }) {
  const n = selecionados.length;
  return (
    <Popover>
      <PopoverTrigger className={cn(botao, n > 0 && ativo)} disabled={opcoes.length === 0} title={opcoes.length === 0 ? "sem opções nesta leitura" : undefined}>
        {rotulo}
        {n > 0 ? <span className="rounded bg-background/20 px-1 text-[11px] tabular-nums">{n}</span> : null}
        <ChevronDownIcon className="size-3.5 opacity-60" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <ListaMulti opcoes={opcoes} selecionados={selecionados} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

const TIPOS: Array<{ valor: TipoLead; rotulo: string }> = [
  { valor: "lead", rotulo: "Lead (ainda no funil)" },
  { valor: "paciente", rotulo: "Paciente (já comprou)" },
];

export function Toolbar({
  estado,
  janela,
  livre,
  agoraIso,
  atores,
  opcoes,
  mostrarDepartamento,
}: {
  estado: EstadoUrl;
  janela: Janela;
  livre: boolean;
  agoraIso: string;
  atores: Ator[];
  opcoes: OpcoesFiltros;
  mostrarDepartamento: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [q, setQ] = useState(estado.filtros.q);
  const f = estado.filtros;
  const ir = (href: string) => iniciar(() => router.push(href));
  const setFiltros = (mud: Partial<FiltrosDashboard>) => ir(montarHref(estado, { filtros: mud }));
  const ativos = atores.filter((a) => a.ativo);
  const secundarios = f.origens.length + f.numeros.length + f.cidades.length + f.tipos.length;

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
          className="h-[30px] w-[160px] rounded-md border border-border bg-card pl-8 pr-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </form>

      <SeletorPeriodo estado={estado} janela={janela} livre={livre} agoraIso={agoraIso} />

      <Multi rotulo="Pessoa" opcoes={ativos.map((a) => ({ valor: a.ator, rotulo: a.nome, grupo: a.tipo === "agente" ? "Agentes" : "Pessoas" }))} selecionados={f.pessoas} onChange={(v) => setFiltros({ pessoas: v })} />
      <Multi rotulo="Responsável" opcoes={opcoes.responsaveis.map((r) => ({ valor: r.id, rotulo: r.nome }))} selecionados={f.responsaveis} onChange={(v) => setFiltros({ responsaveis: v })} />
      <Multi rotulo="Etapa" opcoes={opcoes.etapas.map((e) => ({ valor: e.chave, rotulo: e.nome }))} selecionados={f.etapas} onChange={(v) => setFiltros({ etapas: v })} />

      {mostrarDepartamento && (
        <div role="group" aria-label="Departamento" className="flex h-[30px] items-center overflow-hidden rounded-md border border-border">
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

      <Popover>
        <PopoverTrigger className={cn(botao, secundarios > 0 && ativo)}>
          <SlidersHorizontalIcon className="size-3.5 opacity-70" aria-hidden />
          Ver mais
          {secundarios > 0 ? <span className="rounded bg-background/20 px-1 text-[11px] tabular-nums">{secundarios}</span> : null}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[560px] p-2">
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                ["Origem", opcoes.origens.map((o) => ({ valor: o.chave, rotulo: o.rotulo })), f.origens, (v: string[]) => setFiltros({ origens: v })],
                ["Número", opcoes.numeros.map((n) => ({ valor: n.id, rotulo: n.rotulo })), f.numeros, (v: string[]) => setFiltros({ numeros: v })],
                ["Cidade", opcoes.cidades.map((c) => ({ valor: c, rotulo: c })), f.cidades, (v: string[]) => setFiltros({ cidades: v })],
                ["Tipo", TIPOS.map((t) => ({ valor: t.valor, rotulo: t.rotulo })), f.tipos, (v: string[]) => setFiltros({ tipos: v.filter((x): x is TipoLead => x === "lead" || x === "paciente") })],
              ] as const
            ).map(([rotulo, ops, sel, onChange]) => (
              <div key={rotulo} className="min-w-0">
                <p className="px-2 pb-1 text-[11px] font-semibold text-foreground">{rotulo}</p>
                {ops.length === 0 ? <p className="px-2 text-[11.5px] text-muted-foreground">sem opções nesta leitura</p> : <ListaMulti opcoes={ops} selecionados={sel} onChange={onChange} />}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
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
