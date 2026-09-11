"use client";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import { ResumoJarvisBloco } from "./resumo-jarvis";
import { cn } from "@/lib/utils";

/*
 * O RESUMO DO JARVIS SAIU DO TOGGLE E FOI PARA O HOVER (11/09, pedido explícito do Diogo).
 *
 * Por que a mudança é maior do que parece: no toggle, ler o resumo custava um clique, uma
 * expansão e uma lista que se mexia — e depois um segundo clique para desfazer. Quem varre 16
 * tarefas de manhã não paga esse pedágio 16 vezes; paga uma ou duas e passa a decidir pelo
 * título. Com o resumo no hover, saber POR QUE a tarefa existe passa a custar o mesmo que passar
 * o mouse: a leitura vira parte de varrer a lista, não uma interrupção dela.
 *
 * Três regras de desenho:
 *
 * 1. **Não empurra nada.** O popover é portal, ancorado ao lado — a lista fica parada. Era o
 *    defeito que o toggle tinha por construção: abrir a linha 3 muda de lugar as linhas 4 a 16.
 * 2. **Não rouba o clique.** O gatilho é um `span` dentro do alvo que já leva à conversa; o
 *    clique continua abrindo o fio. Hover mostra, clique navega — cada gesto com um destino.
 * 3. **Atraso de 220 ms.** Sem ele, arrastar o mouse pela lista acende seis popovers em cascata.
 *    Com ele, só acende onde a pessoa parou — que é onde ela está olhando.
 *
 * Sem resumo gravado (a leitura real de hoje) o gatilho NÃO existe: `ComResumoNoHover` devolve as
 * crianças puras. Popover vazio prometendo contexto é pior que nenhum popover.
 */

export function ComResumoNoHover({
  t,
  onVerNoFio,
  className,
  children,
}: {
  t: TarefaVisao;
  onVerNoFio?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  if (!t.resumo) return <>{children}</>;
  return (
    <HoverCard>
      <HoverCardTrigger delay={220} closeDelay={80} render={<span className={cn("min-w-0", className)}>{children}</span>} />
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-[min(520px,calc(100vw-48px))] p-3.5"
        onClick={(e) => e.stopPropagation()}
      >
        <ResumoJarvisBloco resumo={t.resumo} t={t} onVerNoFio={onVerNoFio} />
      </HoverCardContent>
    </HoverCard>
  );
}
