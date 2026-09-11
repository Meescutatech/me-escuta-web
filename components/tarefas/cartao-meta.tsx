"use client";

import { MarcaJarvis } from "@/components/jarvis/marca";
import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import { iniciaisDe, nomeResponsavel, textoPrazo } from "@/lib/dados/tarefa-calculos";
import { ROTULO_PRIORIDADE, type Prioridade } from "@/lib/tarefas/dia";
import { cn } from "@/lib/utils";

/*
 * Pedaços de cartão COMPARTILHADOS pelas exibições da /tarefas (funil por prazo, lista, quadro
 * por status — F8, e a fila do dia — W-D5). Saíram de visao-tarefas.tsx sem mudar uma classe: o
 * quadro precisava deles e importar de volta criaria ciclo (visao → quadro → visao).
 *
 * W-D5 (10/09) acrescentou dois sinais, os dois com canal escrito além da cor (WCAG 1.4.1):
 *  · ORIGEM — o Jarvis. `BadgeOrigem` é a MARCA do Jarvis (components/jarvis/marca.tsx, o
 *    monograma J com o ponto laranja — uma cara só para ele no app) + "Jarvis". Antes era um
 *    selo `JARVIS` em caixa alta dentro do POR QUE; agora é um só desenho, reutilizado onde a
 *    origem precisa aparecer mesmo sem o POR QUE (linha compacta da fila do dia).
 *  · PRIORIDADE — `alta / média / baixa`. A cor fica no TRILHO ESQUERDO do card (`RailPrioridade`)
 *    e num chip pequeno na linha de meta. Só `alta` carrega cor (navy); média é o silêncio (é a
 *    maioria); baixa é um chip apagado. Vermelho segue reservado a VENCIDA — prioridade é
 *    importância, prazo é urgência, e os dois não podem disputar o mesmo tom.
 */

export function BadgeOrigem({ t, apagada, className }: { t: Pick<TarefaVisao, "origem">; apagada?: boolean; className?: string }) {
  if (t.origem !== "jarvis_conversa") return null;
  return (
    <span
      title="Criada pelo Jarvis a partir da conversa"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border py-px pl-1 pr-1.5 text-[10.5px] font-semibold leading-[14px]",
        apagada ? "border-linha text-mute opacity-70" : "border-[#D5DDF3] bg-[#EEF1FB] text-navy",
        className,
      )}
    >
      <MarcaJarvis tamanho={16} className="-ml-0.5" />
      Jarvis
    </span>
  );
}

/** o trilho de 3px à esquerda — só existe para `alta` e `media`; baixa não tem trilho */
export function RailPrioridade({ prioridade }: { prioridade: Prioridade | null | undefined }) {
  if (!prioridade || prioridade === "baixa") return null;
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute bottom-0 left-0 top-0 w-[3px] rounded-l-[10px]",
        prioridade === "alta" ? "bg-navy" : "bg-navy/30",
      )}
    />
  );
}

export function ChipPrioridade({ prioridade, apagada }: { prioridade: Prioridade | null | undefined; apagada?: boolean }) {
  if (!prioridade || prioridade === "media") return null;
  return (
    <span
      className={cn(
        "rounded-full border px-1.5 py-px text-[10.5px] font-medium leading-[14px]",
        apagada
          ? "border-linha text-mute"
          : prioridade === "alta"
            ? "border-navy/25 bg-[#EAECF5] font-semibold text-navy"
            : "border-linha bg-board text-mute",
      )}
    >
      {ROTULO_PRIORIDADE[prioridade]}
    </span>
  );
}

/**
 * F2 / D62 · o POR QUE e o TRECHO da tarefa que o Jarvis criou (0298). Só existe quando existe:
 * tarefa humana não ganha bloco vazio. O que a autonomia muda é quem aprova, não a transparência.
 */
export function PorQueJarvis({ t, apagada }: { t: TarefaVisao; apagada?: boolean }) {
  if (!t.por_que && !t.trecho) return null;
  return (
    <div className={cn("mt-1 text-[12px] leading-snug", apagada ? "text-mute" : "text-suave")}>
      {t.por_que && (
        <p>
          <BadgeOrigem t={t} apagada={apagada} className="mr-1.5 align-[1px]" />
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
      <ChipPrioridade prioridade={t.prioridade} apagada={apagada} />
      {t.tipo && (
        <span className="rounded-full border border-linha bg-board px-2 py-px text-[10.5px]">
          {nomes.tipos.get(t.tipo) ?? t.tipo}
        </span>
      )}
    </div>
  );
}
