"use client";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { PesoTarefa } from "@/lib/tarefas/prioridade";
import { cn } from "@/lib/utils";

/*
 * O NÚMERO DA POSIÇÃO, E O PORQUÊ DELE (11/09 — "priorização é o que eu mais quero ver").
 *
 * Uma ordem automática só ajuda enquanto dá para conferir. Passar o mouse na posição abre a CONTA:
 * cada fator com o nome dele e quantos pontos somou, e o total embaixo. Se a primeira linha estiver
 * errada, dá para apontar qual fator errou — que é a diferença entre uma ordem e um oráculo.
 *
 * A posição é um número mono num trilho de largura fixa: a lista não pode andar de lado quando o
 * número passa de 9 para 10.
 */

export function PosicaoUrgencia({
  posicao,
  total,
  peso,
  className,
}: {
  posicao: number;
  /** quantas tarefas há na fila — o "de N" da frase */
  total: number;
  peso: PesoTarefa;
  className?: string;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={140}
        closeDelay={60}
        render={
          <span
            className={cn(
              "mt-[3px] w-6 shrink-0 cursor-help text-right font-mono text-[12px] tabular-nums",
              posicao === 1 ? "font-semibold text-tinta" : "text-mute",
              className,
            )}
            aria-label={`${posicao}ª mais urgente de ${total}`}
          >
            {posicao}
          </span>
        }
      />
      <HoverCardContent side="bottom" align="start" sideOffset={6} className="w-[300px] p-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-[12px] font-medium text-tinta">
          {posicao === 1 ? "Por que esta é a primeira" : `Por que está em ${posicao}º de ${total}`}
        </p>
        {peso.fatores.length === 0 ? (
          <p className="mt-1.5 text-[12.5px] leading-snug text-mute">
            Nada a favor nem contra: sem prazo, sem prioridade e sem sinal do lead. Ela fica onde a fila deixar.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {peso.fatores.map((f) => (
              <li key={f.chave} className="flex items-baseline gap-2 text-[12.5px] leading-snug">
                <span className={cn("min-w-0 flex-1", f.pontos > 0 ? "text-suave" : "text-mute")}>{f.texto}</span>
                <span className={cn("shrink-0 font-mono text-[11.5px] tabular-nums", f.pontos > 0 ? "text-mute" : "text-mute/70")}>
                  {f.pontos > 0 ? `+${f.pontos}` : f.pontos}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex items-baseline gap-2 border-t border-linha pt-1.5 text-[12px]">
          <span className="min-w-0 flex-1 text-mute">peso</span>
          <span className="shrink-0 font-mono tabular-nums text-tinta">{peso.total}</span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
