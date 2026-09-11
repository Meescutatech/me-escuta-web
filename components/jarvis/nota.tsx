"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { AcaoResposta, RespostaJarvis } from "@/lib/jarvis/resposta-tipos";
import { responderEnsaio } from "@/lib/ensaio/jarvis";
import { ListaDeAcoes } from "./lista-de-acoes";
import { MarcaJarvis } from "./marca";
import { useMovimento } from "./movimento";
import { PassosJarvis } from "./passos";

/**
 * `@jarvis` DENTRO DA NOTA INTERNA (W-JX, 11/09/2026 · 00:45) — mencionar o Jarvis no composer da
 * conversa e receber a resposta NO PRÓPRIO FIO, sem abrir nada.
 *
 * É o padrão da Linear (`@Linear` num comentário cria a sessão do agente) e é o gesto que menos
 * tira a Sara de onde ela está: ela já estava escrevendo ali.
 *
 * Contrato com o dono de `/conversas` (o gatilho no composer é dele; este componente é meu):
 *
 *     import { RespostaNotaJarvis, responderNaNota } from "@/components/jarvis/nota";
 *     const resposta = responderNaNota({ conversa_id, pergunta, lead_nome });  // ensaio
 *     <RespostaNotaJarvis resposta={resposta} vivo={false} onInserir={texto => inserirNaNota(texto)} />
 *
 * `onInserir` recebe a frase pronta para virar o texto da nota — o padrão do Intercom, em que a
 * sugestão chega em cinza dentro do composer e a pessoa decide se fica. Sem `onInserir`, a resposta
 * é só leitura no fio.
 *
 * ⚠️ Em produção isto ainda é fixture: a resposta viria do mesmo proxy SSE (F9) com o
 * `conversa_id` no contexto, e a nota só é gravada pelo caminho de escrita da conversa — o Jarvis
 * NÃO escreve nota sozinho (guardrail de somente-leitura). Ver STATUS.
 */

export function responderNaNota({
  conversa_id,
  pergunta,
  lead_nome = null,
  agora = new Date(),
}: {
  conversa_id: string;
  pergunta: string;
  lead_nome?: string | null;
  agora?: Date;
}): RespostaJarvis {
  return responderEnsaio(pergunta, agora, {
    rota: "/conversas",
    busca: `?c=${conversa_id}`,
    titulo: "Conversas",
    item: { tipo: "conversa", id: conversa_id, rotulo: lead_nome },
    filtros: {},
    sugestoes: null,
    aviso: null,
  });
}

export function RespostaNotaJarvis({
  resposta,
  vivo = false,
  onInserir,
  onDescartar,
  onAcao,
  className,
}: {
  resposta: RespostaJarvis;
  vivo?: boolean;
  /** leva a frase para dentro do composer da nota — a pessoa decide se fica */
  onInserir?: (texto: string) => void;
  onDescartar?: () => void;
  onAcao?: (a: AcaoResposta) => void;
  className?: string;
}) {
  const mov = useMovimento();
  const passos = resposta.passos ?? [];
  const frase = resposta.frase ?? resposta.blocos.find((b) => b.tipo === "texto")?.texto ?? null;
  const lista = resposta.blocos.find((b) => b.tipo === "acoes");

  return (
    <motion.aside
      initial={mov.reduzido ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={mov.reduzido ? { duration: 0.15 } : { type: "spring", duration: 0.5, bounce: 0.2 }}
      aria-label="Resposta do Jarvis nesta conversa"
      className={cn("rounded-md border border-border/60 bg-muted/30 px-3 py-2.5", className)}
    >
      <header className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <MarcaJarvis tamanho={16} vivo={vivo} rotulo="Jarvis" className="text-foreground" />
        <span>{vivo ? "consultando…" : "só você vê isto"}</span>
      </header>

      {passos.length > 0 && <PassosJarvis passos={passos} vivo={vivo} em={resposta.em} className="mt-2" />}

      <AnimatePresence initial={false}>
        {!vivo && frase && (
          <motion.p key="frase" variants={mov.abrir} initial="hidden" animate="visible" exit="exit" className="mt-2 text-[13.5px] font-medium leading-snug text-foreground">
            {frase}
          </motion.p>
        )}
      </AnimatePresence>

      {!vivo && lista && lista.tipo === "acoes" && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <ListaDeAcoes itens={lista.itens.slice(0, 3)} rotulo={lista.rotulo ?? undefined} />
        </div>
      )}

      {!vivo && (onInserir || onDescartar || (onAcao && resposta.acoes?.length)) && (
        <footer className="mt-2.5 flex flex-wrap items-center gap-3 border-t border-border/60 pt-2.5 text-[12px]">
          {onInserir && frase && (
            <button
              type="button"
              onClick={() => onInserir(frase)}
              className="rounded-md border border-border/60 bg-card px-2 py-1 text-foreground transition-colors hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Usar na nota
            </button>
          )}
          {onAcao &&
            resposta.acoes?.slice(0, 1).map((a) => (
              <button key={a.id} type="button" onClick={() => onAcao(a)} className="text-muted-foreground underline-offset-[3px] hover:text-foreground hover:underline">
                {a.rotulo}
              </button>
            ))}
          {onDescartar && (
            <button type="button" onClick={onDescartar} className="ml-auto text-muted-foreground underline-offset-[3px] hover:text-foreground hover:underline">
              descartar
            </button>
          )}
        </footer>
      )}
    </motion.aside>
  );
}
