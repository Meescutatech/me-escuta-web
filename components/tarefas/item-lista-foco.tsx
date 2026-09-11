"use client";

import { MarcaJarvis } from "@/components/jarvis/marca";
import type { ConversaEmFoco, EstadoPrazo } from "@/lib/tarefas/foco";
import { cn } from "@/lib/utils";

/*
 * O ITEM DA LISTA DE CONVERSAS EM MODO FOCO (W-T para o W-D3, 11/09).
 *
 * A troca que o modo foco faz na lista é uma só, e é a que importa: a primeira linha deixa de ser
 * a PRÉVIA DA MENSAGEM e passa a ser A TAREFA. Fora do foco a pergunta é "o que ele me disse?";
 * dentro dele é "o que eu devo a ele?" — e a prévia, que responde a primeira, desce para a
 * segunda linha em muted (ela não sai: é ela que diz se a tarefa ainda faz sentido).
 *
 * Só o MIOLO do item vem daqui. O avatar, o clique, o estado de selecionado, o ponto de não-lida e
 * a largura são do inbox — este componente entra dentro do botão que já existe, para o modo foco
 * não virar uma segunda lista de conversas com regras próprias.
 *
 * Cor do prazo: vermelho só quando VENCEU. Hoje é neutro com peso, futura é muted. O Kommo pinta
 * 755 de 771 abertas de vermelho (benchmark §5.1) e por isso ninguém olha mais para o vermelho
 * dele — cor que aparece sempre não é sinal.
 */

const TOM: Record<EstadoPrazo, string> = {
  vencida: "font-medium text-vermelho",
  hoje: "text-suave",
  futura: "text-mute",
};

const FMT_HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const FMT_DIA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/** "venceu ontem · 16:57" · "vence hoje · 18:00" · "sex, 12/09" · "sem prazo" */
export function textoPrazoFoco(prazo: string | null, estado: EstadoPrazo, agoraMs: number): string {
  if (!prazo) return "sem prazo";
  const ms = new Date(prazo).getTime();
  if (!Number.isFinite(ms)) return "sem prazo";
  const dia = 86_400_000;
  const emDias = Math.round((new Date(ms).setHours(0, 0, 0, 0) - new Date(agoraMs).setHours(0, 0, 0, 0)) / dia);
  if (estado === "hoje") return `vence hoje · ${FMT_HORA.format(new Date(ms))}`;
  if (estado === "vencida") return emDias === 0 ? `venceu hoje · ${FMT_HORA.format(new Date(ms))}` : emDias === -1 ? `venceu ontem · ${FMT_HORA.format(new Date(ms))}` : `venceu ${FMT_DIA.format(new Date(ms))}`;
  if (emDias === 1) return `amanhã · ${FMT_HORA.format(new Date(ms))}`;
  return `${FMT_DIA.format(new Date(ms))} · ${FMT_HORA.format(new Date(ms))}`;
}

export function ItemListaFoco({
  linha,
  agoraMs,
  /** a prévia da última mensagem que o inbox já tem — desce para a 2ª linha */
  previa,
  /** rótulo do tipo, resolvido por quem desenha (o dado é a chave) */
  rotuloTipo,
  className,
}: {
  linha: ConversaEmFoco;
  agoraMs: number;
  previa?: string | null;
  rotuloTipo?: string | null;
  className?: string;
}) {
  const { tarefa } = linha;
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-tinta">{linha.lead_nome ?? "Lead"}</span>
        <span className={cn("shrink-0 text-[11.5px] tabular-nums", TOM[tarefa.estado])}>{textoPrazoFoco(tarefa.prazo, tarefa.estado, agoraMs)}</span>
      </div>

      {/* A TAREFA no lugar da prévia — é a linha que muda no modo foco */}
      <p className="flex min-w-0 items-start gap-1.5">
        {tarefa.doJarvis && <MarcaJarvis tamanho={16} rotulo="Criada pelo Jarvis" className="mt-px shrink-0 text-mute" />}
        <span className="min-w-0 flex-1 truncate text-[13px] leading-snug text-tinta">{tarefa.titulo}</span>
        {linha.outras > 0 && (
          <span className="shrink-0 text-[11px] text-mute" title={`${linha.outras + 1} tarefas pendentes com este paciente`}>
            +{linha.outras}
          </span>
        )}
      </p>

      {(previa || rotuloTipo) && (
        <p className="flex min-w-0 items-baseline gap-1.5 text-[12px] text-mute">
          {rotuloTipo && <span className="shrink-0">{rotuloTipo}</span>}
          {rotuloTipo && previa && <span aria-hidden className="shrink-0 text-linha-forte">·</span>}
          {previa && <span className="min-w-0 truncate">{previa}</span>}
        </p>
      )}
    </div>
  );
}
