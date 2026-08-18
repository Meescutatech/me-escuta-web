"use client";

import { useEffect, useRef, useState } from "react";
import {
  frasePrograma,
  opcoesProgramar,
  paraValorLocal,
  proximaHoraCheia,
  validarEscolha,
} from "@/lib/conversas/programar-envio";
import { cn } from "@/lib/utils";

/*
 * BOTÃO DIVIDIDO DE ENVIO — pedido nº 1 da Sarah (workshop 12/08).
 * "Enviar agora ou programar. Só isso. Copia o que tem no Google."
 *
 * Então é o Gmail: o corpo do botão envia, a seta grudada nele abre um menu com dois atalhos de
 * amanhã, um da próxima segunda e "escolher data e hora". Duas diferenças do Gmail, ambas de
 * propósito:
 *   - o menu abre PARA CIMA, porque o composer mora no rodapé da conversa;
 *   - programar aqui não grava nada (protótipo sobre banco de produção) — vira um chip acima do
 *     campo, com "cancelar", e o chip diz que é protótipo.
 */

export interface EnvioProgramado {
  quando: number;
  texto: string;
}

export function BotaoEnvio({
  onEnviar,
  onProgramar,
  desabilitado,
  motivoDesabilitado,
  enviando,
}: {
  onEnviar: () => void;
  /** protótipo: o pai guarda em useState e desenha o chip. Nada de server action. */
  onProgramar: (quandoMs: number) => void;
  desabilitado: boolean;
  motivoDesabilitado?: string;
  enviando?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [valor, setValor] = useState("");
  const [agora, setAgora] = useState(() => Date.now());
  const caixaRef = useRef<HTMLDivElement>(null);

  // o menu mostra horários; deixá-los congelar faria "amanhã de manhã" mentir depois da meia-noite
  useEffect(() => {
    if (!aberto) return;
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (!caixaRef.current?.contains(e.target as Node)) fechar();
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") fechar();
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  function fechar() {
    setAberto(false);
    setEscolhendo(false);
  }

  function abrir() {
    setAgora(Date.now());
    setAberto(true);
  }

  function programar(quando: number) {
    onProgramar(quando);
    fechar();
  }

  const opcoes = opcoesProgramar(agora);
  const veredito = escolhendo ? validarEscolha(valor, agora) : null;

  return (
    <div ref={caixaRef} className="relative flex shrink-0">
      {/* corpo: enviar agora */}
      <button
        onClick={onEnviar}
        disabled={desabilitado}
        title={motivoDesabilitado ?? (enviando ? "Enviando anexo…" : "Enviar")}
        aria-label="Enviar agora"
        className={cn(
          "grid h-9 w-9 place-items-center rounded-l-[9px] bg-navy text-branco transition-colors hover:bg-navy-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 disabled:opacity-50",
          enviando && "animate-pulse",
        )}
      >
        <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 stroke-current" fill="none">
          <path d="M22 2 11 13" />
          <path d="M22 2 15 22l-4-9-9-4 20-7z" />
        </svg>
      </button>

      {/* hairline de separação — é o que faz ler como UM botão dividido, e não como dois */}
      <span className="w-px bg-branco/25" aria-hidden />

      {/* seta: programar */}
      <button
        onClick={() => (aberto ? fechar() : abrir())}
        disabled={desabilitado}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Opções de envio"
        title="Programar envio"
        className="grid h-9 w-[22px] place-items-center rounded-r-[9px] bg-navy text-branco transition-colors hover:bg-navy-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={cn("h-3 w-3 stroke-current transition-transform", aberto && "rotate-180")} fill="none">
          <path d="m6 15 6-6 6 6" />
        </svg>
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+8px)] right-0 z-50 w-[268px] overflow-hidden rounded-[11px] border border-linha bg-branco shadow-[0_10px_34px_rgba(37,47,99,.16)]"
        >
          <div className="border-b border-linha px-3.5 py-2.5">
            <div className="text-[0.78rem] font-semibold text-tinta">Programar envio</div>
            <div className="mt-0.5 text-[0.7rem] leading-snug text-mute">
              Protótipo — o horário fica nesta tela e nada é enviado.
            </div>
          </div>

          {!escolhendo ? (
            <>
              <div className="py-1">
                {opcoes.map((o) => (
                  <button
                    key={o.chave}
                    role="menuitem"
                    onClick={() => programar(o.quando)}
                    className="flex w-full items-baseline justify-between gap-3 px-3.5 py-2 text-left transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
                  >
                    <span className="text-[0.84rem] text-tinta">{o.rotulo}</span>
                    <span className="shrink-0 text-[0.74rem] tabular-nums text-mute">{o.detalhe}</span>
                  </button>
                ))}
              </div>
              <button
                role="menuitem"
                onClick={() => {
                  setValor(paraValorLocal(proximaHoraCheia(Date.now())));
                  setEscolhendo(true);
                }}
                className="flex w-full items-center gap-2 border-t border-linha px-3.5 py-2.5 text-left text-[0.84rem] font-medium text-navy transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
              >
                <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" className="h-3.5 w-3.5 stroke-current" fill="none">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M8 3v4M16 3v4M3 11h18" />
                </svg>
                Escolher data e hora
              </button>
            </>
          ) : (
            <div className="px-3.5 py-3">
              <label className="block text-[0.74rem] font-medium text-suave" htmlFor="programar-quando">
                Data e hora
              </label>
              <input
                id="programar-quando"
                type="datetime-local"
                autoFocus
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-linha-forte bg-board px-2.5 py-1.5 text-[0.84rem] tabular-nums text-tinta outline-none focus:border-navy focus:bg-branco"
              />
              {veredito && !veredito.ok && (
                <p className="mt-1.5 text-[0.72rem] text-vermelho">{veredito.motivo}</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => veredito?.ok && programar(veredito.quando)}
                  disabled={!veredito?.ok}
                  className="rounded-lg bg-navy px-3.5 py-1.5 text-[0.8rem] font-semibold text-branco transition-colors hover:bg-navy-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 disabled:opacity-40"
                >
                  Programar envio
                </button>
                <button
                  onClick={() => setEscolhendo(false)}
                  className="rounded-lg px-2.5 py-1.5 text-[0.8rem] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
                >
                  Voltar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * O chip do envio programado — mora ACIMA do campo de texto, onde o Gmail põe a tarja amarela.
 * Sempre com "cancelar" ao lado: programar sem poder desprogramar é um envio que a pessoa não
 * controla mais, e esse é exatamente o medo que ela tem de usar a função.
 */
export function ChipProgramado({
  envio,
  onCancelar,
}: {
  envio: EnvioProgramado;
  onCancelar: () => void;
}) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-center gap-2 border-b border-linha bg-laranja-cl px-3.5 py-2">
      <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" className="h-3.5 w-3.5 shrink-0 stroke-laranja-esc" fill="none">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span className="min-w-0 flex-1 truncate text-[0.78rem] text-tinta">
        <b className="font-semibold text-laranja-esc">Programado</b> para {frasePrograma(envio.quando, agora)}
        {envio.texto && <span className="text-mute"> · “{envio.texto}”</span>}
      </span>
      <span className="shrink-0 rounded-full bg-branco/70 px-1.5 py-px text-[0.62rem] font-semibold uppercase tracking-wide text-laranja-esc">
        protótipo
      </span>
      <button
        onClick={onCancelar}
        className="shrink-0 rounded-md px-2 py-1 text-[0.74rem] font-medium text-laranja-esc transition-colors hover:bg-branco/70"
      >
        Cancelar
      </button>
    </div>
  );
}
