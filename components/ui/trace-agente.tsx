"use client";

import * as React from "react";
import { Bot, Cpu, PauseIcon, PenLine, PlayIcon, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * TRACE DE AGENTE — uma execução do agente vista como linha do tempo.
 *
 * É a resposta visual à pergunta "como ele chegou nisso?": os passos na ordem em que aconteceram,
 * aninhados por quem chamou quem, com o que cada um devolveu, quanto tempo levou e quanto custou
 * em tokens. O playhead varre a execução para que dê para VER a sequência, não só ler a lista.
 *
 * Desenho (W-I, 10/09/2026, adaptado da referência `agent-trace` que o Diogo mandou):
 *  · Um playhead só. `--t` (0..1) mora na raiz e `--p` (0..1) em cada barra; os dois são escritos
 *    por UM `requestAnimationFrame` direto no style do nó — zero estado React por passo, zero
 *    re-render por quadro. Com 40 passos o custo é o mesmo que com 4.
 *  · A cor conta o que o passo FEZ, não o quanto ele durou: leitura é neutra, escrita é laranja
 *    (é a única coisa que muda o mundo), modelo é laranja fraco, erro é `destructive`, cache é
 *    quase invisível. `fila` muda a COR do texto, não a opacidade — passo enfileirado existe.
 *  · Para quem pediu menos movimento (`prefers-reduced-motion`), a execução aparece TERMINADA:
 *    todas as barras cheias, playhead no fim, sem loop. Nada se perde, só não anda sozinho.
 *  · Pausa quando sai da tela (`IntersectionObserver`) ou quando a aba some — um trace parado
 *    numa aba de fundo é bateria queimada à toa.
 *
 * Genérico de propósito: serve Jarvis, Clara, Levindo e Priscila, e também a pergunta "como
 * cheguei aqui" ao abrir uma proposta. Nomes em PT-BR, no passado, como a operação fala:
 * "leu a conversa", "consultou o funil", "propôs tarefa".
 */

export type TipoPasso = "agente" | "modelo" | "ferramenta" | "escrita";
export type EstadoPasso = "fila" | "rodando" | "feito" | "erro";

export interface PassoTrace {
  id: string;
  /** id do passo que chamou este — indenta e desenha o fio */
  paiId?: string | null;
  tipo: TipoPasso;
  /** o que ele fez, em PT-BR: "leu a conversa da Antônia" */
  nome: string;
  /** ms desde o início da execução */
  inicioMs: number;
  duracaoMs: number;
  estado: EstadoPasso;
  /** o que voltou: "12 conversas", "1.240 tk", "erro: tempo esgotado" */
  resultado?: string;
  /** 2 = tentou duas vezes (chip ×2) */
  tentativas?: number;
  /** veio do cache: não custou nada, e a barra diz isso */
  cache?: boolean;
}

export interface ExecucaoTrace {
  /** identificador de máquina — `exec_7c41f2` */
  id: string;
  /** o modelo que rodou, se houver */
  modelo?: string;
  /** quando começou, em texto pronto ("hoje às 09:12") */
  quando?: string;
  /** o que a execução produziu, em uma linha */
  desfecho?: string;
  duracaoMs: number;
  estado: "feito" | "rodando" | "erro";
  passos: PassoTrace[];
}

const ICONES: Record<TipoPasso, React.ComponentType<{ className?: string }>> = {
  agente: Bot,
  modelo: Cpu,
  ferramenta: Wrench,
  escrita: PenLine,
};

/** A cor da barra diz o que o passo fez. Laranja = mudou alguma coisa. */
function corDaBarra(p: PassoTrace): string {
  if (p.estado === "erro") return "bg-destructive";
  if (p.cache) return "bg-foreground/20";
  if (p.tipo === "escrita") return "bg-primary";
  if (p.tipo === "modelo") return "bg-primary/45";
  if (p.tipo === "agente") return "bg-foreground/55";
  return "bg-foreground/30";
}

const PASSOS_DA_REGUA = [50, 100, 250, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000];

function passoDaRegua(totalMs: number): number {
  for (const p of PASSOS_DA_REGUA) if (totalMs / p <= 6) return p;
  return PASSOS_DA_REGUA[PASSOS_DA_REGUA.length - 1];
}

function segundos(ms: number, casas = 2): string {
  return `${(ms / 1000).toFixed(casas).replace(".", ",")} s`;
}

function marca(ms: number): string {
  if (ms === 0) return "0";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return `${Number.isInteger(s) ? s : s.toFixed(1).replace(".", ",")} s`;
}

/** Profundidade pelo encadeamento `paiId` — o fio à esquerda é por nível. */
function profundidades(passos: PassoTrace[]): Record<string, number> {
  const porId = new Map(passos.map((p) => [p.id, p]));
  const saida: Record<string, number> = {};
  for (const p of passos) {
    let n = 0;
    let atual = p.paiId ? porId.get(p.paiId) : undefined;
    while (atual && n < 6) {
      n += 1;
      atual = atual.paiId ? porId.get(atual.paiId) : undefined;
    }
    saida[p.id] = n;
  }
  return saida;
}

export interface TraceAgenteProps {
  execucao: ExecucaoTrace;
  /** começa tocando (padrão: sim, quando entra na tela) */
  tocarAoEntrar?: boolean;
  className?: string;
}

export function TraceAgente({ execucao, tocarAoEntrar = true, className }: TraceAgenteProps) {
  // lido depois da montagem, nunca no servidor — senão o HTML do servidor e o do cliente divergem
  const [reduzido, setReduzido] = React.useState(false);
  const raiz = React.useRef<HTMLDivElement>(null);
  const trilho = React.useRef<HTMLDivElement>(null);
  const barras = React.useRef<Array<HTMLElement | null>>([]);
  const relogio = React.useRef<HTMLSpanElement>(null);
  const knob = React.useRef<HTMLSpanElement>(null);

  const total = Math.max(execucao.duracaoMs, 1);
  const passos = execucao.passos;
  const niveis = React.useMemo(() => profundidades(passos), [passos]);
  const step = passoDaRegua(total);
  const ticks = React.useMemo(() => {
    const fora: number[] = [];
    for (let v = 0; v <= total; v += step) fora.push(v);
    return fora;
  }, [total, step]);

  /**
   * O repouso é a execução TERMINADA — barras cheias. Ela já aconteceu; uma linha do tempo vazia
   * enquanto não se aperta play parece defeito. Quando o bloco entra na tela pela primeira vez,
   * ele rebobina e toca UMA vez; o play depois disso é replay.
   */
  const [tocando, setTocando] = React.useState(false);
  const t = React.useRef(1);
  const visivel = React.useRef(true);
  const jaTocou = React.useRef(!tocarAoEntrar);

  /** escreve `--t`, `--p` de cada barra e o relógio — uma vez por quadro, sem render */
  const pintar = React.useCallback(() => {
    const v = t.current;
    raiz.current?.style.setProperty("--t", String(v));
    if (knob.current) knob.current.style.left = `${v * 100}%`;
    const agora = v * total;
    for (let i = 0; i < passos.length; i++) {
      const el = barras.current[i];
      if (!el) continue;
      const p = passos[i];
      const dur = Math.max(p.duracaoMs, 1);
      const q = Math.min(1, Math.max(0, (agora - p.inicioMs) / dur));
      el.style.setProperty("--p", String(q));
    }
    if (relogio.current) relogio.current.textContent = `${segundos(agora)} / ${segundos(total)}`;
  }, [passos, total]);

  // quem pediu menos movimento vê a execução TERMINADA, não vazia
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => {
      if (!mq.matches) return;
      setReduzido(true);
      setTocando(false);
      t.current = 1;
      pintar();
    };
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, [pintar]);

  // o laço único
  React.useEffect(() => {
    pintar();
    if (reduzido || !tocando) return;
    let quadro = 0;
    let anterior = performance.now();
    const passo = (agora: number) => {
      const delta = agora - anterior;
      anterior = agora;
      if (visivel.current) {
        t.current += delta / total;
        if (t.current >= 1) t.current = 1;
        pintar();
        if (t.current >= 1) {
          setTocando(false);
          return;
        }
      }
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [tocando, reduzido, total, pintar]);

  // pausa fora da tela e com a aba escondida
  React.useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        visivel.current = e.isIntersecting && !document.hidden;
        if (!e.isIntersecting || jaTocou.current) return;
        jaTocou.current = true;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        t.current = 0;
        setTocando(true);
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    const aba = () => {
      visivel.current = !document.hidden && el.getBoundingClientRect().top < window.innerHeight;
    };
    document.addEventListener("visibilitychange", aba);
    return () => {
      obs.disconnect();
      document.removeEventListener("visibilitychange", aba);
    };
  }, []);

  // arrastar o playhead pelo trilho
  const arrastar = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = trilho.current;
      if (!el) return;
      setTocando(false);
      const mover = (x: number) => {
        const r = el.getBoundingClientRect();
        t.current = Math.min(1, Math.max(0, (x - r.left) / r.width));
        pintar();
      };
      mover(e.clientX);
      const mv = (ev: PointerEvent) => mover(ev.clientX);
      const up = () => {
        window.removeEventListener("pointermove", mv);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", mv);
      window.addEventListener("pointerup", up);
    },
    [pintar],
  );

  function reger() {
    if (t.current >= 1) {
      t.current = 0;
      pintar();
    }
    setTocando((v) => !v);
  }

  const selo =
    execucao.estado === "erro"
      ? { texto: "falhou", cor: "bg-destructive" }
      : execucao.estado === "rodando"
        ? { texto: "rodando", cor: "bg-primary" }
        : { texto: "concluída", cor: "bg-success-ink" };

  return (
    <div
      ref={raiz}
      style={{ ["--t" as string]: 1 }}
      className={cn("rounded-md border border-border/60 bg-card", className)}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3.5 py-2.5">
        <span className="font-mono text-[12px] text-foreground">{execucao.id}</span>
        <span className="text-[12px] text-muted-foreground">
          {[execucao.modelo, `${passos.length} passos`, execucao.quando].filter(Boolean).join(" · ")}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", selo.cor)} aria-hidden />
          {selo.texto}
        </span>
      </header>

      <div className="px-3.5 py-3">
        {/* régua */}
        <div className="flex items-center gap-3 pb-2">
          <div className="w-[38%] min-w-[120px] shrink-0" />
          <div ref={trilho} className="relative h-3 flex-1">
            {ticks.map((v) => (
              <span
                key={v}
                className="absolute top-0 text-[10px] leading-3 text-muted-foreground/70"
                style={{ left: `${(v / total) * 100}%`, transform: v === 0 ? "none" : "translateX(-50%)" }}
              >
                {marca(v)}
              </span>
            ))}
          </div>
          <div className="hidden w-[104px] shrink-0 sm:block" />
          <div className="w-[58px] shrink-0" />
        </div>

        {/* passos */}
        <ol className="relative">
          {/* o playhead atravessa só a faixa da linha do tempo */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-10 hidden w-px bg-primary/50 sm:block"
            // a faixa da linha do tempo = largura total − (nome 38% + 3 vãos de 12px + 104px + 58px)
            style={{ left: `calc(38% + 12px + (62% - 198px) * var(--t))` }}
          />
          {passos.map((p, i) => {
            const Icone = ICONES[p.tipo];
            const nivel = niveis[p.id] ?? 0;
            const naFila = p.estado === "fila";
            return (
              <li key={p.id} className="flex items-center gap-3 py-[3px]">
                <div className="flex w-[38%] min-w-[120px] shrink-0 items-center gap-2 overflow-hidden">
                  {nivel > 0 && (
                    <span
                      aria-hidden
                      className="h-4 shrink-0 border-l border-border"
                      style={{ marginLeft: `${(nivel - 1) * 12 + 6}px`, width: "8px" }}
                    />
                  )}
                  <Icone
                    className={cn(
                      "size-3.5 shrink-0",
                      p.estado === "erro"
                        ? "text-destructive"
                        : naFila
                          ? "text-muted-foreground/50"
                          : p.tipo === "escrita"
                            ? "text-primary"
                            : "text-muted-foreground",
                    )}
                  />
                  <span
                    className={cn(
                      "truncate text-[12.5px]",
                      naFila ? "text-muted-foreground/50" : "text-foreground",
                    )}
                    title={p.nome}
                  >
                    {p.nome}
                  </span>
                  {p.tentativas && p.tentativas > 1 && (
                    <span className="shrink-0 rounded-[3px] border border-border px-1 font-mono text-[10px] leading-[14px] text-muted-foreground">
                      ×{p.tentativas}
                    </span>
                  )}
                </div>

                <div className="relative h-[7px] flex-1">
                  <span
                    ref={(el) => {
                      barras.current[i] = el;
                    }}
                    className="absolute top-0 h-[7px] overflow-hidden rounded-[2px] bg-foreground/[0.07]"
                    style={{
                      left: `${(p.inicioMs / total) * 100}%`,
                      width: `${Math.max((p.duracaoMs / total) * 100, 0.8)}%`,
                      ["--p" as string]: 1,
                    }}
                  >
                    <span
                      className={cn("block h-full origin-left rounded-[2px]", corDaBarra(p))}
                      style={{ transform: "scaleX(var(--p))" }}
                    />
                  </span>
                </div>

                <span
                  className={cn(
                    "hidden w-[104px] shrink-0 truncate text-right text-[11.5px] sm:block",
                    p.estado === "erro" ? "text-destructive" : "text-muted-foreground",
                  )}
                  title={p.resultado}
                >
                  {p.cache ? "cache" : p.resultado}
                </span>
                <span className="w-[58px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground/80">
                  {p.duracaoMs < 1000 ? `${p.duracaoMs}ms` : segundos(p.duracaoMs, 1)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <footer className="flex items-center gap-3 border-t border-border/60 px-3.5 py-2.5">
        <button
          type="button"
          onClick={reger}
          aria-label={tocando ? "Pausar" : "Tocar a execução"}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {tocando ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5 translate-x-px" />}
        </button>
        <div
          onPointerDown={arrastar}
          role="slider"
          tabIndex={0}
          aria-label="Posição na execução"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(t.current * 100)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            setTocando(false);
            t.current = Math.min(1, Math.max(0, t.current + (e.key === "ArrowRight" ? 0.05 : -0.05)));
            pintar();
          }}
          className="relative h-6 flex-1 cursor-pointer touch-none"
        >
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" aria-hidden />
          <span
            ref={knob}
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
            style={{ left: "100%" }}
            aria-hidden
          />
        </div>
        <span ref={relogio} className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {`${segundos(total)} / ${segundos(total)}`}
        </span>
      </footer>

      {execucao.desfecho && (
        <p className="border-t border-border/60 px-3.5 py-2 text-[12.5px] text-muted-foreground">
          {execucao.desfecho}
        </p>
      )}
    </div>
  );
}
