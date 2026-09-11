"use client";

import { PropostaJarvisInline, type PropostaInlineProps } from "./proposta-inline";

/**
 * O CARD DE PROPOSTA PARA /tarefas — v2 (W-J, 10/09/2026).
 *
 * É a MESMA nota do fio (`PropostaJarvisInline`), com o nome do lead no cabeçalho e o link para
 * a conversa no "ver no fio". A v1 tinha um segundo desenho compacto; a dieta tirou — a nota já
 * é cinco linhas, e a pessoa aprende um card só. Só recebe `estado: "proposta"`: o que foi
 * decidido vira tarefa (ou some) e a fila mostra a tarefa.
 */
export type PropostaTarefaCardProps = Omit<PropostaInlineProps, "mostrarLead" | "hrefTrecho"> & {
  hrefConversa?: string | null;
};

export function PropostaTarefaCard({ hrefConversa, ...resto }: PropostaTarefaCardProps) {
  return <PropostaJarvisInline {...resto} mostrarLead hrefTrecho={hrefConversa ?? undefined} />;
}
