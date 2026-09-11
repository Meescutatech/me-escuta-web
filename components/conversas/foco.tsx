"use client";

import { useEffect } from "react";
import { ZapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversaEmFoco } from "@/lib/tarefas/foco";

/**
 * O MODO FOCO DENTRO DE /conversas (W-D3 v6, 11/09 — decisão do Diogo às 00:20: "o modo foco
 * agora É a tela de conversas").
 *
 * O que muda ao ligar: a LISTA passa a mostrar só as conversas cujo lead tem tarefa pendente sua,
 * na ordem de ataque (vencidas → hoje → futuras), e cada item mostra a TAREFA no lugar da prévia.
 * O que NÃO muda: a estrutura. Lista, fio e painel continuam exatamente onde estavam — ligar e
 * desligar troca conteúdo, nunca caixas, e por isso não há pulo. É o mesmo princípio do escopo de
 * departamento: o recorte entra como predicado, a moldura fica quieta.
 *
 * O gatilho é UM botão (raio), na linha da busca, com o número de tarefas esperando. Nada na
 * navbar: o foco é um jeito de olhar ESTA tela, não um lugar novo do app.
 */

export function BotaoFoco({ ligado, pendentes, onAlternar }: { ligado: boolean; pendentes: number; onAlternar: () => void }) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-pressed={ligado}
      title={ligado ? "Sair do foco" : pendentes > 0 ? `Foco: ${pendentes} ${pendentes === 1 ? "conversa espera" : "conversas esperam"} por você` : "Foco: nada esperando por você"}
      aria-label={ligado ? "Sair do modo foco" : `Entrar no modo foco — ${pendentes} conversas com tarefa pendente`}
      className={cn(
        "relative grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40",
        ligado ? "bg-laranja-cl text-laranja-esc" : "text-mute hover:bg-hover hover:text-navy",
      )}
    >
      <ZapIcon className={cn("size-4", ligado && "fill-current")} strokeWidth={2} />
      {!ligado && pendentes > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-[14px] min-w-[14px] place-items-center rounded-full bg-laranja px-[3px] text-[9px] font-bold leading-none text-branco ring-2 ring-branco">
          {pendentes > 9 ? "9+" : pendentes}
        </span>
      )}
    </button>
  );
}

/** A linha de contagem do topo da lista em foco — ocupa o lugar das abas, não soma altura. */
export function ContagemFoco({ linhas, feitas, onSair }: { linhas: ConversaEmFoco[]; feitas: number; onSair: () => void }) {
  const vencidas = linhas.filter((l) => l.tarefa.estado === "vencida").length;
  return (
    <div className="flex h-8 items-center gap-2 border-b border-linha px-3 text-[12px]">
      <span className="min-w-0 truncate">
        <span className="font-semibold text-tinta">
          {linhas.length} {linhas.length === 1 ? "conversa" : "conversas"} com tarefa
        </span>
        {vencidas > 0 && <span className="text-vermelho"> · {vencidas} {vencidas === 1 ? "vencida" : "vencidas"}</span>}
        {feitas > 0 && <span className="text-verde"> · {feitas} {feitas === 1 ? "feita" : "feitas"}</span>}
      </span>
      <button type="button" onClick={onSair} className="ml-auto shrink-0 text-[11.5px] text-suave underline-offset-2 hover:text-tinta hover:underline">
        sair do foco
      </button>
    </div>
  );
}

/** Fim da fila — dentro da própria lista, sem tela nova (Diogo: "estado zero por hoje"). */
export function FimDaFila({ feitas, onSair }: { feitas: number; onSair: () => void }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-[13px] font-medium text-tinta">Zero por hoje.</p>
      <p className="mt-1 text-[12px] leading-relaxed text-suave">
        {feitas > 0 ? (
          <>
            Você fechou {feitas} {feitas === 1 ? "conversa" : "conversas"} nesta rodada. Nada mais está esperando por você aqui.
          </>
        ) : (
          <>Nenhuma conversa com tarefa pendente sua. O que chegar de novo aparece aqui.</>
        )}
      </p>
      <button
        type="button"
        onClick={onSair}
        className="mt-3 rounded-lg border border-linha-forte px-3 py-1.5 text-[12.5px] font-medium text-navy transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40"
      >
        Sair do foco
      </button>
    </div>
  );
}

/**
 * Atalhos do foco: ⏎ concluir · A adiar · P pular · Esc sai. Só quando o teclado não está num
 * campo — digitar "a" numa resposta ao paciente não pode adiar tarefa nenhuma.
 */
export function useAtalhosFoco({
  ligado,
  onConcluir,
  onAdiar,
  onPular,
  onSair,
}: {
  ligado: boolean;
  onConcluir: () => void;
  onAdiar: () => void;
  onPular: () => void;
  onSair: () => void;
}) {
  useEffect(() => {
    if (!ligado) return;
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const digitando = !!alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      if (e.key === "Escape" && !digitando) {
        onSair();
        return;
      }
      if (digitando || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        onConcluir();
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        onAdiar();
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        onPular();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ligado, onConcluir, onAdiar, onPular, onSair]);
}
