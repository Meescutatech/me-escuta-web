import { ClockIcon } from "lucide-react";
import { maxHeatmap, type Heatmap } from "@/lib/dados/dashboard-dono-calculos";
import { CartaoGrafico } from "./relatorio";

/**
 * Quando as conversas chegam — volume por (dia da semana × hora). Cada célula mostra o número: a
 * cor dá o padrão de relance, o número dá o dado exato sem hover (e sobrevive a impressão).
 * Portado de `inflow-heatmap-card.tsx` do LiderHub; semana começando na segunda.
 */

const DIAS = [
  { dow: 1, rotulo: "Seg", cheio: "segunda" },
  { dow: 2, rotulo: "Ter", cheio: "terça" },
  { dow: 3, rotulo: "Qua", cheio: "quarta" },
  { dow: 4, rotulo: "Qui", cheio: "quinta" },
  { dow: 5, rotulo: "Sex", cheio: "sexta" },
  { dow: 6, rotulo: "Sáb", cheio: "sábado" },
  { dow: 0, rotulo: "Dom", cheio: "domingo" },
] as const;

const HORAS = Array.from({ length: 24 }, (_, h) => h);

/** Cinco degraus — os mesmos da legenda "menos → mais". */
const DEGRAUS = [12, 28, 48, 72, 100] as const;

function degrau(v: number, max: number): number | null {
  if (v === 0 || max === 0) return null;
  const i = Math.ceil((v / max) * DEGRAUS.length) - 1;
  return DEGRAUS[Math.min(Math.max(i, 0), DEGRAUS.length - 1)];
}

function estilo(v: number, max: number) {
  const d = degrau(v, max);
  if (d == null) return undefined;
  return {
    backgroundColor: `color-mix(in oklab, var(--chart-2) ${d}%, transparent)`,
    color: d >= 72 ? "var(--background)" : undefined,
  };
}

export function HeatmapHoraDia({ heatmap, periodo }: { heatmap: Heatmap | null; periodo: number }) {
  const max = heatmap ? maxHeatmap(heatmap) : 0;
  return (
    <CartaoGrafico
      titulo="Quando as conversas chegam"
      descricao={`Mensagens recebidas por hora e dia da semana, ${periodo} dias somados · horário de Brasília`}
      icone={ClockIcon}
      dica="Cada quadrado é uma hora de um dia da semana, com todas as semanas do período somadas. Serve para saber em que horários a equipe precisa estar em maior número — e onde a Clara segura sozinha."
      legenda={
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1" aria-hidden="true">
            {DEGRAUS.map((d) => (
              <span key={d} className="h-3 flex-1 rounded-[3px]" style={{ backgroundColor: `color-mix(in oklab, var(--chart-2) ${d}%, transparent)` }} />
            ))}
          </div>
          <div className="flex items-center justify-between text-ui-11 text-muted-foreground">
            <span>Menos mensagens</span>
            <span>Mais mensagens</span>
          </div>
        </div>
      }
      vazio={!heatmap || max === 0}
      mensagemVazio={heatmap ? "Sem mensagens no período" : "Sem leitura por hora — as views do dashboard são por dia"}
      alturaConteudo={heatmap ? 220 : 72}
    >
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="mb-1 grid grid-cols-[2.5rem_1fr] items-center">
            <span />
            <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-0.5">
              {HORAS.map((h) => (
                <span key={h} className="text-center text-ui-10 text-muted-foreground tabular-nums">
                  {h % 2 === 0 ? h : ""}
                </span>
              ))}
            </div>
          </div>
          {DIAS.map((d) => (
            <div key={d.dow} className="grid grid-cols-[2.5rem_1fr] items-center">
              <span className="pr-2 text-right text-ui-11 text-muted-foreground">{d.rotulo}</span>
              <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px] py-[2px]">
                {HORAS.map((h) => {
                  const v = heatmap?.[d.dow]?.[h] ?? 0;
                  return (
                    <span
                      key={h}
                      className="flex h-6 w-full items-center justify-center rounded-[4px] bg-muted/60 text-ui-10 font-medium tabular-nums"
                      style={estilo(v, max)}
                      title={v > 0 ? `${d.cheio}, das ${h}h às ${h + 1}h: ${v} ${v === 1 ? "mensagem" : "mensagens"}` : undefined}
                    >
                      {v > 0 ? v : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </CartaoGrafico>
  );
}
