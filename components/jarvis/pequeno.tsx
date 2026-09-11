"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRightIcon, CheckIcon, FilterIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ondeEstou, useJarvis } from "@/lib/jarvis/contexto";
import { useConversaJarvis } from "@/lib/jarvis/usar-conversa";
import type { AcaoResposta, RespostaJarvis } from "@/lib/jarvis/resposta-tipos";
import { sugestoesEnsaioDaTela } from "@/lib/ensaio/jarvis-telas";
import { MarcaJarvis } from "./marca";
import { useMovimento } from "./movimento";

/**
 * O JARVIS PEQUENO (W-JX, 11/09/2026 · 00:45) — o pedido do Diogo depois de ver o dock:
 * *"um estado mínimo em que ele só aparece rapidinho, você pede algo e ele responde em uma linha."*
 *
 * A pílula VIRA um campo fino ali mesmo, no canto onde já estava — sem véu, sem escurecer a tela,
 * sem tirar ninguém do lugar. A resposta vem em uma a três linhas, com NO MÁXIMO uma ação, e
 * "ver tudo" sobe para o popup com blocos, listas e trace, levando a mesma pergunta junto (o
 * histórico é o mesmo `localStorage`, então o popup abre já respondido).
 *
 * Esc ou clique fora fecha. O que não cabe em três linhas não é resposta pequena — é popup, e o
 * componente diz isso em vez de espremer.
 */

const MAX_LINHAS = 3;

const ICONE_ACAO = { abrir: ArrowUpRightIcon, criar_tarefa: PlusIcon, filtrar: FilterIcon } as const;

/** A resposta reduzida ao que cabe em três linhas: a frase, e só. */
export function RespostaCurta({ resposta, vivo }: { resposta: RespostaJarvis; vivo: boolean }) {
  const mov = useMovimento();
  const passos = resposta.passos ?? [];
  const emCurso = passos.find((p) => p.estado === "andamento") ?? passos[passos.length - 1];

  if (resposta.erro) return <p className="text-[13px] leading-normal text-muted-foreground">{resposta.erro}</p>;

  if (vivo) {
    return (
      <div role="status" className="flex items-start gap-2">
        <span className="mt-[5px] size-[5px] shrink-0 rounded-full bg-primary pulso-ao-vivo" aria-hidden />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={emCurso?.id ?? "pensando"}
            initial={mov.reduzido ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={mov.reduzido ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="text-[12.5px] leading-snug text-muted-foreground"
          >
            {emCurso?.texto ?? "consultando…"}
          </motion.span>
        </AnimatePresence>
      </div>
    );
  }

  const texto = resposta.frase ?? resposta.blocos.find((b) => b.tipo === "texto")?.texto ?? null;
  if (!texto) return null;
  return (
    <p className={cn("text-[13px] font-medium leading-snug text-foreground", `line-clamp-${MAX_LINHAS}`)} style={{ display: "-webkit-box", WebkitLineClamp: MAX_LINHAS, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
      {texto}
    </p>
  );
}

export function PequenoJarvis({ aoFechar }: { aoFechar: () => void }) {
  const { contexto, contratoTela, papel, usuarioId, ensaio, expandir, perguntaPendente, consumirPergunta } = useJarvis();
  const mov = useMovimento();
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const motor = useConversaJarvis({ usuarioId, contexto: contratoTela, ensaio, contextoTela: contexto });
  const { texto, setTexto, atual, vivo, pronto, perguntar, cancelar } = motor;

  useEffect(() => {
    campo.current?.focus();
  }, []);

  // clique fora fecha — sem véu, então o "fora" é o documento inteiro
  useEffect(() => {
    const aoClicar = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) aoFechar();
    };
    document.addEventListener("mousedown", aoClicar);
    return () => document.removeEventListener("mousedown", aoClicar);
  }, [aoFechar]);

  // a pergunta que veio do clique no dock dispara sozinha, uma vez
  const aplicada = useRef(false);
  useEffect(() => {
    if (!pronto || !perguntaPendente || aplicada.current) return;
    aplicada.current = true;
    const q = perguntaPendente;
    consumirPergunta();
    perguntar(q);
  }, [pronto, perguntaPendente, consumirPergunta, perguntar]);

  const sugestoes = contexto.sugestoes ?? (ensaio ? sugestoesEnsaioDaTela(contexto.rota) : null) ?? [];
  const resposta = atual?.resposta ?? null;
  const acao: AcaoResposta | null = resposta?.acoes?.[0] ?? null;
  const temMais = Boolean(resposta && !vivo && (resposta.blocos.length > 0 || (resposta.passos?.length ?? 0) > 0));

  function aoAcao(a: AcaoResposta) {
    if (a.tipo === "abrir" && a.href) {
      router.push(a.href);
      aoFechar();
      return;
    }
    if (a.tipo === "filtrar" && a.filtro) {
      router.push(`${contexto.rota}?${a.filtro}`);
      aoFechar();
      return;
    }
    setFeito(a.detalhe ? `Tarefa criada: ${a.detalhe}` : "Tarefa criada");
  }

  const Icone = acao ? ICONE_ACAO[acao.tipo] : null;

  return (
    <motion.div
      ref={caixa}
      layoutId={mov.reduzido ? undefined : "jarvis-casca"}
      style={{ borderRadius: 14 }}
      initial={mov.reduzido ? { opacity: 0 } : false}
      animate={mov.reduzido ? { opacity: 1 } : undefined}
      exit={mov.reduzido ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.12 } }}
      transition={mov.reduzido ? { duration: 0.12 } : { type: "spring", duration: 0.55, bounce: 0.15 }}
      role="dialog"
      aria-label="Jarvis"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          if (vivo) cancelar();
          else aoFechar();
        }
      }}
      className="w-[min(440px,calc(100vw-2rem))] overflow-hidden border border-border bg-popover shadow-[0_10px_32px_rgba(31,35,40,.16)]"
    >
      <motion.div
        initial={mov.reduzido ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18, delay: mov.reduzido ? 0 : 0.12 }}
        className="px-3.5 py-2.5"
      >
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MarcaJarvis tamanho={16} vivo={vivo} rotulo="Jarvis" className="text-foreground" />
          <span className="min-w-0 flex-1 truncate">{ondeEstou(contexto)}</span>
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            perguntar(texto);
          }}
          className="mt-1 border-b border-border/60 pb-1.5 transition-colors focus-within:border-foreground/40"
        >
          <input
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-label="Pergunte ao Jarvis"
            placeholder="Pergunte alguma coisa"
            className="w-full bg-transparent text-[14px] font-medium leading-snug text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
          />
        </form>

        <AnimatePresence initial={false} mode="popLayout">
          {resposta ? (
            <motion.div
              key="resposta"
              initial={mov.reduzido ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={mov.reduzido ? { duration: 0.15 } : { type: "spring", duration: 0.5, bounce: 0.25 }}
              className="mt-2.5"
            >
              <RespostaCurta resposta={resposta} vivo={vivo} />
              {feito && (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <CheckIcon className="size-3.5 shrink-0 text-success-ink" aria-hidden />
                  {feito}
                </p>
              )}
              {!vivo && (acao || temMais) && (
                <div className="mt-2.5 flex items-center gap-3">
                  {acao && Icone && (
                    <button
                      type="button"
                      onClick={() => aoAcao(acao)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 py-1 text-[12px] text-foreground transition-colors hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Icone className="size-3.5 text-muted-foreground" aria-hidden />
                      {acao.rotulo}
                    </button>
                  )}
                  {temMais && (
                    <button
                      type="button"
                      onClick={() => expandir(atual?.pergunta ?? null)}
                      className="ml-auto text-[11.5px] text-muted-foreground underline-offset-[3px] hover:text-foreground hover:underline"
                    >
                      ver tudo
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.ul
              key="sugestoes"
              role="listbox"
              aria-label="Perguntas sugeridas para esta tela"
              initial={false}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              className="mt-2 space-y-0.5"
            >
              {sugestoes.slice(0, 3).map((q, i) => (
                <motion.li
                  key={q}
                  role="option"
                  aria-selected={false}
                  initial={mov.reduzido ? { opacity: 0 } : { opacity: 0, y: 10 + i * 2, scale: 0.96, filter: "blur(3px)" }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                  transition={mov.reduzido ? { duration: 0.15 } : { type: "spring", duration: 0.5, bounce: 0.3, delay: 0.1 + i * 0.05 }}
                >
                  <button
                    type="button"
                    onClick={() => perguntar(q)}
                    className="text-left text-[12.5px] text-foreground underline-offset-[3px] hover:underline focus-visible:underline focus-visible:outline-none"
                  >
                    {q}
                  </button>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
