"use client";

import { useEffect, useState } from "react";
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
 * ── W3 · 22/08/2026: DEIXOU DE SER PROTÓTIPO. AGORA GRAVA. ──────────────────────────────────
 * Até aqui o componente era chamado SEM props: todo lead abria em "indefinido" e o clique morria
 * num useState local — nada era gravado, nunca. O campo já existia em produção o tempo todo:
 * config `ficha_lead` v2, grupo Principal (editável), slug `audiometria`, tipo `selecao`,
 * opções ["Não","Sim"]. Medido em 22/08: 19 leads JÁ tinham o valor projetado em
 * `core.lead_campo` (15 "Sim", 4 "Não") e o botão mostrava "ainda não sabemos" para todos eles.
 *
 * Agora o estado ENTRA por `inicial` (lido da projeção) e SAI por `onMarcar` (evento
 * `lead_atualizado` pela porta). O useState continua, mas só como camada otimista: ele pinta
 * antes da porta responder e DESFAZ se a porta recusar — dizer "marcado" sobre uma gravação que
 * falhou é pior que o clique não responder.
 */

export type EstadoAudiometria = "indefinido" | "fez" | "nao_fez";

/** O que `onMarcar` devolve. Sem retorno (ou `void`) = quem chamou não confere — a UI assume ok. */
export type RespostaMarcacao = { ok: boolean; motivo?: string };

export function BotaoAudiometria({
  inicial = "indefinido",
  quandoTexto,
  onMarcar,
}: {
  inicial?: EstadoAudiometria;
  /** "exame marcado para 25/08 14:00" — fato lido da ficha, nunca inventado */
  quandoTexto?: string;
  onMarcar?: (estado: EstadoAudiometria) => void | Promise<RespostaMarcacao | void>;
}) {
  const [estado, setEstado] = useState<EstadoAudiometria>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // RESSINCRONIZA com a projeção. Sem isto o `useState(inicial)` congela no primeiro valor: o
  // drawer do funil não é desmontado ao trocar de card, então o lead seguinte herdaria a marcação
  // do anterior — e ela estaria ERRADA na tela sem estar errada no banco.
  useEffect(() => {
    setEstado(inicial);
    setErro(null);
  }, [inicial]);

  async function marcar(novo: EstadoAudiometria) {
    if (salvando || novo === estado) return;
    const anterior = estado;
    setEstado(novo); // otimista
    setErro(null);
    if (!onMarcar) return;
    setSalvando(true);
    const r = await onMarcar(novo);
    setSalvando(false);
    if (r && r.ok === false) {
      setEstado(anterior); // a porta recusou: a tela volta a dizer a verdade
      setErro(r.motivo ?? "não foi possível gravar");
    }
  }

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
            onClick={() => void marcar("fez")}
            desabilitado={salvando}
            rotulo="Fez"
            ajuda="Já tem exame"
            icone={
              <path d="M20 6 9 17l-5-5" />
            }
          />
          <BotaoGigante
            tom="vermelho"
            onClick={() => void marcar("nao_fez")}
            desabilitado={salvando}
            rotulo="Não fez"
            ajuda="Precisa agendar"
            icone={<path d="M18 6 6 18M6 6l12 12" />}
          />
        </div>
        <Rodape salvando={salvando} erro={erro}>
          É o gate: sem audiometria não há decisão de venda. Marcar aqui é o que tira o lead do limbo.
        </Rodape>
      </div>
    );
  }

  const fez = estado === "fez";
  return (
    <div
      className={cn(
        "rounded-xl border-[1.5px] p-3",
        fez ? "border-verde-bd bg-verde-bg" : "border-vermelho-bd bg-vermelho-bg",
      )}
    >
      <div className="flex items-center gap-3">
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
          {quandoTexto && <div className="mt-0.5 text-[0.7rem] text-mute">{quandoTexto}</div>}
        </div>
        {!fez ? (
          <button
            onClick={() => void marcar("fez")}
            disabled={salvando}
            className="shrink-0 rounded-lg bg-branco px-3 py-2 text-[0.78rem] font-semibold text-vermelho shadow-suave transition-colors hover:bg-vermelho hover:text-branco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermelho/40 disabled:opacity-50"
          >
            Marcar como feita
          </button>
        ) : (
          <button
            onClick={() => void marcar("nao_fez")}
            disabled={salvando}
            title="Corrigir marcação"
            aria-label="Corrigir marcação"
            className="shrink-0 rounded-lg px-2 py-1.5 text-[0.74rem] font-medium text-suave transition-colors hover:bg-branco/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verde/40 disabled:opacity-50"
          >
            Corrigir
          </button>
        )}
      </div>
      <Rodape salvando={salvando} erro={erro} />
    </div>
  );
}

/** Estado da gravação. Só aparece quando tem o que dizer — silêncio é o padrão. */
function Rodape({
  salvando,
  erro,
  children,
}: {
  salvando: boolean;
  erro: string | null;
  children?: React.ReactNode;
}) {
  if (erro) {
    return (
      <p className="mt-2 text-[0.72rem] font-semibold leading-snug text-vermelho" role="alert">
        Não gravou: {erro}. A marcação voltou ao que estava — tente de novo.
      </p>
    );
  }
  if (salvando) return <p className="mt-2 text-[0.7rem] leading-snug text-mute">gravando…</p>;
  if (children) return <p className="mt-2 text-[0.7rem] leading-snug text-mute">{children}</p>;
  return null;
}

function BotaoGigante({
  tom,
  rotulo,
  ajuda,
  icone,
  onClick,
  desabilitado,
}: {
  tom: "verde" | "vermelho";
  rotulo: string;
  ajuda: string;
  icone: React.ReactNode;
  onClick: () => void;
  desabilitado?: boolean;
}) {
  const verde = tom === "verde";
  return (
    <button
      onClick={onClick}
      disabled={desabilitado}
      aria-label={`Audiometria: ${rotulo} — ${ajuda}`}
      className={cn(
        "group flex flex-1 items-center gap-2.5 rounded-lg border-[1.5px] bg-branco px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50",
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
