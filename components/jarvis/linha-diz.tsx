"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useJarvis } from "@/lib/jarvis/contexto";
import { MarcaJarvis } from "./marca";
import { useMovimento } from "./movimento";

/**
 * "JARVIS DIZ" COMO UMA LINHA — a versão fina, para o topo do dashboard (W-JX, 11/09/2026).
 *
 * Substitui `components/dashboard/jarvis-linha.tsx` (W-D4) mantendo o desenho que ele já aprovou:
 * arco + frase + hora + "ver mais". O que muda é o COMPORTAMENTO, que é o pedido do Diogo:
 *
 *   · "ver mais" EXPANDE AQUI, com `height: auto` animado (era `<details>`, que pula);
 *   · clicar numa PERGUNTA abre o overlay do Jarvis sobre o dashboard e responde ali — não
 *     navega mais para `/jarvis`;
 *   · clicar na FRASE também abre o overlay, já perguntando o que a frase resume.
 *
 * Sem a presença montada (galeria, teste isolado), tudo degrada para os links de sempre.
 *
 * DROP-IN para o dono do dashboard — troque o import e nada mais:
 *     import { LinhaJarvisDiz } from "@/components/jarvis/linha-diz";
 *     <LinhaJarvisDiz {...jarvis} />
 */

export interface ObservacaoDaLinha {
  texto: string;
  href: string;
  destino: string;
}

const LINK = "underline-offset-[3px] hover:underline focus-visible:outline-none focus-visible:underline";

function horaCurta(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(d);
}

export function LinhaJarvisDiz({
  frase,
  observacoes,
  perguntas,
  geradoEm,
  className,
}: {
  frase: string | null;
  observacoes: ObservacaoDaLinha[];
  perguntas: string[];
  geradoEm: string | null;
  className?: string;
}) {
  const jarvis = useJarvis();
  const mov = useMovimento();
  const [aberto, setAberto] = useState(false);
  const hora = horaCurta(geradoEm);
  const temMais = observacoes.length > 0 || perguntas.length > 0;
  const href = (q: string) => `/jarvis?contexto=%2F&pergunta=${encodeURIComponent(q)}`;

  return (
    <LayoutGroup>
      <motion.div layout transition={mov.layout} className={cn("border-b border-border py-1.5 text-[12.5px]", className)}>
        <div className="flex items-center gap-2">
          <MarcaJarvis tamanho={16} rotulo="Jarvis" className="shrink-0 text-foreground" />
          {frase && jarvis.montado ? (
            <button type="button" onClick={() => jarvis.abrir(frase)} className={cn("min-w-0 flex-1 truncate text-left text-foreground", LINK)} title="Perguntar ao Jarvis sobre isto">
              {frase}
            </button>
          ) : (
            <span className="min-w-0 flex-1 truncate text-foreground">{frase ?? "O Jarvis ainda não escreveu o resumo de hoje."}</span>
          )}
          {hora && <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">{hora}</span>}
          {temMais && (
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              aria-expanded={aberto}
              className="shrink-0 text-[11.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {aberto ? "fechar" : "ver mais"}
            </button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {aberto && temMais && (
            <motion.div key="mais" variants={mov.abrir} initial="hidden" animate="visible" exit="exit">
              <div className="mt-2 grid gap-x-8 gap-y-1 pl-6 md:grid-cols-[minmax(0,1fr)_auto]">
                <ul className="flex flex-col gap-1">
                  {observacoes.map((o, i) => (
                    <motion.li key={i} variants={mov.item} className="flex items-baseline gap-2 text-[12.5px] text-foreground">
                      <Link href={o.href} className={LINK}>
                        {o.texto}
                      </Link>
                      <span className="text-[11px] text-muted-foreground">{o.destino}</span>
                    </motion.li>
                  ))}
                </ul>
                <ul className="flex flex-col gap-1 text-[12px]">
                  {perguntas.map((p) => (
                    <motion.li key={p} variants={mov.item}>
                      {jarvis.montado ? (
                        <button type="button" onClick={() => jarvis.abrir(p)} className={cn("text-left text-muted-foreground hover:text-foreground", LINK)}>
                          {p}
                        </button>
                      ) : (
                        <Link href={href(p)} className={cn("text-muted-foreground hover:text-foreground", LINK)}>
                          {p}
                        </Link>
                      )}
                    </motion.li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </LayoutGroup>
  );
}
