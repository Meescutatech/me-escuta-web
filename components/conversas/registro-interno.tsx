"use client";

import Link from "next/link";
import { segmentosComMencao } from "@/lib/conversas/mencao";
import type { RegistroInterno as Registro } from "@/lib/conversas/registro-timeline";
import { dataHoraCurta } from "@/lib/dados/tarefa-calculos";
import { cn } from "@/lib/utils";

/**
 * Nota ou tarefa publicada, dentro da timeline da conversa (C2 · mockup estado f).
 * Ocupa a largura toda e não tem bolha: bolha é só do que trafega com o cliente. Nota = âmbar,
 * tarefa = navy, com uma barra na lateral esquerda que dá o estado a um relance na varredura.
 */
export function RegistroInterno({ registro }: { registro: Registro }) {
  const nota = registro.tipo === "nota";
  const segmentos = segmentosComMencao(registro.texto, registro.mencoes);

  // F2 / D62 · a tarefa que o JARVIS criou a partir desta conversa. É REGISTRO, não pedido:
  // sem botão de aprovar (criar_tarefa está em `auto`, 0297). O que a autonomia muda é quem
  // aprova, não a transparência — por isso o POR QUE e o trecho citado ficam à vista.
  if (!nota && registro.jarvis) {
    const j = registro.jarvis;
    return (
      <article className="self-stretch rounded-lg border border-l-2 border-tarefa-linha border-l-navy bg-tarefa-fundo px-3.5 py-2.5">
        <header className="mb-1 flex items-center gap-2">
          <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-navy text-[0.6rem] font-bold text-branco" aria-hidden>
            J
          </span>
          <span className="text-[11px] font-[650] uppercase tracking-[0.05em] text-navy">Jarvis criou tarefa</span>
          <span className="min-w-0 truncate text-[11.5px] text-suave">
            {registro.responsavel ? `para ${registro.responsavel}` : "sem responsável"}
          </span>
          <time dateTime={registro.criado_em} className="ml-auto shrink-0 font-mono text-[10.5px] tabular-nums text-suave">
            {dataHoraCurta(registro.criado_em)}
          </time>
        </header>

        <p className="break-words text-[13.5px] leading-normal text-tinta">
          <b className="font-semibold">{j.fazer}</b>
          {j.por_que && <span className="text-suave"> — {j.por_que}</span>}
        </p>

        {j.trecho && (
          <blockquote className="mt-1.5 border-l-2 border-linha-forte pl-2.5 text-[12.5px] italic leading-snug text-suave">
            “{j.trecho}”
          </blockquote>
        )}

        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-suave">
          {registro.prazo && (
            <span>
              Vence <b className="font-mono font-medium tabular-nums text-tinta">{dataHoraCurta(registro.prazo)}</b>
            </span>
          )}
          <Link
            href={`/tarefas?status=abertas#tarefa-${registro.id}`}
            className="font-medium text-navy underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
          >
            Ver tarefa
          </Link>
        </p>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "self-stretch rounded-lg border border-l-2 px-3.5 py-2.5",
        nota
          ? "border-nota-linha border-l-amarelo bg-nota-fundo"
          : "border-tarefa-linha border-l-navy bg-tarefa-fundo",
      )}
    >
      <header className="mb-1 flex items-center gap-2">
        <span
          className={cn(
            "text-[11px] font-[650] uppercase tracking-[0.05em]",
            nota ? "text-amarelo" : "text-navy",
          )}
        >
          {nota ? "Nota interna" : "Tarefa"}
        </span>
        <span className="min-w-0 truncate text-[11.5px] text-suave">
          {nota
            ? (registro.autor ?? "equipe")
            : registro.responsavel
              ? `para ${registro.responsavel}`
              : "sem responsável"}
        </span>
        <time
          dateTime={registro.criado_em}
          className="ml-auto shrink-0 font-mono text-[10.5px] tabular-nums text-suave"
        >
          {dataHoraCurta(registro.criado_em)}
        </time>
      </header>

      <p className="whitespace-pre-wrap break-words text-[13.5px] leading-normal text-tinta">
        {segmentos.map((s, i) =>
          s.tipo === "mencao" ? (
            <span
              key={i}
              className={cn(
                "rounded px-1 font-medium",
                s.alvo === "agente"
                  ? "bg-laranja-cl font-mono text-[12.5px] text-laranja-esc"
                  : "bg-bolha-out text-navy",
              )}
            >
              {s.texto}
            </span>
          ) : (
            <span key={i}>{s.texto}</span>
          ),
        )}
      </p>

      {!nota && registro.prazo && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-suave">
          <svg viewBox="0 0 24 24" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 stroke-current" fill="none">
            <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
            <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
          </svg>
          Vence <b className="font-mono font-medium tabular-nums text-tinta">{dataHoraCurta(registro.prazo)}</b>
        </p>
      )}
    </article>
  );
}
