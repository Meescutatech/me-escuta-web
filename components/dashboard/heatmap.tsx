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

/** Hora × dia da semana: só cor (tinta preta em degraus), número no hover; células baixas. */
export function HeatmapHoraDia({ heatmap }: { heatmap: Heatmap | null }) {
  if (!heatmap) return <p className="py-6 text-center text-[12px] text-muted-foreground">Sem leitura por hora — as views do dashboard são por dia.</p>;
  const max = maxHeatmap(heatmap);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
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
                    title={`${d.rotulo} ${h}h–${h + 1}h: ${v} ${v === 1 ? "mensagem" : "mensagens"}`}
                    className="block h-3.5 rounded-[2px]"
                    style={{ backgroundColor: grau === 0 ? "var(--muted)" : `color-mix(in oklab, var(--foreground) ${Math.round(10 + grau * 85)}%, transparent)` }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
