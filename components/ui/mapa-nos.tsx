"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * MAPA DE NÓS — um canvas de colunas, com nós que se arrastam e ligações em curva tracejada.
 *
 * Genérico: recebe nós, ligações e rótulos de coluna. Quem sabe o que é um número, um agente ou
 * uma validadora é a tela; aqui só existe "nó", "ligação" e "coluna".
 *
 * Duas decisões que valem o comentário:
 *
 *  1. **O arrasto é por `pointer`, não pelo `drag` do motion.** Com o `drag` o elemento ganha um
 *     `transform` próprio, e as pontas das curvas (que são estado de React) passam a divergir da
 *     posição visual — a linha fica atrás do nó. Com `pointermove` a posição é UMA só: o estado
 *     desenha o nó e a curva no mesmo quadro. O motion continua desenhando a entrada e o realce.
 *  2. **Passar o mouse acende o CAMINHO inteiro**, não o nó. Subir e descer o grafo a partir de
 *     quem está sob o cursor responde a pergunta que o mapa existe para responder: de onde vem o
 *     que esse agente lê, e onde para o que ele produz. O resto do canvas apaga (não some).
 *
 * Sem neon: fundo `card`, linhas `border`, realce em `primary`. Nó desligado é tracejado e pálido
 * — o mapa mostra o que existe, não só o que está ligado.
 */

export type EstadoNo = "ativo" | "inativo" | "neutro";

export interface NoMapa {
  id: string;
  /** posição inicial dentro do canvas, em px */
  x: number;
  y: number;
  titulo: string;
  subtitulo?: string;
  /** uma linha discreta embaixo: "143 conversas · 7 d" */
  rodape?: string;
  estado?: EstadoNo;
  icone?: React.ReactNode;
  /** clique curto abre (arrastar não abre) */
  aoAbrir?: () => void;
  /** rótulo acessível do clique */
  abrirRotulo?: string;
}

export interface LigacaoMapa {
  de: string;
  para: string;
  /** pula a coluna do meio: o agente faz sozinho, sem ninguém no caminho */
  direta?: boolean;
}

export interface ColunaMapa {
  rotulo: string;
  /** x da coluna, para o rótulo do cabeçalho */
  x: number;
}

export interface MapaNosProps {
  nos: NoMapa[];
  ligacoes: LigacaoMapa[];
  colunas: ColunaMapa[];
  /** a linha de contagem do rodapé */
  rodape?: React.ReactNode;
  largura: number;
  altura: number;
  larguraNo?: number;
  alturaNo?: number;
  className?: string;
}

const PARADO = { x: 0, y: 0 };

export function MapaNos({
  nos,
  ligacoes,
  colunas,
  rodape,
  largura,
  altura,
  larguraNo = 186,
  alturaNo = 74,
  className,
}: MapaNosProps) {
  const caixa = React.useRef<HTMLDivElement>(null);
  /**
   * O canvas nasce com uma largura de projeto (`largura`) e ESTICA para a da tela: as colunas se
   * espalham, os nós não. Sem isso, um mapa desenhado para 1030px deixa meia tela vazia em 1920 —
   * foi o que a primeira medição mostrou.
   */
  const [util, setUtil] = React.useState(largura);
  const escala = Math.max(1, (util - larguraNo) / Math.max(1, largura - larguraNo));
  const larguraReal = Math.max(largura, util);

  const [pos, setPos] = React.useState<Record<string, { x: number; y: number }>>(() =>
    Object.fromEntries(nos.map((n) => [n.id, { x: n.x, y: n.y }])),
  );
  const [sob, setSob] = React.useState<string | null>(null);
  const arrastando = React.useRef<string | null>(null);

  React.useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setUtil(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // largura nova → recoloca tudo na grade (quem arrastou perde a posição; é o preço de caber)
  React.useEffect(() => {
    setPos(Object.fromEntries(nos.map((n) => [n.id, { x: n.x * escala, y: n.y }])));
  }, [nos, escala]);

  const p = React.useCallback((id: string) => pos[id] ?? PARADO, [pos]);

  /** o caminho inteiro que passa por `id`: tudo que chega nele e tudo que sai dele */
  const caminho = React.useMemo(() => {
    if (!sob) return null;
    const acima = new Set<string>([sob]);
    const abaixo = new Set<string>([sob]);
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const l of ligacoes) {
        if (acima.has(l.para) && !acima.has(l.de)) {
          acima.add(l.de);
          mudou = true;
        }
        if (abaixo.has(l.de) && !abaixo.has(l.para)) {
          abaixo.add(l.para);
          mudou = true;
        }
      }
    }
    const nosNoCaminho = new Set<string>([...acima, ...abaixo]);
    const arestas = new Set(
      ligacoes
        .filter((l) => (acima.has(l.de) && acima.has(l.para)) || (abaixo.has(l.de) && abaixo.has(l.para)))
        .map((l) => `${l.de}→${l.para}`),
    );
    return { nos: nosNoCaminho, arestas };
  }, [sob, ligacoes]);

  function pegar(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return;
    const inicio = { x: e.clientX, y: e.clientY };
    const base = { ...p(id) };
    let andou = 0;
    arrastando.current = id;
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - inicio.x;
      const dy = ev.clientY - inicio.y;
      andou = Math.max(andou, Math.abs(dx) + Math.abs(dy));
      setPos((atual) => ({
        ...atual,
        [id]: {
          x: Math.max(0, Math.min(larguraReal - larguraNo, base.x + dx)),
          y: Math.max(0, Math.min(altura - alturaNo, base.y + dy)),
        },
      }));
    };
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      arrastando.current = null;
      if (andou < 5) nos.find((n) => n.id === id)?.aoAbrir?.();
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className={cn("rounded-md border border-border/60 bg-card", className)}>
      <div ref={caixa} className="overflow-x-auto bg-background">
        <div
          className="relative select-none"
          style={{
            width: larguraReal,
            height: altura,
            backgroundImage: "radial-gradient(var(--input) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
            backgroundPosition: "-1px -1px",
          }}
        >
          {/* colunas */}
          {colunas.map((c) => (
            <div
              key={c.rotulo}
              className="absolute top-2.5 text-[12px] font-medium text-muted-foreground"
              style={{ left: c.x * escala, width: larguraNo * 1.6 }}
            >
              {c.rotulo}
            </div>
          ))}

          {/* ligações */}
          <svg className="pointer-events-none absolute inset-0" width={larguraReal} height={altura} aria-hidden>
            {ligacoes.map((l) => {
              const a = p(l.de);
              const b = p(l.para);
              const x1 = a.x + larguraNo;
              const y1 = a.y + alturaNo / 2;
              const x2 = b.x;
              const y2 = b.y + alturaNo / 2;
              const dx = Math.max(28, Math.abs(x2 - x1) / 2);
              const aceso = caminho?.arestas.has(`${l.de}→${l.para}`) ?? false;
              const apagado = caminho != null && !aceso;
              return (
                <path
                  key={`${l.de}-${l.para}`}
                  d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  strokeWidth={aceso ? 1.75 : 1.25}
                  strokeDasharray={l.direta ? "2 5" : "6 6"}
                  className={cn(
                    "transition-[stroke,opacity] duration-200",
                    aceso ? "stroke-primary" : "stroke-foreground/35",
                  )}
                  style={{ opacity: apagado ? 0.2 : 1 }}
                />
              );
            })}
          </svg>

          {/* nós */}
          {nos.map((n) => {
            const { x, y } = p(n.id);
            const aceso = caminho?.nos.has(n.id) ?? false;
            const apagado = caminho != null && !aceso;
            const desligado = n.estado === "inativo";
            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: apagado ? 0.42 : 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.2, 0.65, 0.3, 0.9] }}
                onPointerDown={(e) => pegar(e, n.id)}
                onPointerEnter={() => !arrastando.current && setSob(n.id)}
                onPointerLeave={() => !arrastando.current && setSob(null)}
                onFocus={() => setSob(n.id)}
                onBlur={() => setSob(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    n.aoAbrir?.();
                  }
                }}
                role={n.aoAbrir ? "button" : undefined}
                tabIndex={n.aoAbrir ? 0 : -1}
                aria-label={n.abrirRotulo ?? n.titulo}
                className={cn(
                  "absolute flex cursor-grab flex-col justify-center gap-0.5 rounded-md border bg-card px-3 py-2 shadow-[0_1px_2px_rgba(31,35,40,0.05)] transition-shadow active:cursor-grabbing",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  desligado ? "border-dashed border-border" : "border-border",
                  aceso && "border-primary/60 shadow-[0_0_0_1px_var(--primary)]",
                  n.aoAbrir && "hover:border-foreground/25",
                )}
                style={{ left: x, top: y, width: larguraNo, height: alturaNo }}
              >
                <div className="flex items-center gap-2">
                  {n.icone && (
                    <span className={cn("shrink-0", desligado ? "text-muted-foreground/60" : "text-foreground")}>
                      {n.icone}
                    </span>
                  )}
                  <span
                    className={cn(
                      "truncate text-[13px] font-medium",
                      desligado ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {n.titulo}
                  </span>
                </div>
                {n.subtitulo && (
                  <span className="truncate text-[11.5px] text-muted-foreground">
                    {n.subtitulo}
                  </span>
                )}
                {n.rodape && (
                  <span className="truncate text-[11px] text-muted-foreground/70">{n.rodape}</span>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {rodape && (
        <div className="border-t border-border/60 px-4 py-2.5 text-[12px] text-muted-foreground">{rodape}</div>
      )}
    </div>
  );
}
