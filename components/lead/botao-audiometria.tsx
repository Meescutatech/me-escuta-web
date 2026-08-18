"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/*
 * BOTÃO GIGANTE DE AUDIOMETRIA — workshop 12/08:
 * "a primeira coisa que deveria ter embaixo do nome é um botão gigante, audiometria, aquele V
 *  verdinho ou o X vermelho" · "é o principal gate de tomada de decisão".
 *
 * A Sarah confirmou que agendar audiometria é a maior dificuldade dela com todo lead que chega.
 * Então este é o único elemento da tela do lead que pode ser grande: ele responde, sem clique e
 * sem rolagem, a pergunta que decide o que ela faz a seguir.
 *
 * TRÊS estados, não dois. "Não sei" é um estado real — a maioria dos leads que chegam está nele,
 * e desenhar só V/X obrigaria a UI a chutar um dos dois. O estado indefinido é o que pede ação;
 * os resolvidos apenas informam, e ficam menores.
 *
 * Protótipo: a decisão fica em useState. No sistema real vira evento no ledger com quem marcou.
 */

export type EstadoAudiometria = "indefinido" | "fez" | "nao_fez";

export function BotaoAudiometria({
  inicial = "indefinido",
  quandoTexto,
  onMarcar,
}: {
  inicial?: EstadoAudiometria;
  /** "12/08 · marcado por Sarah" — só existe quando já resolvido */
  quandoTexto?: string;
  onMarcar?: (estado: EstadoAudiometria) => void;
}) {
  const [estado, setEstado] = useState<EstadoAudiometria>(inicial);
  const [tocado, setTocado] = useState(false);

  function marcar(novo: EstadoAudiometria) {
    setEstado(novo);
    setTocado(true);
    onMarcar?.(novo);
  }

  const legenda = tocado ? "marcado agora · protótipo, não salvo" : quandoTexto;

  if (estado === "indefinido") {
    return (
      <div className="rounded-xl border-[1.5px] border-dashed border-linha-forte bg-branco p-3">
        <div className="mb-2.5 flex items-baseline gap-2">
          <span className="text-[0.7rem] font-bold uppercase tracking-[0.07em] text-mute">Audiometria</span>
          <span className="text-[0.74rem] text-suave">— ainda não sabemos</span>
        </div>
        <div className="flex gap-2">
          <BotaoGigante
            tom="verde"
            onClick={() => marcar("fez")}
            rotulo="Fez"
            ajuda="Já tem exame"
            icone={
              <path d="M20 6 9 17l-5-5" />
            }
          />
          <BotaoGigante
            tom="vermelho"
            onClick={() => marcar("nao_fez")}
            rotulo="Não fez"
            ajuda="Precisa agendar"
            icone={<path d="M18 6 6 18M6 6l12 12" />}
          />
        </div>
        <p className="mt-2 text-[0.7rem] leading-snug text-mute">
          É o gate: sem audiometria não há decisão de venda. Marcar aqui é o que tira o lead do limbo.
        </p>
      </div>
    );
  }

  const fez = estado === "fez";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border-[1.5px] p-3",
        fez ? "border-verde-bd bg-verde-bg" : "border-vermelho-bd bg-vermelho-bg",
      )}
    >
      <span
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-full text-branco",
          fez ? "bg-verde" : "bg-vermelho",
        )}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px] stroke-current" fill="none">
          {fez ? <path d="M20 6 9 17l-5-5" /> : <path d="M18 6 6 18M6 6l12 12" />}
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[0.7rem] font-bold uppercase tracking-[0.07em] text-mute">Audiometria</div>
        <div className={cn("text-[1.05rem] font-bold leading-tight", fez ? "text-verde" : "text-vermelho")}>
          {fez ? "Fez o exame" : "Não fez — precisa agendar"}
        </div>
        {legenda && <div className="mt-0.5 text-[0.7rem] text-mute">{legenda}</div>}
      </div>
      {!fez && (
        <button
          onClick={() => marcar("fez")}
          className="shrink-0 rounded-lg bg-branco px-3 py-2 text-[0.78rem] font-semibold text-vermelho shadow-suave transition-colors hover:bg-vermelho hover:text-branco"
        >
          Marcar como feita
        </button>
      )}
      {fez && (
        <button
          onClick={() => marcar("nao_fez")}
          title="Corrigir marcação"
          aria-label="Corrigir marcação"
          className="shrink-0 rounded-lg px-2 py-1.5 text-[0.74rem] font-medium text-suave transition-colors hover:bg-branco/70"
        >
          Corrigir
        </button>
      )}
    </div>
  );
}

function BotaoGigante({
  tom,
  rotulo,
  ajuda,
  icone,
  onClick,
}: {
  tom: "verde" | "vermelho";
  rotulo: string;
  ajuda: string;
  icone: React.ReactNode;
  onClick: () => void;
}) {
  const verde = tom === "verde";
  return (
    <button
      onClick={onClick}
      aria-label={`Audiometria: ${rotulo} — ${ajuda}`}
      className={cn(
        "group flex flex-1 items-center gap-2.5 rounded-lg border-[1.5px] bg-branco px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2",
        verde
          ? "border-verde-bd hover:border-verde hover:bg-verde-bg focus-visible:ring-verde/40"
          : "border-vermelho-bd hover:border-vermelho hover:bg-vermelho-bg focus-visible:ring-vermelho/40",
      )}
    >
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full text-branco transition-transform group-hover:scale-105",
          verde ? "bg-verde" : "bg-vermelho",
        )}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 stroke-current" fill="none">
          {icone}
        </svg>
      </span>
      <span className="min-w-0">
        <span className={cn("block text-[1.02rem] font-bold leading-tight", verde ? "text-verde" : "text-vermelho")}>
          {rotulo}
        </span>
        <span className="block text-[0.71rem] leading-tight text-mute">{ajuda}</span>
      </span>
    </button>
  );
}
