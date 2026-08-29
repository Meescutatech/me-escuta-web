"use client";

import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import { iniciaisDe, nomeResponsavel, textoPrazo } from "@/lib/dados/tarefa-calculos";
import { cn } from "@/lib/utils";

/*
 * Pedaços de cartão COMPARTILHADOS pelas três exibições da /tarefas (funil por prazo, lista,
 * quadro por status — F8). Saíram de visao-tarefas.tsx sem mudar uma classe: o quadro precisava
 * deles e importar de volta criaria ciclo (visao → quadro → visao).
 */

/**
 * F2 / D62 · o POR QUE e o TRECHO da tarefa que o Jarvis criou (0298). Só existe quando existe:
 * tarefa humana não ganha bloco vazio. O que a autonomia muda é quem aprova, não a transparência.
 */
export function PorQueJarvis({ t, apagada }: { t: TarefaVisao; apagada?: boolean }) {
  if (!t.por_que && !t.trecho) return null;
  const jarvis = t.origem === "jarvis_conversa";
  return (
    <div className={cn("mt-1 text-[12px] leading-snug", apagada ? "text-mute" : "text-suave")}>
      {t.por_que && (
        <p>
          {jarvis && (
            <span className="mr-1.5 rounded-full bg-navy px-1.5 py-px font-mono text-[9.5px] font-semibold uppercase tracking-wide text-branco">
              Jarvis
            </span>
          )}
          {t.por_que}
        </p>
      )}
      {t.trecho && (
        <blockquote className="mt-0.5 border-l-2 border-linha-forte pl-2 italic">“{t.trecho}”</blockquote>
      )}
    </div>
  );
}

export function MetaTarefa({
  t,
  agora,
  nomes,
  apagada,
}: {
  t: TarefaVisao;
  agora: number;
  nomes: { membros: Map<string, string>; tipos: Map<string, string> };
  apagada?: boolean;
}) {
  const quem = nomeResponsavel(t, nomes.membros);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]", apagada ? "text-mute" : "text-suave")}>
      {quem && (
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[8.5px] font-semibold text-branco",
              apagada ? "bg-mute" : "bg-navy",
            )}
          >
            {iniciaisDe(quem)}
          </span>
          {quem}
        </span>
      )}
      {quem && <span className="text-linha">·</span>}
      <span className={cn("font-mono tabular-nums", t.vencida && "font-semibold text-vermelho")}>
        {textoPrazo(t, agora)}
      </span>
      {t.tipo && (
        <span className="rounded-full border border-linha bg-board px-2 py-px text-[10.5px]">
          {nomes.tipos.get(t.tipo) ?? t.tipo}
        </span>
      )}
    </div>
  );
}

