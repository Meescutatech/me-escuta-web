"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { MaximizeIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ondeEstou, useJarvis } from "@/lib/jarvis/contexto";
import { avisoEnsaioDaTela, sugestoesEnsaioDaTela } from "@/lib/ensaio/jarvis-telas";
import { MORFOSE } from "./dock";
import { MarcaJarvis } from "./marca";
import { useMovimento } from "./movimento";
import { SuperficieJarvis } from "./superficie";

/**
 * O OVERLAY DO JARVIS (W-JX, 11/09/2026) — "pergunto no dashboard, ele me responde no dashboard".
 *
 * ⌘K abre isto por cima de QUALQUER tela: campo de pergunta grande ancorado no alto (medida de
 * paleta de comando, ~720px), a resposta no mesmo lugar, e Esc devolve a pessoa exatamente onde
 * ela estava. Ninguém navega para lugar nenhum — e o véu é de propósito quase transparente, com um
 * fio de desfoque: a tela de baixo continua legível, porque a resposta é SOBRE ela.
 *
 * A linha de cima diz onde o Jarvis acha que você está ("no funil · etapa qualificado"). É a
 * diferença entre um chat genérico flutuando e um copiloto: a caixa de texto sozinha tem
 * affordance indefinida (Wroblewski), e essa linha é o que a ancora.
 *
 * "Abrir em tela cheia" leva para `/jarvis`, que é a MESMA superfície em outra medida — nunca o
 * destino de um atalho, sempre uma escolha.
 */

export function OverlayJarvis() {
  const { modo, fechar, contexto, contratoTela, papel, usuarioId, ensaio, perguntaPendente, consumirPergunta } = useJarvis();
  const aberto = modo === "popup";
  const mov = useMovimento();
  const painel = useRef<HTMLDivElement>(null);
  const gatilho = useRef<Element | null>(null);
  const pergunta = useRef<string | null>(null);

  // congela a pergunta que veio do dock no momento da abertura (a superfície consome uma vez)
  if (aberto && perguntaPendente && pergunta.current === null) pergunta.current = perguntaPendente;
  if (!aberto && pergunta.current !== null) pergunta.current = null;

  useEffect(() => {
    if (!aberto) return;
    gatilho.current = document.activeElement;
    consumirPergunta();
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
      (gatilho.current as HTMLElement | null)?.focus?.();
    };
    // `consumirPergunta` é estável (useCallback sem deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const onde = ondeEstou(contexto);
  const href = `/jarvis?contexto=${encodeURIComponent(`${contexto.rota}${contexto.busca ?? ""}`)}`;
  const sugestoes = contexto.sugestoes ?? (ensaio ? sugestoesEnsaioDaTela(contexto.rota) : null) ?? undefined;
  const aviso = contexto.aviso ?? (ensaio ? avisoEnsaioDaTela(contexto.rota) : null);
  const inicial = pergunta.current ?? null;

  return (
    <AnimatePresence>
      {aberto && (
        <div className="fixed inset-0 z-[60]" role="presentation">
          <motion.button
            type="button"
            aria-label="Fechar o Jarvis"
            onClick={fechar}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: mov.reduzido ? 0.1 : 0.18 }}
            className="absolute inset-0 cursor-default bg-foreground/[0.07] supports-[backdrop-filter]:backdrop-blur-[1.5px]"
          />
          {/* `items-start`: sem isto o flex ESTICA o painel até o `max-h` e sobra uma caixa branca vazia embaixo */}
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center px-4 pt-[11vh]">
            <motion.div
              ref={painel}
              role="dialog"
              aria-modal="true"
              aria-label="Jarvis"
              /*
                11/09 · O `layoutId="jarvis-casca"` SAIU, e a causa é estrutural.
                Ele fazia a morfose compartilhada com a pílula do dock: a pílula do canto VIRAVA
                este painel. Com o dock desmontado (o Jarvis mudou para o centro do header), o
                layoutId ficou órfão — o framer anima a partir de um par que não existe e o painel
                nasce colapsado: uma caixa vazia debaixo do header, que foi exatamente o que
                apareceu na tela.
                Sem par, a entrada é a simples: aparece com opacidade. A morfose volta no dia em
                que o arco do header receber o par — e aí ela nasce DO arco, que é de onde a pessoa
                espera que saia.
              */
              style={{ borderRadius: 14 }}
              initial={mov.reduzido ? { opacity: 0 } : false}
              animate={mov.reduzido ? { opacity: 1 } : undefined}
              exit={mov.reduzido ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.12 } }}
              transition={mov.reduzido ? { duration: 0.12 } : MORFOSE}
              className="pointer-events-auto flex max-h-[min(74vh,640px)] w-full max-w-[720px] flex-col overflow-hidden border border-border bg-popover shadow-[0_16px_48px_rgba(31,35,40,.18)]"
            >
              <motion.header
                initial={mov.reduzido ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18, delay: mov.reduzido ? 0 : 0.14 }}
                className="flex flex-none items-center gap-2 border-b border-border/60 px-4 py-2.5"
              >
                <MarcaJarvis tamanho={16} rotulo="Jarvis" className="text-foreground" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{onde}</span>
                {aviso && (
                  <span className="hidden shrink-0 items-center gap-1.5 text-[11.5px] text-muted-foreground sm:inline-flex">
                    <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                    {aviso.quantidade != null ? `${aviso.quantidade} ${aviso.texto}` : aviso.texto}
                  </span>
                )}
                <Link
                  href={href}
                  onClick={fechar}
                  title="Abrir em tela cheia"
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <MaximizeIcon className="size-3.5" aria-hidden />
                  <span className="sr-only">Abrir em tela cheia</span>
                </Link>
                <button
                  type="button"
                  onClick={fechar}
                  title="Fechar (Esc)"
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <XIcon className="size-4" aria-hidden />
                  <span className="sr-only">Fechar</span>
                </button>
              </motion.header>

              <motion.div
                initial={mov.reduzido ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: mov.reduzido ? 0 : 0.14 }}
                className="flex min-h-0 flex-col"
              >
              <SuperficieJarvis
                usuarioId={usuarioId}
                papel={papel}
                contexto={contexto}
                contratoTela={contratoTela}
                ensaio={ensaio}
                medida="coluna"
                sugestoes={sugestoes}
                perguntaInicial={inicial}
                enviarAoAbrir={Boolean(inicial)}
                aoSair={fechar}
                className="min-h-0"
              />

              <footer className={cn("flex flex-none items-center gap-3 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground")}>
                <span className="inline-flex items-center gap-1">
                  <Tecla>↵</Tecla> perguntar
                </span>
                <span className="inline-flex items-center gap-1">
                  <Tecla>Esc</Tecla> fechar
                </span>
                <span className="ml-auto">O Jarvis só consulta — o que ele propõe, você decide.</span>
              </footer>
              </motion.div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[4px] border border-border bg-muted px-1 py-px font-sans text-[10px] leading-[14px] text-muted-foreground">{children}</kbd>
  );
}
