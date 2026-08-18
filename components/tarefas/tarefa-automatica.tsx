"use client";

import { rotuloTipo } from "@/lib/tarefas/autonomia";
import { recusarDepois, reativar, type TarefaAutomatica } from "@/lib/tarefas/fila-prototipo";
import { cn } from "@/lib/utils";

/*
 * TAREFA QUE NASCEU SOZINHA — D10 (18/08).
 *
 * O tipo dela é `auto`: não há julgamento a fazer, então ela não pediu licença. Mas a D10 é
 * explícita sobre o que NÃO muda: "tarefa criada automaticamente ainda precisa mostrar o POR QUE.
 * O que muda é quem aprova, não a transparência."
 *
 * Daí as três coisas que este componente nunca abre mão:
 *  1. o POR QUE AGORA fica visível, com a frase da conversa citada — igual ao cartão de proposta;
 *  2. fica dito por que este tipo pôde nascer sozinho (o fundamento do teto), para a autonomia
 *     ser auditável na tela e não só na migration;
 *  3. tem RECUSAR depois do fato. A Sarah tem que poder discordar de uma tarefa que já nasceu —
 *     autonomia sem desfazer não é autonomia, é imposição.
 *
 * Recusar não APAGA a tarefa: ela fica marcada como recusada. Sumir com a linha esconderia o
 * único registro de que o Jarvis errou, e é justamente esse registro que ensina a config a
 * mudar de `auto` para `propor`.
 */

export function LinhaTarefaAutomatica({
  tarefa,
  compacta,
  aoMudar,
}: {
  tarefa: TarefaAutomatica;
  /** dentro da conversa o espaço é curto; na fila cabe o fundamento inteiro */
  compacta?: boolean;
  aoMudar?: () => void;
}) {
  const { proposta, fundamento, recusada } = tarefa;

  function alternar() {
    if (recusada) reativar(proposta.id);
    else recusarDepois(proposta.id);
    aoMudar?.();
  }

  return (
    <div
      className={cn(
        "rounded-[11px] border border-l-[3px] px-4 py-3",
        recusada ? "border-linha border-l-mute bg-board" : "border-linha border-l-navy bg-branco",
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-navy text-[0.6rem] font-bold text-branco">
          J
        </span>
        <span className="text-[0.76rem] font-semibold text-navy">
          {recusada ? "Tarefa recusada por você" : "Criada pelo Jarvis"}
        </span>
        <span className="text-[0.72rem] text-mute">· {rotuloTipo(proposta.tipoChave)}</span>
        <span className="ml-auto shrink-0 rounded-full bg-board px-1.5 py-px text-[0.62rem] font-semibold uppercase tracking-wide text-mute">
          protótipo
        </span>
      </div>

      <div className="text-[0.66rem] font-bold uppercase tracking-[0.06em] text-mute">Fazer</div>
      <p
        className={cn(
          "mt-0.5 text-[0.92rem] font-semibold leading-snug",
          recusada ? "text-mute line-through" : "text-navy",
        )}
      >
        {proposta.fazer}
      </p>

      <div className="mt-2.5 rounded-lg bg-board px-3 py-2.5">
        <div className="text-[0.66rem] font-bold uppercase tracking-[0.06em] text-mute">Por que agora</div>
        <p className="mt-1 text-[0.82rem] leading-relaxed text-tinta">{proposta.porqueAgora}</p>
        <blockquote className="mt-2 border-l-2 border-linha-forte pl-2.5">
          <p className="text-[0.79rem] italic leading-snug text-suave">“{proposta.trecho.texto}”</p>
          <footer className="mt-0.5 text-[0.68rem] text-mute">
            {proposta.trecho.autor} · {proposta.trecho.quando}
          </footer>
        </blockquote>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.74rem]">
        <span className="flex gap-1.5">
          <span className="text-mute">Prazo</span>
          <span className="font-medium text-tinta">{proposta.prazoSugerido}</span>
        </span>
        <span className="flex gap-1.5">
          <span className="text-mute">Responsável</span>
          <span className="font-medium text-tinta">{proposta.responsavelSugerido}</span>
        </span>
        <button
          onClick={alternar}
          className={cn(
            "ml-auto shrink-0 rounded-lg px-2.5 py-1.5 text-[0.78rem] font-medium transition-colors",
            recusada
              ? "text-navy hover:bg-hover"
              : "text-suave hover:bg-vermelho-bg hover:text-vermelho",
          )}
        >
          {recusada ? "Reativar" : "Recusar esta tarefa"}
        </button>
      </div>

      {/* a autonomia auditável na tela: por que este tipo pôde nascer sem perguntar */}
      {!compacta && (
        <p className="mt-2.5 border-t border-linha pt-2 text-[0.7rem] leading-snug text-mute">
          <b className="font-semibold text-suave">Nasceu sem perguntar porque:</b> {fundamento}
        </p>
      )}
    </div>
  );
}
