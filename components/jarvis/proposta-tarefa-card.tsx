"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MarcaJarvis } from "./marca";
import { RAIL, prazoUrgente, tempoDesde, textoPrazo } from "./partes";
import { PropostaJarvisInline } from "./proposta-inline";
import type { AjusteProposta, MotivoDescarte, Pessoa, PropostaJarvis } from "./tipos";

/**
 * O CARD DE PROPOSTA PARA /tarefas (W-J, 10/09/2026).
 *
 * Em /tarefas a proposta compete com a fila inteira pela atenção, então o card é COMPACTO — quatro
 * linhas: quem (lead), o quê (FAZER em negrito), por quê (uma linha) e a evidência (o trecho, uma
 * linha). Prazo e responsável ficam no rodapé com as três ações. Mesma superfície âmbar tostado e
 * mesmo rail do card do fio: é a MESMA proposta, só que vista da fila.
 *
 * "Ajustar" e "Descartar" não abrem um segundo desenho: o card EXPANDE para o `PropostaJarvisInline`
 * já no modo pedido, e "Voltar"/"Pronto" o trazem de volta ao compacto. Um formulário só, dois
 * tamanhos — e a pessoa aprende o card uma vez.
 *
 * Só recebe propostas em estado `proposta`: o que já foi decidido vira tarefa (ou some) e a fila
 * mostra a tarefa, não a proposta.
 */

export interface PropostaTarefaCardProps {
  proposta: PropostaJarvis;
  responsaveis?: Pessoa[];
  hrefConversa?: string | null;
  onAceitar?: (proposta: PropostaJarvis, ajuste: AjusteProposta | null) => void;
  onDescartar?: (proposta: PropostaJarvis, motivo: MotivoDescarte, observacao: string | null) => void;
  agoraMs?: number;
  className?: string;
}

export function PropostaTarefaCard({ proposta: p, responsaveis = [], hrefConversa, onAceitar, onDescartar, agoraMs, className }: PropostaTarefaCardProps) {
  const [expandido, setExpandido] = useState<null | "ajustar" | "descartar">(null);
  const agora = agoraMs ?? Date.now();

  if (expandido) {
    return (
      <PropostaJarvisInline
        proposta={p}
        responsaveis={responsaveis}
        hrefTrecho={hrefConversa ?? undefined}
        modoInicial={expandido}
        onVoltar={() => setExpandido(null)}
        onAceitar={(prop, ajuste) => {
          onAceitar?.(prop, ajuste);
          setExpandido(null);
        }}
        onDescartar={(prop, motivo, obs) => {
          onDescartar?.(prop, motivo, obs);
          setExpandido(null);
        }}
        agoraMs={agora}
        className={className}
      />
    );
  }

  const urgente = prazoUrgente(p.prazo, agora);

  return (
    <article
      className={cn("rounded-lg border border-l-[3px] border-tarefa-linha bg-tarefa-fundo px-3.5 py-2.5", RAIL[p.estado], className)}
      aria-label="Proposta de tarefa do Jarvis"
    >
      <header className="flex items-center gap-2">
        <MarcaJarvis tamanho={16} />
        <span className="text-[11.5px] font-semibold text-navy">Jarvis propõe</span>
        <span className="text-[11.5px] text-suave">{tempoDesde(p.criado_em, agora)}</span>
        {p.lead_nome && (
          <span className="ml-auto min-w-0 truncate text-[12.5px] font-medium text-tinta">
            {hrefConversa ? (
              <a href={hrefConversa} className="underline-offset-2 hover:underline">
                {p.lead_nome}
              </a>
            ) : (
              p.lead_nome
            )}
          </span>
        )}
      </header>

      <p className="mt-1.5 text-[14px] font-semibold leading-snug text-tinta">{p.fazer}</p>
      <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-normal text-suave">{p.por_que}</p>
      {p.trecho && <p className="mt-1 truncate text-[12px] italic text-suave">“{p.trecho}”</p>}

      <footer className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
        <span className={cn(urgente ? "font-semibold text-vermelho" : "text-tinta")}>{textoPrazo(p.prazo)}</span>
        <span className="text-suave">{p.responsavel_nome ?? "sem responsável"}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAceitar?.(p, null)}
            className="rounded-md bg-laranja px-3 py-1 text-[12.5px] font-semibold text-branco transition-colors hover:bg-laranja-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45"
          >
            Aceitar
          </button>
          <button
            type="button"
            onClick={() => setExpandido("ajustar")}
            className="rounded-md border border-tarefa-linha bg-branco px-2.5 py-1 text-[12.5px] font-medium text-navy transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45"
          >
            Ajustar
          </button>
          <button
            type="button"
            onClick={() => setExpandido("descartar")}
            className="rounded-md px-2 py-1 text-[12.5px] text-suave transition-colors hover:bg-hover hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45"
          >
            Descartar
          </button>
        </span>
      </footer>
    </article>
  );
}
