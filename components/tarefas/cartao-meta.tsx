"use client";

import { MarcaJarvis } from "@/components/jarvis/marca";
import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import { iniciaisDe, nomeResponsavel } from "@/lib/dados/tarefa-calculos";
import { ROTULO_PRIORIDADE, textoPrazoHumano, type Prioridade } from "@/lib/tarefas/dia";
import { cn } from "@/lib/utils";

/*
 * Pedaços de cartão COMPARTILHADOS pelas exibições da /tarefas (funil por prazo, lista, quadro
 * por status — F8, e a fila do dia — W-D5). Saíram de visao-tarefas.tsx sem mudar uma classe: o
 * quadro precisava deles e importar de volta criaria ciclo (visao → quadro → visao).
 *
 * W-D5 (10/09) acrescentou dois sinais, os dois com canal escrito além da cor (WCAG 1.4.1):
 *  · ORIGEM — o Jarvis. `BadgeOrigem` é a MARCA do Jarvis (components/jarvis/marca.tsx, o ARCO
 *    escolhido pelo Diogo às 22:40), em muted, sem o nome ao lado — a marca É a assinatura.
 *    Antes era um selo `JARVIS` em caixa alta dentro do POR QUE.
 *  · PRIORIDADE — `alta / média / baixa`. A cor fica no TRILHO ESQUERDO do card (`RailPrioridade`)
 *    e num chip pequeno na linha de meta. Só `alta` carrega cor (navy); média é o silêncio (é a
 *    maioria); baixa é um chip apagado. Vermelho segue reservado a VENCIDA — prioridade é
 *    importância, prazo é urgência, e os dois não podem disputar o mesmo tom.
 */

/** v2 (22:40): só o ARCO, em muted — a marca é a assinatura; o nome não se repete. */
export function BadgeOrigem({ t, apagada, className }: { t: Pick<TarefaVisao, "origem">; apagada?: boolean; className?: string }) {
  if (t.origem !== "jarvis_conversa") return null;
  return (
    <MarcaJarvis
      tamanho={16}
      rotulo="Criada pelo Jarvis a partir da conversa"
      className={cn("inline-block", apagada ? "text-mute/60" : "text-mute", className)}
    />
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
    <div className={cn("mt-0.5 text-[12.5px] leading-snug", apagada ? "text-mute/80" : "text-mute")}>
      {t.por_que && (
        <p className="flex items-start gap-1.5">
          <BadgeOrigem t={t} apagada={apagada} className="mt-px shrink-0" />
          <span className="min-w-0">{t.por_que}</span>
        </p>
      )}
      {t.trecho && <p className="mt-0.5 pl-[22px] italic">“{t.trecho}”</p>}
    </div>
  );
}

/**
 * v3 (23:20) · a MESMA segunda linha da lista (linha.tsx), para o card do quadro: prazo (vermelho
 * só se venceu) · avatar 18px + primeiro nome · tipo em texto. Sem chip — a dieta do Diogo.
 */
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
    <div className={cn("flex flex-wrap items-center gap-x-2 text-[12.5px]", apagada ? "text-mute/80" : "text-mute")}>
      <span className={cn(t.vencida && !apagada && "font-medium text-vermelho")}>{textoPrazoHumano(t, agora)}</span>
      {quem && (
        <>
          <span aria-hidden className="text-linha-forte">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("grid size-[18px] place-items-center rounded-full text-[8px] font-semibold text-branco", apagada ? "bg-mute" : "bg-navy")} aria-hidden>
              {iniciaisDe(quem)}
            </span>
            {quem.split(/\s+/)[0]}
          </span>
        </>
      )}
      {t.tipo && (
        <>
          <span aria-hidden className="text-linha-forte">·</span>
          <span>{nomes.tipos.get(t.tipo) ?? t.tipo}</span>
        </>
      )}
    </div>
  );
}
