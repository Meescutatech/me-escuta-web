"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarIcon, ChevronDownIcon } from "lucide-react";
import { ptBR } from "react-day-picker/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ymdEmSaoPaulo } from "@/lib/dados/dashboard-calculos";
import type { Janela } from "@/lib/dados/dashboard-ceo-calculos";
import { montarHref, type EstadoUrl } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";

/**
 * O seletor de período do dashboard (v4, pedido do Diogo 23:30: "um componente de calendário que
 * presta"): popover com os PRESETS à esquerda (Hoje · Esta semana · Semana passada · Últimos 30 d ·
 * Este mês · Últimos 90 d · Este trimestre · Este ano · Limpar) e DOIS meses lado a lado à direita,
 * seleção de intervalo, e o gatilho "10/08/26 – 25/08/26" com o ícone de calendário.
 *
 * Tudo vira `?de=&ate=` (ou `?periodo=` nos presets de N dias). As leituras cobrem 190 dias: preset
 * que passa disso fica desabilitado com o motivo, em vez de mostrar zero fingindo ser dado.
 */

const MAX_DIAS = 190;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function deYmd(s: string): Date {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a, m - 1, d);
}
function ddmmaa(s: string): string {
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`;
}
function diasEntre(a: string, b: string): number {
  return Math.round((deYmd(b).getTime() - deYmd(a).getTime()) / 86_400_000) + 1;
}

export function SeletorPeriodo({ estado, janela, livre, agoraIso }: { estado: EstadoUrl; janela: Janela; livre: boolean; agoraIso: string }) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  const [aberto, setAberto] = useState(false);
  const hojeStr = ymdEmSaoPaulo(new Date(agoraIso));
  const hoje = deYmd(hojeStr);
  const [faixa, setFaixa] = useState<DateRange | undefined>({ from: deYmd(janela.inicio), to: deYmd(janela.fim) });

  const ir = (mud: Parameters<typeof montarHref>[1]) => {
    setAberto(false);
    iniciar(() => router.push(montarHref(estado, mud)));
  };
  const irLivre = (de: string, ate: string) => ir({ de, ate });

  // presets — calculados no fuso local do navegador a partir de "hoje" em São Paulo
  const dow = (hoje.getDay() + 6) % 7; // segunda = 0
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() - dow);
  const segundaPassada = new Date(segunda);
  segundaPassada.setDate(segunda.getDate() - 7);
  const domingoPassado = new Date(segunda);
  domingoPassado.setDate(segunda.getDate() - 1);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioTri = new Date(hoje.getFullYear(), Math.floor(hoje.getMonth() / 3) * 3, 1);
  const inicioAno = new Date(hoje.getFullYear(), 0, 1);

  const presets: Array<{ rotulo: string; de?: string; ate?: string; periodo?: 7 | 30 | 90; ativo: boolean }> = [
    { rotulo: "Hoje", de: hojeStr, ate: hojeStr, ativo: livre && janela.inicio === hojeStr && janela.fim === hojeStr },
    { rotulo: "Esta semana", de: ymd(segunda), ate: hojeStr, ativo: livre && janela.inicio === ymd(segunda) && janela.fim === hojeStr },
    { rotulo: "Semana passada", de: ymd(segundaPassada), ate: ymd(domingoPassado), ativo: livre && janela.inicio === ymd(segundaPassada) && janela.fim === ymd(domingoPassado) },
    { rotulo: "Últimos 7 dias", periodo: 7, ativo: !livre && estado.periodo === 7 },
    { rotulo: "Últimos 30 dias", periodo: 30, ativo: !livre && estado.periodo === 30 },
    { rotulo: "Este mês", de: ymd(inicioMes), ate: hojeStr, ativo: livre && janela.inicio === ymd(inicioMes) && janela.fim === hojeStr },
    { rotulo: "Últimos 90 dias", periodo: 90, ativo: !livre && estado.periodo === 90 },
    { rotulo: "Este trimestre", de: ymd(inicioTri), ate: hojeStr, ativo: livre && janela.inicio === ymd(inicioTri) && janela.fim === hojeStr },
    { rotulo: "Este ano", de: ymd(inicioAno), ate: hojeStr, ativo: livre && janela.inicio === ymd(inicioAno) && janela.fim === hojeStr },
  ];

  const rotulo = livre ? `${ddmmaa(janela.inicio)} – ${ddmmaa(janela.fim)}` : `Últimos ${estado.periodo} dias`;
  const faixaCompleta = faixa?.from && faixa.to;
  const faixaDias = faixaCompleta ? diasEntre(ymd(faixa.from!), ymd(faixa.to!)) : 0;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger
        className={cn(
          "inline-flex h-[30px] items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[12.5px] font-medium tabular-nums text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[popup-open]:bg-muted",
          livre && "border-foreground",
        )}
      >
        <CalendarIcon className="size-3.5 opacity-70" aria-hidden />
        {rotulo}
        <ChevronDownIcon className="size-3.5 opacity-60" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex">
          <ul className="flex w-40 flex-col gap-px border-r border-border p-1.5">
            {presets.map((p) => {
              const dias = p.periodo ?? (p.de && p.ate ? diasEntre(p.de, p.ate) : 0);
              const excede = dias > MAX_DIAS;
              return (
                <li key={p.rotulo}>
                  <button
                    type="button"
                    disabled={excede}
                    title={excede ? `As leituras cobrem ${MAX_DIAS} dias` : undefined}
                    onClick={() => (p.periodo ? ir({ periodo: p.periodo, de: null, ate: null }) : irLivre(p.de!, p.ate!))}
                    className={cn("w-full rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40", p.ativo && "bg-muted font-semibold")}
                  >
                    {p.rotulo}
                  </button>
                </li>
              );
            })}
            <li className="mt-1 border-t border-border pt-1">
              <button type="button" onClick={() => ir({ periodo: 30, de: null, ate: null })} className="w-full rounded-md px-2 py-1.5 text-left text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground">
                Limpar
              </button>
            </li>
          </ul>
          <div className="flex flex-col">
            <Calendar
              mode="range"
              numberOfMonths={2}
              locale={ptBR}
              selected={faixa}
              onSelect={setFaixa}
              defaultMonth={new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)}
              disabled={{ after: hoje }}
              className="p-2"
            />
            <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
              <label className="flex cursor-pointer items-center gap-2 text-[12px]">
                <Checkbox checked={estado.filtros.comparar} onCheckedChange={(c) => ir({ filtros: { comparar: Boolean(c) } })} />
                Comparar com o período anterior
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] text-muted-foreground tabular-nums">{faixaCompleta ? `${ddmmaa(ymd(faixa!.from!))} – ${ddmmaa(ymd(faixa!.to!))} · ${faixaDias} d` : "escolha o início e o fim"}</span>
                <button
                  type="button"
                  disabled={!faixaCompleta || faixaDias > MAX_DIAS}
                  title={faixaDias > MAX_DIAS ? `As leituras cobrem ${MAX_DIAS} dias` : undefined}
                  onClick={() => faixaCompleta && irLivre(ymd(faixa!.from!), ymd(faixa!.to!))}
                  className="h-7 rounded-md bg-foreground px-2.5 text-[12px] font-medium text-background disabled:opacity-40"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
