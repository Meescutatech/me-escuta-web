import { maxHeatmap, type Heatmap } from "@/lib/dados/dashboard-dono-calculos";

const DIAS = [
  { dow: 1, rotulo: "Seg" },
  { dow: 2, rotulo: "Ter" },
  { dow: 3, rotulo: "Qua" },
  { dow: 4, rotulo: "Qui" },
  { dow: 5, rotulo: "Sex" },
  { dow: 6, rotulo: "Sáb" },
  { dow: 0, rotulo: "Dom" },
] as const;
const HORAS = Array.from({ length: 24 }, (_, h) => h);

/** Hora × dia da semana, tinta preta em cinco degraus, número dentro da célula. Semana começa na segunda. */
export function HeatmapHoraDia({ heatmap }: { heatmap: Heatmap | null }) {
  if (!heatmap) return <p className="py-6 text-center text-[12px] text-muted-foreground">Sem leitura por hora — as views do dashboard são por dia.</p>;
  const max = maxHeatmap(heatmap);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        <div className="grid grid-cols-[2rem_1fr] items-center">
          <span />
          <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-px">
            {HORAS.map((h) => (
              <span key={h} className="text-center text-[10px] text-muted-foreground tabular-nums">
                {h % 3 === 0 ? `${h}h` : ""}
              </span>
            ))}
          </div>
        </div>
        {DIAS.map((d) => (
          <div key={d.dow} className="grid grid-cols-[2rem_1fr] items-center">
            <span className="pr-1.5 text-right text-[11px] text-muted-foreground">{d.rotulo}</span>
            <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-px py-px">
              {HORAS.map((h) => {
                const v = heatmap[d.dow]?.[h] ?? 0;
                const grau = max === 0 || v === 0 ? 0 : Math.min(1, v / max);
                return (
                  <span
                    key={h}
                    title={v > 0 ? `${d.rotulo} ${h}h–${h + 1}h: ${v}` : undefined}
                    className="flex h-[22px] items-center justify-center rounded-[3px] text-[10px] font-medium tabular-nums"
                    style={{
                      backgroundColor: grau === 0 ? "var(--muted)" : `color-mix(in oklab, var(--foreground) ${Math.round(8 + grau * 82)}%, transparent)`,
                      color: grau >= 0.55 ? "var(--background)" : "var(--foreground)",
                    }}
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
  );
}
