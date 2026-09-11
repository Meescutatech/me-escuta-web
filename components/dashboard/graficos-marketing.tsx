"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { COR } from "@/components/marketing/marcas";
import type { PontoSerie } from "@/lib/dados/marketing-calculos";
import { diaMes } from "./pecas";

const CONFIG = {
  meta: { label: "Meta", color: COR.meta },
  google: { label: "Google", color: COR.google },
  organico: { label: "Orgânico", color: COR.organico },
  outros: { label: "Outros", color: COR.outros },
} satisfies ChartConfig;

/** Leads por dia, empilhados por plataforma (recharts). As cores são as marcas de canal da tela de marketing. */
export function LeadsPorDia({ pontos }: { pontos: PontoSerie[] }) {
  const passo = Math.max(1, Math.ceil(pontos.length / 7));
  const temOutros = pontos.some((p) => p.outros > 0);
  return (
    <ChartContainer config={CONFIG} className="aspect-auto h-[220px] w-full">
      <BarChart data={pontos} margin={{ left: 4, right: 4, top: 8, bottom: 0 }} barCategoryGap={pontos.length > 45 ? 1 : 3}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="dia" tickLine={false} axisLine={false} tickMargin={6} interval={passo - 1} tickFormatter={(v: string) => diaMes(v)} />
        <YAxis width={30} tickLine={false} axisLine={false} tickMargin={4} allowDecimals={false} />
        <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent labelFormatter={(v) => diaMes(String(v))} />} />
        <Bar dataKey="meta" stackId="a" fill="var(--color-meta)" isAnimationActive={false} />
        <Bar dataKey="google" stackId="a" fill="var(--color-google)" isAnimationActive={false} />
        <Bar dataKey="organico" stackId="a" fill="var(--color-organico)" radius={temOutros ? undefined : [2, 2, 0, 0]} isAnimationActive={false} />
        {temOutros ? <Bar dataKey="outros" stackId="a" fill="var(--color-outros)" radius={[2, 2, 0, 0]} isAnimationActive={false} /> : null}
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}
