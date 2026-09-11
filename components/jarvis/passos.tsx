"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TraceAgente, type ExecucaoTrace, type PassoTrace } from "@/components/ui/trace-agente";
import type { PassoJarvis } from "@/lib/jarvis/resposta-tipos";
import { useMovimento } from "./movimento";

/**
 * O JARVIS MOSTRANDO O TRABALHO (W-JX, 11/09/2026) — presença é ele deixar ver o que fez.
 *
 * Dois estados, e a pesquisa de 11/09 diz por que são dois (`pesquisa/DESIGN-DE-AGENTES-NA-
 * INTERFACE-2026-09-11.md` §3): mostrar o raciocínio aumenta a confiança, mas raciocínio SEMPRE
 * aberto rouba o julgamento de quem lê (arxiv 2511.04050). Então:
 *
 *   ENQUANTO PENSA — os passos aparecem na ordem em que acontecem. O que terminou fica com um
 *   tique fino em muted; o que está em curso, com o ponto laranja pulsando — o mesmo ponto do
 *   arco, único lugar onde o acento entra. Nada de verde nem âmbar: o trace é bastidor, e cor de
 *   estado é para o resultado.
 *
 *   DEPOIS DE RESPONDER — colapsa numa linha só, "como cheguei aqui · 3 passos · 0,6 s", que abre
 *   a LINHA DO TEMPO de verdade: `components/ui/trace-agente.tsx`, escrito em 10/09 e que até
 *   hoje nunca tinha sido montado em superfície nenhuma. É o padrão "Footprints" — o rastro que
 *   deixa a pessoa trabalhar de trás para frente e corrigir.
 *
 * ⚠️ HONESTIDADE DO RASTRO: em ENSAIO os passos são encenados com duração determinística. Em
 * PRODUÇÃO o SSE só emite `ferramenta {nome, resumo}` DEPOIS da consulta — sem id, sem argumento,
 * sem "comecei" —, então o passo real é reconstruído no cliente e a duração é o tempo até o evento
 * chegar, não o tempo da consulta. Trace fiel exige contrato novo nos DOIS repos (ver STATUS).
 */

const DURACAO_PADRAO_MS = 220;

function paraExecucao(passos: PassoJarvis[], em: string): ExecucaoTrace {
  let cursor = 0;
  const convertidos: PassoTrace[] = passos.map((p) => {
    const duracaoMs = Math.max(p.ms ?? DURACAO_PADRAO_MS, 40);
    const passo: PassoTrace = {
      id: p.id,
      tipo: "ferramenta",
      nome: p.texto,
      inicioMs: cursor,
      duracaoMs,
      estado: p.estado === "falhou" ? "erro" : p.estado === "andamento" ? "rodando" : "feito",
      resultado: p.detalhe ?? undefined,
    };
    cursor += duracaoMs;
    return passo;
  });
  const total = Math.max(cursor, 1);
  return {
    id: `consulta_${em.slice(11, 19).replace(/:/g, "")}`,
    quando: `às ${em.slice(11, 16)}`,
    duracaoMs: total,
    estado: passos.some((p) => p.estado === "falhou") ? "erro" : passos.some((p) => p.estado === "andamento") ? "rodando" : "feito",
    passos: convertidos,
  };
}

function duracao(passos: PassoJarvis[]): string | null {
  const ms = passos.reduce((s, p) => s + (p.ms ?? 0), 0);
  if (!ms) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1).replace(".", ",")} s` : `${ms} ms`;
}

function Marcador({ estado }: { estado: PassoJarvis["estado"] }) {
  if (estado === "andamento") {
    return (
      <span className="grid size-3.5 shrink-0 place-items-center" aria-hidden>
        <span className="size-[5px] rounded-full bg-primary pulso-ao-vivo" />
      </span>
    );
  }
  if (estado === "falhou") {
    return (
      <span className="grid size-3.5 shrink-0 place-items-center text-[11px] leading-none text-destructive" aria-hidden>
        ×
      </span>
    );
  }
  return <CheckIcon className="mt-px size-3.5 shrink-0 text-muted-foreground/60" strokeWidth={2} aria-hidden />;
}

/** A coluna que anda: um passo por linha, aparecendo conforme acontece. */
function ColunaAoVivo({ passos }: { passos: PassoJarvis[] }) {
  const mov = useMovimento();
  return (
    <motion.ol variants={mov.lista} initial="hidden" animate="visible" className="m-0 list-none space-y-1 p-0">
      <AnimatePresence initial={false}>
        {passos.map((p) => (
          <motion.li key={p.id} layout="position" transition={mov.layout} variants={mov.item} initial="hidden" animate="visible" className="flex items-start gap-2">
            <Marcador estado={p.estado} />
            <span className={cn("min-w-0 flex-1 text-[12px] leading-snug", p.estado === "andamento" ? "text-foreground" : "text-muted-foreground")}>{p.texto}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </motion.ol>
  );
}

export function PassosJarvis({ passos, vivo, em, className }: { passos: PassoJarvis[]; vivo: boolean; em: string; className?: string }) {
  const mov = useMovimento();
  const [aberto, setAberto] = useState(false);
  const execucao = useMemo(() => paraExecucao(passos, em), [passos, em]);

  if (passos.length === 0) return null;

  if (vivo) {
    return (
      <LayoutGroup>
        <motion.div layout transition={mov.layout} className={className} aria-live="polite">
          <ColunaAoVivo passos={passos} />
        </motion.div>
      </LayoutGroup>
    );
  }

  const tempo = duracao(passos);
  return (
    <LayoutGroup>
      <motion.div layout transition={mov.layout} className={className}>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="group flex items-center gap-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="underline-offset-[3px] group-hover:underline">como cheguei aqui</span>
          <span aria-hidden>·</span>
          <span>
            {passos.length} passo{passos.length > 1 ? "s" : ""}
          </span>
          {tempo && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{tempo}</span>
            </>
          )}
          <motion.span aria-hidden animate={{ rotate: aberto ? 180 : 0 }} transition={mov.layout} className="ml-0.5">
            <ChevronDownIcon className="size-3" />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {aberto && (
            <motion.div key="trace" variants={mov.abrir} initial="hidden" animate="visible" exit="exit">
              <div className="mt-2">
                <TraceAgente execucao={execucao} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </LayoutGroup>
  );
}
