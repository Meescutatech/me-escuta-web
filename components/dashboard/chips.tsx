import type { Ator } from "@/lib/dados/dashboard-ceo-calculos";
import { FILTROS_VAZIOS, montarHref, type EstadoUrl } from "@/lib/dados/dashboard-dono-calculos";
import type { OpcoesFiltros } from "@/lib/dados/dashboard-dono";
import { Chip } from "./toolbar";

const DEP: Record<string, string> = { pre_venda: "Pré-venda", pos_venda: "Pós-venda" };

/** Os filtros ativos como chips removíveis, logo abaixo da toolbar. Some quando não há nenhum. */
export function ChipsAtivos({
  estado,
  atores,
  opcoes,
}: {
  estado: EstadoUrl;
  atores: Ator[];
  opcoes: OpcoesFiltros;
}) {
  const f = estado.filtros;
  const nome = (ator: string) => atores.find((a) => a.ator === ator)?.nome ?? ator;
  const chips: Array<{ chave: string; texto: string; href: string }> = [];
  if (f.q) chips.push({ chave: "q", texto: `busca: ${f.q}`, href: montarHref(estado, { filtros: { q: "" } }) });
  for (const p of f.pessoas) chips.push({ chave: `p:${p}`, texto: nome(p), href: montarHref(estado, { filtros: { pessoas: f.pessoas.filter((x) => x !== p) } }) });
  for (const r of f.responsaveis) chips.push({ chave: `r:${r}`, texto: `dono: ${opcoes.responsaveis.find((x) => x.id === r)?.nome ?? r}`, href: montarHref(estado, { filtros: { responsaveis: f.responsaveis.filter((x) => x !== r) } }) });
  for (const t of f.tipos) chips.push({ chave: `t:${t}`, texto: t === "lead" ? "lead" : "paciente", href: montarHref(estado, { filtros: { tipos: f.tipos.filter((x) => x !== t) } }) });
  for (const n of f.numeros) chips.push({ chave: `n:${n}`, texto: opcoes.numeros.find((x) => x.id === n)?.rotulo ?? n, href: montarHref(estado, { filtros: { numeros: f.numeros.filter((x) => x !== n) } }) });
  for (const e of f.etapas) chips.push({ chave: `e:${e}`, texto: opcoes.etapas.find((x) => x.chave === e)?.nome ?? e, href: montarHref(estado, { filtros: { etapas: f.etapas.filter((x) => x !== e) } }) });
  for (const o of f.origens) chips.push({ chave: `o:${o}`, texto: opcoes.origens.find((x) => x.chave === o)?.rotulo ?? o, href: montarHref(estado, { filtros: { origens: f.origens.filter((x) => x !== o) } }) });
  for (const c of f.cidades) chips.push({ chave: `c:${c}`, texto: c, href: montarHref(estado, { filtros: { cidades: f.cidades.filter((x) => x !== c) } }) });
  if (f.departamento) chips.push({ chave: "dep", texto: DEP[f.departamento] ?? f.departamento, href: montarHref(estado, { filtros: { departamento: null } }) });
  if (!f.comparar) chips.push({ chave: "comparar", texto: "sem comparação", href: montarHref(estado, { filtros: { comparar: true } }) });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <Chip key={c.chave} href={c.href}>
          {c.texto}
        </Chip>
      ))}
      <a href={montarHref({ ...estado, filtros: FILTROS_VAZIOS })} className="text-[11.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
        limpar tudo
      </a>
    </div>
  );
}
