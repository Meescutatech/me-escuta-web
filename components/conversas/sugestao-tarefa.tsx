"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/*
 * O JARVIS SUGERE A TAREFA — workshop 12/08:
 * "o Jarvis podia ficar monitorando a conversa e sugerir uma tarefa. Ele faz a sugestão e ela só
 *  clica pra aprovar ou não."
 *
 * É o princípio da casa inteiro num cartão: o agente PROPÕE, a humana NOMEADA valida. Não existe
 * caminho em que este cartão vire tarefa sozinho.
 *
 * O MOTIVO É CAMPO OBRIGATÓRIO, e não enfeite. Sem ele a Sarah não confia — e com razão: "criar
 * tarefa: ligar amanhã" sem dizer de onde saiu é uma ordem, não uma sugestão. Por isso o tipo
 * exige `motivo` e `trecho`: a frase da conversa que disparou a proposta fica CITADA no cartão, e
 * é ela que deixa a decisão caber nos 3 segundos.
 *
 * Reaproveita a linguagem visual da sugestão da Clara que já existe no inbox (card branco, borda
 * esquerda 3px laranja) — mesma promessa, mesma forma.
 */

export interface SugestaoTarefa {
  id: string;
  /** o que fazer — imperativo curto, é o título do cartão */
  titulo: string;
  /** POR QUE. Obrigatório no tipo: sugestão sem motivo não pode nem ser construída. */
  motivo: string;
  /** a frase do cliente que disparou a proposta — a evidência, citada */
  trecho: { texto: string; quando: string; autor: string };
  tipo: string; // "Ligar", "Enviar mensagem", "Agendar audiometria"…
  prazoSugerido: string; // já formatado: "amanhã, 09:00"
  responsavelSugerido: string;
}

type Decisao = "aprovada" | "recusada";

export function CartaoSugestaoTarefa({
  sugestao,
  onDecidir,
  decisaoInicial = null,
  agente = "Jarvis",
}: {
  sugestao: SugestaoTarefa;
  onDecidir?: (id: string, decisao: Decisao) => void;
  /**
   * Decisão já tomada nesta sessão. Existe porque a regra continua produzindo a mesma sugestão
   * depois que a pessoa decidiu — e re-propor o que ela acabou de recusar é a forma mais rápida
   * de um agente perder a confiança que o motivo comprou.
   */
  decisaoInicial?: Decisao | null;
  agente?: string;
}) {
  const [decisao, setDecisao] = useState<Decisao | null>(decisaoInicial);

  function decidir(d: Decisao) {
    setDecisao(d);
    onDecidir?.(sugestao.id, d);
  }

  if (decisao) {
    return (
      <div
        className={cn(
          "self-stretch rounded-[11px] border px-4 py-3",
          decisao === "aprovada" ? "border-verde-bd bg-verde-bg" : "border-linha bg-board",
        )}
      >
        <div className="flex items-center gap-2">
          {decisao === "aprovada" ? (
            <svg viewBox="0 0 24 24" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 stroke-verde" fill="none">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" strokeWidth={2.4} strokeLinecap="round" className="h-4 w-4 shrink-0 stroke-mute" fill="none">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          )}
          <span className={cn("text-[0.84rem] font-medium", decisao === "aprovada" ? "text-verde" : "text-suave")}>
            {decisao === "aprovada" ? `Tarefa aprovada: ${sugestao.titulo}` : "Sugestão recusada"}
          </span>
          <span className="ml-auto shrink-0 rounded-full bg-branco px-1.5 py-px text-[0.62rem] font-semibold uppercase tracking-wide text-mute">
            protótipo
          </span>
        </div>
        <p className="mt-1 pl-6 text-[0.72rem] text-mute">
          {decisao === "aprovada"
            ? "No sistema real isto vira um evento no ledger com o seu nome como quem validou."
            : "O Jarvis registra a recusa e para de sugerir isso nesta conversa."}
        </p>
      </div>
    );
  }

  return (
    <div className="self-stretch rounded-[11px] border border-linha border-l-[3px] border-l-laranja bg-branco px-4 py-3.5 shadow-[0_1px_6px_rgba(37,47,99,.05)]">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-navy text-[0.6rem] font-bold text-branco">
          {agente[0]}
        </span>
        <span className="text-[0.76rem] font-semibold text-laranja-esc">{agente} sugere uma tarefa</span>
        <span className="text-[0.72rem] text-mute">· não criada</span>
        <span className="ml-auto shrink-0 rounded-full bg-board px-1.5 py-px text-[0.62rem] font-semibold uppercase tracking-wide text-mute">
          protótipo
        </span>
      </div>

      {/* O QUE FAZER */}
      <p className="text-[0.95rem] font-semibold leading-snug text-navy">{sugestao.titulo}</p>

      {/* POR QUE — o campo que faz a Sarah confiar. Rotulado, não subentendido. */}
      <div className="mt-2.5 rounded-lg bg-board px-3 py-2.5">
        <div className="text-[0.66rem] font-bold uppercase tracking-[0.06em] text-mute">Por que</div>
        <p className="mt-1 text-[0.82rem] leading-relaxed text-tinta">{sugestao.motivo}</p>
        <blockquote className="mt-2 border-l-2 border-linha-forte pl-2.5">
          <p className="text-[0.79rem] italic leading-snug text-suave">“{sugestao.trecho.texto}”</p>
          <footer className="mt-0.5 text-[0.68rem] text-mute">
            {sugestao.trecho.autor} · {sugestao.trecho.quando}
          </footer>
        </blockquote>
      </div>

      {/* o que a tarefa seria, se aprovada */}
      <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.74rem]">
        <div className="flex gap-1.5">
          <dt className="text-mute">Tipo</dt>
          <dd className="font-medium text-tinta">{sugestao.tipo}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-mute">Prazo</dt>
          <dd className="font-medium text-tinta">{sugestao.prazoSugerido}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-mute">Responsável</dt>
          <dd className="font-medium text-tinta">{sugestao.responsavelSugerido}</dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => decidir("aprovada")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-laranja px-4 py-2 text-[0.82rem] font-semibold text-branco transition-colors hover:bg-laranja-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50"
        >
          <svg viewBox="0 0 24 24" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 stroke-current" fill="none">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Aprovar tarefa
        </button>
        <button
          onClick={() => decidir("recusada")}
          className="rounded-lg px-3 py-2 text-[0.82rem] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
        >
          Recusar
        </button>
      </div>
    </div>
  );
}
