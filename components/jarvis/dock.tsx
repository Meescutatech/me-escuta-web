"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useJarvis, type AvisoJarvis } from "@/lib/jarvis/contexto";
import { avisoEnsaioDaTela } from "@/lib/ensaio/jarvis-telas";
import { MarcaJarvis } from "./marca";
import { useMovimento } from "./movimento";

/**
 * O DOCK DO JARVIS (W-JX, 11/09/2026) — a presença permanente.
 *
 * POR QUE O CANTO INFERIOR DIREITO, e não o header (a pergunta que o Diogo mandou justificar):
 *  1. o header já tem o gatilho do painel lateral e é território de outro agente nesta rodada —
 *     dois botões do mesmo agente na mesma barra é o anti-padrão nº 3 da pesquisa (três desenhos
 *     para uma entidade);
 *  2. o canto inferior direito é o ÚNICO lugar que existe em todas as telas, inclusive nas de
 *     altura cheia que não rolam (/conversas, /funil, /tarefas) — é por isso que o carimbo de
 *     build já mora lá;
 *  3. é onde o mercado pôs: a Linear ancora o agente no canto inferior direito, o Intercom na
 *     borda direita. Ninguém põe o agente ativo no meio da navegação.
 *
 * DOIS ESTADOS, e o segundo é o ponto:
 *   calado  — círculo de 34px, só o arco. Não pede nada.
 *   falando — vira pílula com o ponto laranja pulsando e o que ele tem a dizer SOBRE ESTA TELA
 *             ("4 conversas sem resposta"). Clicar abre o overlay JÁ perguntando aquilo.
 * A troca entre os dois é `layout` — a pílula cresce da direita, sem pulo e sem piscar; com
 * `prefers-reduced-motion` ela simplesmente aparece.
 *
 * Em ENSAIO o dock sobe 56px: o seletor "ver como" ocupa o mesmo canto (`bottom-9 right-4`), e
 * aquele arquivo é de outro agente.
 */

export function DockJarvis({ ensaio = false }: { ensaio?: boolean }) {
  const { abrir, aberto, contexto } = useJarvis();
  const mov = useMovimento();
  const [montado, setMontado] = useState(false);

  // o dock só entra depois da primeira pintura: evita que ele apareça "já lá" no carregamento
  useEffect(() => {
    const t = setTimeout(() => setMontado(true), 120);
    return () => clearTimeout(t);
  }, []);

  const aviso: AvisoJarvis | null = contexto.aviso ?? (ensaio ? avisoEnsaioDaTela(contexto.rota) : null);
  const falando = Boolean(aviso) && !aberto;
  const rotulo = aviso ? (aviso.quantidade != null ? `${aviso.quantidade} ${aviso.texto}` : aviso.texto) : "Pergunte ao Jarvis";

  return (
    <LayoutGroup>
      <div className={cn("fixed right-4 z-40", ensaio ? "bottom-[72px]" : "bottom-4")}>
        <AnimatePresence>
          {montado && (
            <motion.button
              type="button"
              layout
              onClick={() => abrir(falando ? (aviso?.pergunta ?? null) : null)}
              initial={mov.reduzido ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={mov.reduzido ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={mov.layout}
              aria-label={falando ? `Jarvis: ${rotulo}` : "Perguntar ao Jarvis"}
              aria-keyshortcuts="Meta+K Control+K"
              title={falando ? `${rotulo} — perguntar ao Jarvis (⌘K)` : "Perguntar ao Jarvis (⌘K)"}
              className={cn(
                "group flex items-center rounded-full border border-border bg-card text-foreground shadow-[0_2px_10px_rgba(31,35,40,.10)] transition-colors",
                "hover:border-foreground/25 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                falando ? "h-9 gap-2 pl-3 pr-2.5" : "size-9 justify-center",
              )}
            >
              <motion.span layout="position" className="grid place-items-center">
                <MarcaJarvis tamanho={20} vivo={falando} rotulo={undefined} />
              </motion.span>
              <AnimatePresence initial={false}>
                {falando && (
                  <motion.span
                    key="rotulo"
                    layout="position"
                    initial={mov.reduzido ? { opacity: 0 } : { opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={mov.layout}
                    className="flex items-center gap-2 whitespace-nowrap text-[12.5px] leading-none"
                  >
                    {rotulo}
                    <kbd className="hidden rounded-[4px] border border-border bg-muted px-1 py-px font-sans text-[10px] leading-[14px] text-muted-foreground sm:inline">⌘K</kbd>
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
