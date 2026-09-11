"use client";

import { useReducedMotion, type Transition, type Variants } from "motion/react";

/**
 * O MOVIMENTO DAS SUPERFÍCIES DO JARVIS (W-J, 10/09/2026 23:35) — a partir da referência
 * "agent-plan" do 21st.dev (`~/Developer/me-escuta-wt/refs/21st-agent-plan.md`).
 *
 * Regra do Diogo: "evitaria o layout shift em todos os toggles". Todo expand/recolher anima
 * `height: 0 → auto` com `overflow` controlado (hidden enquanto anima, visible no fim), os filhos
 * entram em stagger, o ícone de estado troca com scale/rotate suave, e `layout` em `LayoutGroup`
 * acomoda o resto. Com `prefers-reduced-motion` tudo vira um tween curto de opacidade, sem
 * deslocamento — o `useMovimento()` devolve as variantes já adaptadas.
 *
 * Usamos `motion/react` (é o framer-motion, já pinado em `motion@^12.43.0` — instalar
 * `framer-motion` separado embarcaria a engine duas vezes; `components/ui/sidebar.tsx` do preset
 * já importa daqui).
 */

export const EASE = [0.2, 0.65, 0.3, 0.9] as const;

export function useMovimento() {
  const reduzido = useReducedMotion() ?? false;

  /** bloco que abre/fecha: altura 0 → auto, sem pulo */
  const abrir: Variants = reduzido
    ? {
        hidden: { opacity: 0, height: 0, overflow: "hidden" },
        visible: { opacity: 1, height: "auto", overflow: "visible", transition: { duration: 0.15 } },
        exit: { opacity: 0, height: 0, overflow: "hidden", transition: { duration: 0.12 } },
      }
    : {
        hidden: { opacity: 0, height: 0, overflow: "hidden" },
        visible: {
          opacity: 1,
          height: "auto",
          overflow: "visible",
          transition: { duration: 0.25, ease: EASE, staggerChildren: 0.05, when: "beforeChildren" },
        },
        exit: { opacity: 0, height: 0, overflow: "hidden", transition: { duration: 0.2, ease: EASE, when: "afterChildren" } },
      };

  /** item que entra em sequência (stagger) */
  const item: Variants = reduzido
    ? { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.15 } } }
    : {
        hidden: { opacity: 0, x: -10 },
        visible: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 500, damping: 25 } },
      };

  /** lista que entra com stagger (resposta do /jarvis, blocos do Jarvis diz) */
  const lista: Variants = reduzido
    ? { hidden: {}, visible: { transition: { staggerChildren: 0 } } }
    : { hidden: {}, visible: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } } };

  /** troca de ícone de estado */
  const icone = reduzido
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } as Transition }
    : {
        initial: { opacity: 0, scale: 0.8, rotate: -10 },
        animate: { opacity: 1, scale: 1, rotate: 0 },
        exit: { opacity: 0, scale: 0.8, rotate: 10 },
        transition: { duration: 0.2, ease: EASE } as Transition,
      };

  /** selo de estado pulsa quando muda */
  const selo = reduzido ? { animate: {}, transition: { duration: 0 } as Transition } : { animate: { scale: [1, 1.08, 1] }, transition: { duration: 0.35, ease: [0.34, 1.56, 0.64, 1] } as Transition };

  const layout: Transition = reduzido ? { duration: 0 } : { duration: 0.25, ease: EASE };

  return { reduzido, abrir, item, lista, icone, selo, layout };
}
