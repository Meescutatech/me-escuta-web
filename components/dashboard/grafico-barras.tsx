"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Barras diarias em SVG proprio (sem lib). Uma ou duas series EMPILHADAS por dia, com hover que
 * mostra o dia e os valores. Cores: classes Tailwind de `fill-*` (tokens do app), nunca hex aqui —
 * o par azul.graf x laranja foi validado pela bateria da skill dataviz (CVD e contraste) em 29/08.
 *
 * Marcas finas, 2px de respiro entre barras, topo arredondado so na barra de cima da pilha, grade
 * recessiva com 2 linhas. Eixo x com no maximo 8 rotulos — em 90 dias, um a cada ~11.
 */

export interface SerieBarras {
  chave: string;
  rotulo: string;
  /** classe de preenchimento (ex.: "fill-azul-graf") */
  fill: string;
  valores: number[];
}

export function GraficoBarras({
  rotulos,
  series,
  altura = 96,
  rotuloVazio,
  className,
}: {
  /** rotulo de cada dia, na ordem */
  rotulos: string[];
  series: SerieBarras[];
  altura?: number;
  rotuloVazio: string;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const n = rotulos.length;
  const totais = rotulos.map((_, i) => series.reduce((s, sr) => s + (sr.valores[i] ?? 0), 0));
  const max = Math.max(1, ...totais);
  const tudoZero = totais.every((t) => t === 0);

  // viewBox em unidades proprias; a largura estica com o container (preserveAspectRatio none no
  // eixo x nao existe em SVG, entao desenhamos em 100 unidades e deixamos o retangulo esticar).
  const L = 100;
  const A = altura;
  const gap = n > 45 ? 0.35 : n > 20 ? 0.8 : 1.6;
  const larg = (L - gap * (n - 1)) / n;
  const passoRotulo = Math.max(1, Math.ceil(n / 8));

  return (
    <div className={cn("relative", className)}>
      {tudoZero && (
        <span className="pointer-events-none absolute inset-x-0 top-6 text-center text-[12px] text-mute">{rotuloVazio}</span>
      )}
      <svg
        viewBox={`0 0 ${L} ${A}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height: A }}
        role="img"
        aria-labelledby={`${id}-t`}
        onMouseLeave={() => setHover(null)}
      >
        <title id={`${id}-t`}>{series.map((s) => s.rotulo).join(" e ")} por dia</title>
        {/* grade recessiva */}
        {[0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={L}
            y1={A - 1 - (A - 6) * f}
            y2={A - 1 - (A - 6) * f}
            className="stroke-linha"
            strokeWidth={0.6}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line x1={0} x2={L} y1={A - 1} y2={A - 1} className="stroke-linha-forte" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {rotulos.map((_, i) => {
          const x = i * (larg + gap);
          let y = A - 1;
          const ativo = hover === i;
          return (
            <g key={i} opacity={hover != null && !ativo ? 0.55 : 1}>
              {/* alvo de hover maior que a marca */}
              <rect
                x={x - gap / 2}
                y={0}
                width={larg + gap}
                height={A}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={-1}
              />
              {series.map((s, k) => {
                const v = s.valores[i] ?? 0;
                if (v <= 0) return null;
                const h = Math.max(1.5, ((A - 6) * v) / max);
                y -= h;
                const topo = series.slice(k + 1).every((r) => (r.valores[i] ?? 0) <= 0);
                return (
                  <rect
                    key={s.chave}
                    x={x}
                    y={y + (topo ? 0 : 0.6)}
                    width={larg}
                    height={Math.max(0.5, h - (topo ? 0 : 0.6))}
                    rx={topo ? 0.8 : 0}
                    className={cn(s.fill, "pointer-events-none")}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-mute">
        {rotulos.map((r, i) => (
          <span key={i} className={cn("min-w-0 flex-1 text-center", i % passoRotulo !== 0 && i !== n - 1 && "invisible")}>
            {r}
          </span>
        ))}
      </div>

      {hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-[8px] border border-linha bg-branco px-2.5 py-1.5 text-[11.5px] shadow-[0_6px_20px_rgba(31,35,40,.10)]"
          style={{
            left: `${((hover + 0.5) / n) * 100}%`,
            transform: hover > n / 2 ? "translate(calc(-100% - 8px), 0)" : "translate(8px, 0)",
          }}
          role="status"
        >
          <div className="font-semibold tabular-nums text-tinta">{rotulos[hover]}</div>
          {series.map((s) => (
            <div key={s.chave} className="flex items-center gap-1.5 text-suave">
              <span className={cn("inline-block h-2 w-2 rounded-[2px]", s.fill.replace("fill-", "bg-"))} aria-hidden />
              {s.rotulo} <b className="ml-auto pl-3 font-semibold tabular-nums text-tinta">{(s.valores[hover] ?? 0).toLocaleString("pt-BR")}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
