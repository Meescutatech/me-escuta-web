"use client";

import { ORDEM_ABAS, ROTULO_ABA, type Aba } from "@/lib/tarefas/dia";
import { cn } from "@/lib/utils";

/*
 * AS QUATRO ABAS DA /tarefas (W-D5, 10/09): Hoje · Semana · Todas · Do time.
 *
 * Hoje é a tela de entrada da SDR (view própria); as outras três são RECORTES sobre a mesma
 * tela de sempre (colunas por prazo / lista / quadro): Semana = minhas até domingo, Todas =
 * minhas, Do time = todo mundo. A aba acesa é DERIVADA dos filtros (lib/tarefas/dia.ts
 * `abaAtiva`), então um link com filtros próprios acende nenhuma — e isso é o estado honesto.
 *
 * Desenho: texto com sublinhado de 2px (o mesmo idioma das abas do painel do lead), contagem em
 * mono ao lado. Sem caixa, sem pílula: é navegação, não filtro.
 */
export function AbasTarefas({
  ativa,
  contagem,
  onEscolher,
  semMeuId,
}: {
  ativa: Aba | null;
  contagem: Record<Aba, number>;
  onEscolher: (aba: Aba) => void;
  /** sem usuário não há "minhas" — Hoje/Semana/Todas ficam desabilitadas com o motivo */
  semMeuId: boolean;
}) {
  return (
    <nav aria-label="Recorte de tarefas" className="-mb-px flex items-end gap-0.5">
      {ORDEM_ABAS.map((aba) => {
        const eh = aba === ativa;
        const bloqueada = semMeuId && aba !== "time";
        return (
          <button
            key={aba}
            type="button"
            onClick={() => onEscolher(aba)}
            disabled={bloqueada}
            title={bloqueada ? "Sem usuário na sessão — só o recorte do time está disponível" : undefined}
            aria-current={eh ? "page" : undefined}
            className={cn(
              "inline-flex items-baseline gap-1.5 border-b-2 px-2 pb-1.5 pt-1 text-[13px] font-medium transition-colors disabled:opacity-40",
              eh ? "border-navy text-navy" : "border-transparent text-suave hover:border-linha-forte hover:text-tinta",
            )}
          >
            {ROTULO_ABA[aba]}
            <span className={cn("font-mono text-[11px] tabular-nums", eh ? "text-navy/80" : "text-mute")}>{contagem[aba]}</span>
          </button>
        );
      })}
    </nav>
  );
}
