import { cn } from "@/lib/utils";

/**
 * Peças de leitura de dado dos relatórios (portado de `components/report/viz.tsx` do LiderHub).
 *
 * Três regras que valem para todas elas e vêm da skill `dataviz`:
 * - **Uma série, uma cor.** Mini-barras não são gráfico categórico: são a trajetória de UM número.
 * - **A direção vem escrita.** Quem diz "+18%" é o texto do `SeloVariacao`; a cor só reforça.
 * - **Texto usa tinta de texto.** O número fica em `text-foreground`; quem carrega identidade é a
 *   marca colorida ao lado, nunca o próprio texto.
 */

/** Paleta categórica dos relatórios, em ordem fixa (nunca ciclada por índice). */
export const CORES_SERIE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"] as const;

/** Cinza reservado para a fatia "Sem …" — ausência de dado não é uma categoria. */
export const COR_NEUTRA = "var(--tag-slate-dot)";

/**
 * Mini-barras de trajetória. Sem eixo e sem rótulo por ponto de propósito: mostram o FORMATO da
 * trajetória, não valores para ler — o valor exato está no número grande logo acima.
 */
export function MiniBarras({ valores, cor = "var(--chart-2)", className }: { valores: number[]; cor?: string; className?: string }) {
  if (valores.length === 0) return null;
  const max = Math.max(...valores, 1);
  return (
    <span aria-hidden="true" data-slot="mini-barras" className={cn("flex h-4 items-end gap-[2px]", className)}>
      {valores.map((v, i) => (
        <span
          key={i}
          className="min-w-[3px] flex-1 rounded-[1.5px]"
          style={{ height: `${Math.max(8, (v / max) * 100)}%`, backgroundColor: cor, opacity: 0.85 }}
        />
      ))}
    </span>
  );
}

/**
 * Barra proporcional DEPOIS do número, dentro da célula. Serve à comparação linha a linha; não é
 * parte-do-todo. Com `max` zero não renderiza: barra sem vizinha não compara com nada.
 */
export function BarraNaCelula({ valor, max, cor = "var(--chart-2)", apagada = false }: { valor: number; max: number; cor?: string; apagada?: boolean }) {
  if (max <= 0) return null;
  const pct = Math.max(0, Math.min(1, valor / max));
  return (
    <span aria-hidden="true" data-slot="barra-na-celula" className="relative inline-block h-1.5 w-11 shrink-0 overflow-hidden rounded-full bg-muted">
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${Math.max(pct * 100, valor > 0 ? 6 : 0)}%`, backgroundColor: cor, opacity: apagada ? 0.45 : 0.85 }}
      />
    </span>
  );
}

export type Fatia = {
  chave: string;
  rotulo: string;
  valor: number;
  /** Texto livre à direita do rótulo (contagem, valor absoluto…). */
  nota?: string;
  cor: string;
  apagada?: boolean;
};

/**
 * Repartição de um total em UMA barra da largura do bloco. Sem respiro entre os segmentos de
 * propósito: com gap as larguras somam mais de 100% e o último segmento é cortado.
 */
export function BarraParticipacao({ fatias, className, formatar }: { fatias: Fatia[]; className?: string; formatar?: (v: number) => string }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  return (
    <span data-slot="barra-participacao" className={cn("flex h-2.5 w-full overflow-hidden rounded-full bg-muted", className)} aria-hidden="true">
      {total <= 0
        ? null
        : fatias.map((f) => {
            const parte = f.valor / total;
            return (
              <span
                key={f.chave}
                className="h-full"
                style={{ width: `${parte * 100}%`, backgroundColor: f.cor, opacity: f.apagada ? 0.55 : 1 }}
                title={`${f.rotulo} · ${Math.round(parte * 100)}%${formatar ? ` · ${formatar(f.valor)}` : ""}`}
              />
            );
          })}
    </span>
  );
}

/**
 * Rosca de parte-do-todo. Só faz sentido quando o TOTAL significa alguma coisa. A legenda
 * (`LegendaRosca`) é obrigatória: identidade nunca fica só na cor.
 */
export function Rosca({ fatias, valorCentro, rotuloCentro, tamanho = 108 }: { fatias: Fatia[]; valorCentro: string; rotuloCentro: string; tamanho?: number }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const traco = tamanho * 0.17;
  const raio = (tamanho - traco) / 2;
  const circ = 2 * Math.PI * raio;
  let desloc = 0;

  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }} data-slot="rosca">
      <svg width={tamanho} height={tamanho} aria-hidden="true">
        <g transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}>
          {total <= 0 ? (
            <circle cx={tamanho / 2} cy={tamanho / 2} r={raio} fill="none" stroke="var(--muted)" strokeWidth={traco} />
          ) : (
            fatias.map((f) => {
              const comp = (f.valor / total) * circ;
              const dash = Math.max(comp - 2, 0);
              const no = (
                <circle
                  key={f.chave}
                  cx={tamanho / 2}
                  cy={tamanho / 2}
                  r={raio}
                  fill="none"
                  stroke={f.cor}
                  strokeOpacity={f.apagada ? 0.45 : 1}
                  strokeWidth={traco}
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-desloc}
                />
              );
              desloc += comp;
              return no;
            })
          )}
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-ui-14 font-semibold text-foreground tabular-nums">{valorCentro}</span>
        <span className="text-ui-10 text-muted-foreground">{rotuloCentro}</span>
      </div>
    </div>
  );
}

export function LegendaRosca({ fatias }: { fatias: Fatia[] }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  return (
    <ul data-slot="legenda-rosca" className="flex min-w-0 flex-1 flex-col gap-1.5">
      {fatias.map((f) => (
        <li key={f.chave} className="flex items-center gap-2 text-ui-11">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: f.cor, opacity: f.apagada ? 0.5 : 1 }} />
          <span className={cn("min-w-0 flex-1 truncate font-medium", f.apagada ? "text-muted-foreground" : "text-foreground")}>{f.rotulo}</span>
          {f.nota ? <span className="shrink-0 text-muted-foreground tabular-nums">{f.nota}</span> : null}
          <span className="w-9 shrink-0 text-right font-medium text-foreground tabular-nums">{total <= 0 ? "—" : `${Math.round((f.valor / total) * 100)}%`}</span>
        </li>
      ))}
    </ul>
  );
}
