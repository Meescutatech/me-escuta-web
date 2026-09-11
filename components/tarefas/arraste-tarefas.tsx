"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion } from "motion/react";

/*
 * ARRASTE DE TAREFA — a versão enxuta do motor do funil (W-D6 v5), para replanejar no calendário e
 * mover no quadro.
 *
 * **Por que não importei `components/funil/arraste.tsx`:** aquele motor resolve um problema que
 * aqui não existe — ORDENAR À MÃO dentro da coluna (snapshot de midpoints, placeholder com a
 * altura exata, índice estável enquanto o ponteiro anda). A ordem das tarefas é CALCULADA (prazo,
 * urgência); ninguém arrasta uma tarefa para o terceiro lugar de terça-feira. O que se arrasta
 * aqui é para ONDE ela vai: outro dia, outra coluna. Copiar o motor inteiro traria 200 linhas de
 * hit-testing para responder a uma pergunta que tem um alvo só. E importar o arquivo dele criaria
 * uma dependência entre duas telas vivas em paralelo — exatamente o cenário do E-356.
 *
 * O que veio de lá, porque é o que faz o arraste parecer físico:
 *  · o card SAI da lista e vira overlay `fixed` que segue o cursor (scale 1.03, rotate 1.6°);
 *  · o destino se acende enquanto o ponteiro está sobre ele — o alvo nunca é adivinhado;
 *  · TECLADO de verdade: Espaço pega, setas escolhem o destino, Espaço solta, Esc devolve, com
 *    `aria-live` anunciando cada passo. Arrastar com o mouse não pode ser a única forma de mover.
 *  · `useReducedMotion` desliga as molas.
 */

export const MOLA_LIFT = { type: "spring" as const, stiffness: 520, damping: 34, mass: 0.7 };

export interface EstadoArrasteTarefa {
  id: string;
  origem: string;
  largura: number;
  altura: number;
  porTeclado: boolean;
}

export interface UseArrasteTarefas {
  arraste: EstadoArrasteTarefa | null;
  /** a chave do destino aceso agora (`null` = fora de qualquer destino) */
  destino: string | null;
  raizRef: React.RefObject<HTMLDivElement>;
  propsItem: (id: string, origem: string) => Record<string, unknown>;
  anuncio: string;
  x: ReturnType<typeof useMotionValue<number>>;
  y: ReturnType<typeof useMotionValue<number>>;
}

export function useArrasteTarefas({
  onSoltar,
  destinos,
  rotuloItem,
  rotuloDestino,
  podeSoltar,
}: {
  /** chamado ao soltar em destino diferente do de origem */
  onSoltar: (id: string, origem: string, destino: string) => void;
  /** as chaves de destino, na ordem da tela — é a ordem que as setas percorrem */
  destinos: string[];
  rotuloItem: (id: string) => string;
  rotuloDestino: (chave: string) => string;
  /** false = o destino recusa o item (dia no passado, coluna incompatível) */
  podeSoltar?: (id: string, destino: string) => boolean;
}): UseArrasteTarefas {
  const [arraste, setArraste] = useState<EstadoArrasteTarefa | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const raizRef = useRef<HTMLDivElement>(null!);
  const pegaRef = useRef({ dx: 0, dy: 0 });
  const focoRef = useRef<string | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const aceita = useCallback((id: string, alvo: string) => (podeSoltar ? podeSoltar(id, alvo) : true), [podeSoltar]);

  const soltar = useCallback(
    (cancelar = false) => {
      setArraste((a) => {
        if (a && !cancelar && destino && destino !== a.origem && aceita(a.id, destino)) {
          onSoltar(a.id, a.origem, destino);
          setAnuncio(`${rotuloItem(a.id)} movida para ${rotuloDestino(destino)}.`);
        } else if (a && cancelar) {
          setAnuncio(`Movimento cancelado. ${rotuloItem(a.id)} continua em ${rotuloDestino(a.origem)}.`);
        }
        if (a) focoRef.current = a.id;
        return null;
      });
      setDestino(null);
    },
    [destino, onSoltar, rotuloItem, rotuloDestino, aceita],
  );

  // o item remonta noutro dia/coluna: devolve o foco a ele (SC 2.4.3)
  useEffect(() => {
    if (arraste || !focoRef.current) return;
    const id = focoRef.current;
    focoRef.current = null;
    const t = setTimeout(() => document.querySelector<HTMLElement>(`[data-arrastavel="${id}"]`)?.focus(), 60);
    return () => clearTimeout(t);
  }, [arraste]);

  // ponteiro
  useEffect(() => {
    if (!arraste || arraste.porTeclado) return;
    function mover(e: PointerEvent) {
      x.set(e.clientX - pegaRef.current.dx);
      y.set(e.clientY - pegaRef.current.dy);
      const sob = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-destino]");
      setDestino(sob?.dataset.destino ?? null);
    }
    function largar() {
      soltar(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") soltar(true);
    }
    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerup", largar);
    document.addEventListener("pointercancel", largar);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointermove", mover);
      document.removeEventListener("pointerup", largar);
      document.removeEventListener("pointercancel", largar);
      document.removeEventListener("keydown", tecla);
    };
  }, [arraste, soltar, x, y]);

  const comecar = useCallback(
    (e: React.PointerEvent, id: string, origem: string) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("button,a,input,select,textarea")) return;
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      pegaRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      x.set(r.left);
      y.set(r.top);
      setArraste({ id, origem, largura: r.width, altura: r.height, porTeclado: false });
      setDestino(origem);
      setAnuncio(`${rotuloItem(id)} pega. Arraste para outro destino.`);
    },
    [rotuloItem, x, y],
  );

  const teclaNoItem = useCallback(
    (e: React.KeyboardEvent, id: string, origem: string) => {
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (arraste?.id === id) return soltar(false);
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setArraste({ id, origem, largura: r.width, altura: r.height, porTeclado: true });
        setDestino(origem);
        setAnuncio(`${rotuloItem(id)} pega. Setas escolhem o destino, espaço solta, Esc cancela.`);
        return;
      }
      if (!arraste || arraste.id !== id) return;
      if (e.key === "Escape") {
        e.preventDefault();
        return soltar(true);
      }
      const passo =
        e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (passo === 0) return;
      e.preventDefault();
      const i = destino ? destinos.indexOf(destino) : -1;
      let j = Math.max(0, Math.min(destinos.length - 1, (i < 0 ? 0 : i) + passo));
      // pula destino que recusa este item — a seta nunca para num lugar onde soltar não faz nada
      while (j > 0 && j < destinos.length - 1 && !aceita(id, destinos[j])) j += passo;
      const alvo = destinos[j];
      if (!alvo || alvo === destino) return;
      setDestino(alvo);
      setAnuncio(`${rotuloDestino(alvo)}${aceita(id, alvo) ? "" : " — não aceita"}.`);
    },
    [arraste, destino, destinos, rotuloItem, rotuloDestino, soltar, aceita],
  );

  const propsItem = useCallback(
    (id: string, origem: string) => ({
      "data-arrastavel": id,
      tabIndex: 0,
      onPointerDown: (e: React.PointerEvent) => comecar(e, id, origem),
      onKeyDown: (e: React.KeyboardEvent) => teclaNoItem(e, id, origem),
    }),
    [comecar, teclaNoItem],
  );

  return { arraste, destino, raizRef, propsItem, anuncio, x, y };
}

/** O item no ar: `fixed`, segue o cursor, levanta 3% e inclina 1,6°. */
export function OverlayArrasteTarefa({
  x,
  y,
  largura,
  children,
}: {
  x: ReturnType<typeof useMotionValue<number>>;
  y: ReturnType<typeof useMotionValue<number>>;
  largura: number;
  children: React.ReactNode;
}) {
  const reduzido = useReducedMotion();
  return (
    <motion.div
      style={{ x, y, width: largura, position: "fixed", left: 0, top: 0, zIndex: 60, pointerEvents: "none" }}
      initial={reduzido ? false : { scale: 1, rotate: 0 }}
      animate={reduzido ? { scale: 1, rotate: 0 } : { scale: 1.03, rotate: 1.6 }}
      transition={reduzido ? { duration: 0 } : MOLA_LIFT}
      className="origin-center drop-shadow-[0_16px_32px_rgba(37,47,99,0.28)]"
      aria-hidden
    >
      {children}
    </motion.div>
  );
}
