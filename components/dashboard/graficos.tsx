"use client";

import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PontoDia } from "@/lib/dados/dashboard-ceo-calculos";
import { serieAcumulada, type Heatmap } from "@/lib/dados/dashboard-dono-calculos";
import { serieHoraria } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";
import { diaMes } from "./pecas";

/**
 * Os gráficos do dashboard (v2) — recharts via `components/ui/chart` (shadcn). Regra de cor do
 * painel de referência: a linha principal é PRETA e fina; a segunda série é cinza; nada colorido.
 * Grade tracejada leve, eixo x com datas curtas ("25 mai"), tooltip do shadcn com valor tabular.
 */

const CONFIG_EVOLUCAO = {
  leadsAcumulado: { label: "Leads", color: "var(--foreground)" },
  conversasAcumulado: { label: "Conversas", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

const AGRUPAR = [
  { value: "1", label: "Agrupar por 1 dia" },
  { value: "7", label: "Agrupar por 7 dias" },
];

/** Evolução acumulada de leads e conversas, com "Agrupar por". */
export function EvolucaoAcumulada({ serie, className }: { serie: PontoDia[]; className?: string }) {
  const [agrupar, setAgrupar] = useState<1 | 7>(serie.length > 45 ? 7 : 1);
  const dados = serieAcumulada(serie, agrupar);
  const passo = Math.max(1, Math.ceil(dados.length / 7));

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="-mt-7 flex items-center justify-end">
        <Select items={AGRUPAR} value={String(agrupar)} onValueChange={(v) => setAgrupar(Number(v) === 7 ? 7 : 1)}>
          <SelectTrigger size="sm" aria-label="Agrupar por" className="border-border bg-card text-[12px] font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AGRUPAR.map((a) => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ChartContainer config={CONFIG_EVOLUCAO} className="aspect-auto h-[220px] w-full">
        <AreaChart data={dados} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="fill-leads" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--foreground)" stopOpacity={0.08} />
              <stop offset="100%" stopColor="var(--foreground)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="dia" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} interval={passo - 1} tickFormatter={(v: string) => diaMes(v)} />
          <YAxis width={36} tickLine={false} axisLine={false} tickMargin={4} tickFormatter={(v: number) => v.toLocaleString("pt-BR")} />
          <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltipContent indicator="line" labelFormatter={(v) => diaMes(String(v))} />} />
          <Area dataKey="conversasAcumulado" type="monotone" stroke="var(--color-conversasAcumulado)" strokeWidth={1.25} strokeDasharray="4 3" fill="transparent" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          <Area dataKey="leadsAcumulado" type="monotone" stroke="var(--color-leadsAcumulado)" strokeWidth={1.5} fill="url(#fill-leads)" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

const CONFIG_HORA = { total: { label: "Mensagens", color: "var(--foreground)" } } satisfies ChartConfig;

/** Mensagens recebidas por hora do dia — barras pretas, uma por hora. */
export function BarrasPorHora({ heatmap, className }: { heatmap: Heatmap | null; className?: string }) {
  const dados = serieHoraria(heatmap);
  if (dados.length === 0) return <p className="flex h-[160px] items-center justify-center text-[12.5px] text-muted-foreground">Sem leitura por hora — as views do dashboard são por dia.</p>;
  return (
    <ChartContainer config={CONFIG_HORA} className={cn("aspect-auto h-[160px] w-full", className)}>
      <BarChart data={dados} margin={{ left: 4, right: 4, top: 8, bottom: 0 }} barCategoryGap={3}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tickMargin={6} interval={2} />
        <YAxis width={30} tickLine={false} axisLine={false} tickMargin={4} />
        <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent hideIndicator labelFormatter={(v) => `${v} às ${Number(String(v).replace("h", "")) + 1}h`} />} />
        <Bar dataKey="total" fill="var(--color-total)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}

const CONFIG_MENSAGENS = {
  enviadasAgente: { label: "Agentes", color: "var(--muted-foreground)" },
  enviadasHumano: { label: "Pessoas", color: "var(--foreground)" },
} satisfies ChartConfig;

/** Mensagens enviadas por dia, empilhadas: agentes (cinza) embaixo, pessoas (preto) em cima. */
export function MensagensPorDia({ serie, className }: { serie: PontoDia[]; className?: string }) {
  const passo = Math.max(1, Math.ceil(serie.length / 7));
  return (
    <ChartContainer config={CONFIG_MENSAGENS} className={cn("aspect-auto h-[160px] w-full", className)}>
      <BarChart data={serie} margin={{ left: 4, right: 4, top: 8, bottom: 0 }} barCategoryGap={serie.length > 45 ? 1 : 3}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="dia" tickLine={false} axisLine={false} tickMargin={6} interval={passo - 1} tickFormatter={(v: string) => diaMes(v)} />
        <YAxis width={30} tickLine={false} axisLine={false} tickMargin={4} />
        <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent labelFormatter={(v) => diaMes(String(v))} />} />
        <Bar dataKey="enviadasAgente" stackId="a" fill="var(--color-enviadasAgente)" isAnimationActive={false} />
        <Bar dataKey="enviadasHumano" stackId="a" fill="var(--color-enviadasHumano)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}

const CONFIG_FAISCA = { v: { label: "", color: "var(--foreground)" } } satisfies ChartConfig;

/** A faísca do KPI: área preta fina, sem eixo, 28px. Só o formato da trajetória — o valor está acima. */
export function Faisca({ valores, className }: { valores: number[]; className?: string }) {
  if (valores.length < 2) return null;
  const dados = valores.map((v, i) => ({ i, v }));
  return (
    <ChartContainer config={CONFIG_FAISCA} className={cn("aspect-auto h-7 w-full", className)}>
      <AreaChart data={dados} margin={{ left: 0, right: 0, top: 2, bottom: 0 }}>
        <Area dataKey="v" type="monotone" stroke="var(--color-v)" strokeWidth={1.25} fill="var(--color-v)" fillOpacity={0.06} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ChartContainer>
  );
}
