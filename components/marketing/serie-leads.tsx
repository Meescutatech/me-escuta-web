import type { PontoSerie } from "@/lib/dados/marketing-calculos";
import { COR } from "./marcas";

/**
 * Leads por dia — colunas empilhadas (Meta, Google, organico, outros), uma escala so.
 * Marca fina, folga de 2px entre segmentos, grade recessiva, rotulo direto so no pico.
 * Tooltip nativo por coluna (`<title>`): funciona sem JS e em leitor de tela.
 */

const ALTURA = 150;
const TOPO = 18;
const BASE = 22;
const LARGURA = 900;
const ESQ = 28;

function tetoRedondo(max: number): number {
  if (max <= 5) return 5;
  if (max <= 10) return 10;
  const pot = 10 ** Math.floor(Math.log10(max));
  const passo = max / pot <= 2 ? pot / 2 : pot;
  return Math.ceil(max / passo) * passo;
}

export function SerieLeads({ pontos }: { pontos: PontoSerie[] }) {
  const n = pontos.length;
  const max = Math.max(1, ...pontos.map((p) => p.total));
  const teto = tetoRedondo(max);
  const larguraUtil = LARGURA - ESQ;
  const passo = larguraUtil / n;
  const largCol = Math.max(3, Math.min(22, passo - Math.max(2, passo * 0.35)));
  const escala = (v: number) => (v / teto) * ALTURA;
  const temOutros = pontos.some((p) => p.outros > 0);
  const pico = pontos.reduce((a, b) => (b.total > a.total ? b : a), pontos[0]);
  const cadaN = n > 60 ? 14 : n > 20 ? 7 : 1;

  const series: Array<{ chave: "meta" | "google" | "organico" | "outros"; rotulo: string }> = [
    { chave: "meta", rotulo: "Meta" },
    { chave: "google", rotulo: "Google" },
    { chave: "organico", rotulo: "Organico" },
    ...(temOutros ? [{ chave: "outros" as const, rotulo: "Outros" }] : []),
  ];

  return (
    <figure className="m-0">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-suave">
        {series.map((s) => (
          <span key={s.chave} className="flex items-center gap-1.5">
            <span className="h-[8px] w-[8px] rounded-[2px]" style={{ background: COR[s.chave] }} aria-hidden />
            {s.rotulo}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${LARGURA} ${ALTURA + TOPO + BASE}`}
          className="block h-auto w-full min-w-[480px]"
          role="img"
          aria-label={`Leads por dia, ${n} dias`}
        >
          {[0, 0.5, 1].map((f) => {
            const y = TOPO + ALTURA - escala(teto * f);
            return (
              <g key={f}>
                <line x1={ESQ} x2={LARGURA} y1={y} y2={y} stroke="#E8E7E2" strokeWidth={1} />
                <text x={ESQ - 6} y={y + 3.5} textAnchor="end" fontSize={10} fill="#5F6873" fontFamily="ui-monospace, Menlo, monospace">
                  {teto * f}
                </text>
              </g>
            );
          })}
          {pontos.map((p, i) => {
            const x = ESQ + i * passo + (passo - largCol) / 2;
            let y = TOPO + ALTURA;
            const partes = series
              .map((s) => ({ ...s, v: p[s.chave] }))
              .filter((s) => s.v > 0);
            const titulo = [
              `${p.rotulo} · ${p.total} lead${p.total === 1 ? "" : "s"}`,
              ...partes.map((s) => `${s.rotulo} ${s.v}`),
            ].join("\n");
            const rotuloX = i % cadaN === 0 || n <= 14;
            return (
              <g key={p.dia}>
                <title>{titulo}</title>
                <rect x={ESQ + i * passo} y={TOPO} width={passo} height={ALTURA} fill="transparent" />
                {partes.map((s, k) => {
                  const h = escala(s.v);
                  y -= h;
                  const gap = k < partes.length - 1 ? 2 : 0;
                  const ehTopo = k === partes.length - 1;
                  return (
                    <rect
                      key={s.chave}
                      x={x}
                      y={y}
                      width={largCol}
                      height={Math.max(0, h - gap)}
                      rx={ehTopo ? 3 : 0}
                      fill={COR[s.chave]}
                    />
                  );
                })}
                {p.total > 0 && p.dia === pico.dia && (
                  <text
                    x={x + largCol / 2}
                    y={TOPO + ALTURA - escala(p.total) - 5}
                    textAnchor="middle"
                    fontSize={10.5}
                    fontWeight={600}
                    fill="#1F2328"
                    fontFamily="ui-monospace, Menlo, monospace"
                  >
                    {p.total}
                  </text>
                )}
                {rotuloX && (
                  <text
                    x={ESQ + i * passo + passo / 2}
                    y={TOPO + ALTURA + 15}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#5F6873"
                    fontFamily="ui-monospace, Menlo, monospace"
                  >
                    {n <= 14 ? p.rotulo.slice(4) : p.rotulo.slice(4)}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={ESQ} x2={LARGURA} y1={TOPO + ALTURA} y2={TOPO + ALTURA} stroke="#DCDAD4" strokeWidth={1} />
        </svg>
      </div>
    </figure>
  );
}
