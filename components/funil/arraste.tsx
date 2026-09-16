"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { decidirAlvo } from "@/lib/funil/decidir-alvo";
import type { Snapshot, CardMedido, AlvoArraste } from "@/lib/funil/decidir-alvo";

/*
 * W-D6 v5 (11/09) · O MOTOR DE ARRASTE DO FUNIL — pointer events puros.
 *
 * Inspiração: o `kanban-board` do 21st.dev (resumo em `refs/21st-kanban.md`). Não é cópia: a
 * paleta, o card, o cabeçalho de coluna e a regra de cor D55 continuam sendo os nossos. O que veio
 * de lá é a MECÂNICA, e ela resolve três defeitos que o @dnd-kit nos deixava:
 *
 *  1. O CARD SAI DA LISTA. Ele vira um overlay `fixed` que segue o cursor (x/y em `useMotionValue`,
 *     `scale 1.03`, `rotate 1.6°`), o buraco na coluna FECHA e onde ele vai cair abre um
 *     placeholder tracejado com a ALTURA EXATA do card. Antes o card ficava semitransparente no
 *     lugar e o destino era adivinhado por uma linha fina.
 *  2. HIT-TESTING POR SNAPSHOT — o detalhe que faz a diferença. Os midpoints são medidos UMA VEZ,
 *     no início do arraste, num espaço de coordenadas SEM o card arrastado e SEM o placeholder:
 *     quem vem depois do card removido sobe `alturaRemovida + GAP`. Medir ao vivo é o que produz o
 *     flicker clássico — o placeholder empurra o card, a decisão inverte, o placeholder volta, e
 *     assim por diante a 60 Hz.
 *  3. TECLADO DE VERDADE. Espaço pega, setas movem (inclusive entre colunas), Espaço solta, Esc
 *     devolve; cada passo é anunciado em `aria-live` e o foco volta para o card depois de remontar.
 *     Arrastar com o mouse era a ÚNICA forma de mover um lead — numa tela que a Sara usa o dia
 *     inteiro, isso é um teto de velocidade e uma barreira de acessibilidade (WCAG 2.1 SC 2.1.1).
 *
 * `useReducedMotion` desliga as molas: quem pediu menos movimento recebe o mesmo comportamento sem
 * o teatro.
 */

/** `gap-2` entre os cards da coluna. Precisa bater com o CSS — é a conta do snapshot. */
export const GAP_CARDS = 8;

/*
 * v6 (13/09) · LIMIAR DE ARRASTE — o conserto do "card não abre".
 *
 * Até a v5 o `pointerdown` já criava o arraste, e o quadro tirava o card da lista no mesmo render.
 * Resultado: o elemento que receberia o `click` era DESMONTADO entre o pointerdown e o pointerup,
 * o clique nunca se completava e abrir um lead pelo board era impossível. Agora o pointerdown só
 * registra a INTENÇÃO; o arraste nasce no primeiro movimento que passa deste limiar. Abaixo dele o
 * gesto é clique, o card nunca sai do DOM e `onClick` acontece normalmente.
 */
const LIMIAR_ARRASTE = 4;

/** Distância da borda do trilho em que o auto-scroll horizontal liga. */
const BORDA_AUTOSCROLL = 72;
const VELOCIDADE_AUTOSCROLL = 14;

export const MOLA_LIFT = { type: "spring" as const, stiffness: 520, damping: 34, mass: 0.7 };
export const MOLA_FLUXO = { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.9 };

export type { AlvoArraste } from "@/lib/funil/decidir-alvo";

export interface EstadoArraste {
  leadId: string;
  etapaOrigem: string;
  indiceOrigem: number;
  /** medidas do card no momento em que foi pego — o overlay e o placeholder usam as mesmas */
  largura: number;
  altura: number;
  /** teclado não tem ponteiro: o overlay não é desenhado, o placeholder faz todo o trabalho */
  porTeclado: boolean;
}


/**
 * Mede tudo UMA vez, já no espaço sem o card arrastado. `alturaRemovida + GAP` sobe todo mundo que
 * vinha depois dele na coluna de origem — é isso que faz a decisão de índice ser estável enquanto
 * o ponteiro anda.
 */
function tirarSnapshot(raiz: HTMLElement, leadArrastado: string, alturaRemovida: number): Snapshot {
  const colunas: Snapshot["colunas"] = [];
  for (const el of Array.from(raiz.querySelectorAll<HTMLElement>("[data-coluna]"))) {
    const etapa = el.dataset.coluna!;
    const r = el.getBoundingClientRect();
    const cards: CardMedido[] = [];
    let passouPeloRemovido = false;
    for (const c of Array.from(el.querySelectorAll<HTMLElement>("[data-card]"))) {
      const id = c.dataset.card!;
      if (id === leadArrastado) {
        passouPeloRemovido = true;
        continue;
      }
      const cr = c.getBoundingClientRect();
      const deslocamento = passouPeloRemovido ? alturaRemovida + GAP_CARDS : 0;
      cards.push({ leadId: id, meio: cr.top + cr.height / 2 - deslocamento });
    }
    colunas.push({ etapa, esquerda: r.left, direita: r.right, topo: r.top, base: r.bottom, cards });
  }
  return { colunas, scrollLeft: raiz.scrollLeft };
}


export interface UseArrasteFunil {
  arraste: EstadoArraste | null;
  alvo: AlvoArraste | null;
  /** ref do trilho horizontal (auto-scroll e barra própria) */
  trilhoRef: React.RefObject<HTMLDivElement>;
  /** props para o contêiner do card */
  propsCard: (leadId: string, etapa: string, indice: number) => Record<string, unknown>;
  /** o que anunciar em aria-live */
  anuncio: string;
  /** posição do overlay (x/y), já com o deslocamento do ponto onde foi pego */
  x: ReturnType<typeof useMotionValue<number>>;
  y: ReturnType<typeof useMotionValue<number>>;
}

export function useArrasteFunil({
  onMover,
  nomeDoLead,
  nomeDaEtapa,
  ordemDaColuna,
  etapasDestino,
}: {
  /** chamado ao soltar em posição diferente da de origem */
  onMover: (leadId: string, etapaOrigem: string, etapaDestino: string) => void;
  nomeDoLead: (leadId: string) => string;
  nomeDaEtapa: (etapa: string) => string;
  /** ids na ordem em que a coluna está desenhada — base do teclado */
  ordemDaColuna: (etapa: string) => string[];
  /** as etapas que aceitam card, na ordem da tela */
  etapasDestino: string[];
}): UseArrasteFunil {
  const [arraste, setArraste] = useState<EstadoArraste | null>(null);
  const [alvo, setAlvo] = useState<AlvoArraste | null>(null);
  const [anuncio, setAnuncio] = useState("");
  /** houve pointerdown num card, mas o gesto ainda não passou do limiar — pode virar clique */
  const [pendente, setPendente] = useState(false);
  const pendenteRef = useRef<{ leadId: string; etapa: string; indice: number; x0: number; y0: number; el: HTMLElement } | null>(null);
  const trilhoRef = useRef<HTMLDivElement>(null!);
  const snapRef = useRef<Snapshot | null>(null);
  const pegaRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const autoScrollRef = useRef(0);
  const focoRef = useRef<string | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // auto-scroll horizontal enquanto o ponteiro fica perto da borda do trilho
  useEffect(() => {
    if (!arraste || arraste.porTeclado) return;
    let raf = 0;
    const passo = () => {
      const el = trilhoRef.current;
      if (el && autoScrollRef.current !== 0) el.scrollLeft += autoScrollRef.current;
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [arraste]);

  const soltar = useCallback(
    (cancelar = false) => {
      setArraste((a) => {
        if (a && !cancelar && alvo && alvo.etapa !== a.etapaOrigem) {
          onMover(a.leadId, a.etapaOrigem, alvo.etapa);
          setAnuncio(`${nomeDoLead(a.leadId)} movido para ${nomeDaEtapa(alvo.etapa)}, posição ${alvo.indice + 1}.`);
          // o card remonta na outra coluna: devolve o foco a ele quando o React terminar
          focoRef.current = a.leadId;
        } else if (a && cancelar) {
          setAnuncio(`Movimento cancelado. ${nomeDoLead(a.leadId)} continua em ${nomeDaEtapa(a.etapaOrigem)}.`);
          focoRef.current = a.leadId;
        }
        return null;
      });
      setAlvo(null);
      snapRef.current = null;
      autoScrollRef.current = 0;
    },
    [alvo, onMover, nomeDoLead, nomeDaEtapa],
  );

  // devolve o foco ao card depois de ele remontar em outra coluna (SC 2.4.3)
  useEffect(() => {
    if (arraste || !focoRef.current) return;
    const id = focoRef.current;
    focoRef.current = null;
    const t = setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-card="${id}"] [data-foco-card]`)?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [arraste]);

  // ponteiro: mover e soltar vivem no documento — o card já saiu do fluxo
  useEffect(() => {
    if (!arraste || arraste.porTeclado) return;
    function mover(e: PointerEvent) {
      x.set(e.clientX - pegaRef.current.dx);
      y.set(e.clientY - pegaRef.current.dy);
      if (snapRef.current) setAlvo((a) => decidirAlvo(snapRef.current!, e.clientX, e.clientY, trilhoRef.current?.scrollLeft ?? 0, a));
      const el = trilhoRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        autoScrollRef.current =
          e.clientX > r.right - BORDA_AUTOSCROLL
            ? VELOCIDADE_AUTOSCROLL
            : e.clientX < r.left + BORDA_AUTOSCROLL
              ? -VELOCIDADE_AUTOSCROLL
              : 0;
      }
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

  const começar = useCallback((e: React.PointerEvent, leadId: string, etapa: string, indice: number) => {
    // só botão principal, e nunca a partir de um controle dentro do card
    if (e.button !== 0) return;
    const alvoEl = e.target as HTMLElement;
    if (alvoEl.closest("button,a,input,select,textarea")) return;
    // v6: aqui NÃO nasce arraste nenhum — só a intenção. Quem decide é o limiar, no efeito abaixo.
    // Enquanto isso o card segue montado, e é isso que deixa o `click` (abrir o lead) acontecer.
    pendenteRef.current = { leadId, etapa, indice, x0: e.clientX, y0: e.clientY, el: e.currentTarget as HTMLElement };
    setPendente(true);
  }, []);

  // promove a intenção a arraste no primeiro movimento acima do limiar; soltar antes disso é clique
  useEffect(() => {
    if (!pendente) return;
    function mover(e: PointerEvent) {
      const p = pendenteRef.current;
      if (!p) return;
      if (Math.abs(e.clientX - p.x0) < LIMIAR_ARRASTE && Math.abs(e.clientY - p.y0) < LIMIAR_ARRASTE) return;
      const raiz = trilhoRef.current;
      if (!raiz) return;
      const el = p.el.getBoundingClientRect();
      pegaRef.current = { dx: p.x0 - el.left, dy: p.y0 - el.top };
      x.set(el.left);
      y.set(el.top);
      snapRef.current = tirarSnapshot(raiz, p.leadId, el.height);
      setArraste({
        leadId: p.leadId,
        etapaOrigem: p.etapa,
        indiceOrigem: p.indice,
        largura: el.width,
        altura: el.height,
        porTeclado: false,
      });
      setAlvo({ etapa: p.etapa, indice: p.indice });
      setAnuncio(`${nomeDoLead(p.leadId)} pego. Arraste para outra etapa.`);
      pendenteRef.current = null;
      setPendente(false);
    }
    function fim() {
      pendenteRef.current = null;
      setPendente(false);
    }
    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerup", fim);
    document.addEventListener("pointercancel", fim);
    return () => {
      document.removeEventListener("pointermove", mover);
      document.removeEventListener("pointerup", fim);
      document.removeEventListener("pointercancel", fim);
    };
  }, [pendente, nomeDoLead, x, y]);

  /*
   * v6 · As teclas que valem ENQUANTO um card está pego moram AQUI, e são escutadas no documento
   * (efeito abaixo) — não no card. Na v5 elas viviam no `onKeyDown` do card, e o card era desmontado
   * no instante em que era pego: o foco caía no `body` e setas, Espaço e Esc não chegavam a ninguém.
   * O card ficava preso no ar até recarregar a página. Devolve true quando consumiu a tecla.
   */
  const teclaComPego = useCallback(
    (key: string): boolean => {
      if (!arraste) return false;
      if (key === " " || key === "Spacebar") {
        soltar(false);
        return true;
      }
      if (key === "Escape") {
        soltar(true);
        return true;
      }
      if (!alvo) return false;
      const i = etapasDestino.indexOf(alvo.etapa);
      if (key === "ArrowLeft" || key === "ArrowRight") {
        const prox = etapasDestino[key === "ArrowLeft" ? Math.max(0, i - 1) : Math.min(etapasDestino.length - 1, i + 1)];
        if (!prox || prox === alvo.etapa) return true;
        const tamanho = ordemDaColuna(prox).filter((x) => x !== arraste.leadId).length;
        const indice = Math.min(alvo.indice, tamanho);
        setAlvo({ etapa: prox, indice });
        setAnuncio(`${nomeDaEtapa(prox)}, posição ${indice + 1} de ${tamanho + 1}.`);
        return true;
      }
      if (key === "ArrowUp" || key === "ArrowDown") {
        const tamanho = ordemDaColuna(alvo.etapa).filter((x) => x !== arraste.leadId).length;
        const indice = Math.max(0, Math.min(tamanho, alvo.indice + (key === "ArrowUp" ? -1 : 1)));
        if (indice === alvo.indice) return true;
        setAlvo({ ...alvo, indice });
        setAnuncio(`Posição ${indice + 1} de ${tamanho + 1}.`);
        return true;
      }
      return false;
    },
    [arraste, alvo, etapasDestino, ordemDaColuna, nomeDaEtapa, soltar],
  );

  // enquanto há card pego por teclado, as teclas valem no documento inteiro — mesmo que o foco
  // escape (remontagem, rolagem, clique fora). É a rede que faltava para Esc SEMPRE devolver o card.
  useEffect(() => {
    if (!arraste?.porTeclado) return;
    function tecla(e: KeyboardEvent) {
      if (teclaComPego(e.key)) e.preventDefault();
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [arraste, teclaComPego]);

  const teclaNoCard = useCallback(
    (e: React.KeyboardEvent, leadId: string, etapa: string, indice: number) => {
      // com um card já pego, quem manda é o listener do documento — aqui só se PEGA
      if (arraste) return;
      if (e.key !== " " && e.key !== "Spacebar") return;
      e.preventDefault();
      const el = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-card]");
      const r = el?.getBoundingClientRect();
      setArraste({ leadId, etapaOrigem: etapa, indiceOrigem: indice, largura: r?.width ?? 0, altura: r?.height ?? 0, porTeclado: true });
      setAlvo({ etapa, indice });
      setAnuncio(`${nomeDoLead(leadId)} pego. Use as setas para escolher a etapa e a posição, espaço para soltar, Esc para cancelar.`);
    },
    [arraste, nomeDoLead],
  );

  const propsCard = useCallback(
    (leadId: string, etapa: string, indice: number) => ({
      "data-card": leadId,
      onPointerDown: (e: React.PointerEvent) => começar(e, leadId, etapa, indice),
      onKeyDown: (e: React.KeyboardEvent) => teclaNoCard(e, leadId, etapa, indice),
    }),
    [começar, teclaNoCard],
  );

  return { arraste, alvo, trilhoRef, propsCard, anuncio, x, y };
}

/** O buraco onde o card vai cair: tracejado, altura exata, aberto com mola. */
export function PlaceholderArraste({ altura }: { altura: number }) {
  const reduzido = useReducedMotion();
  return (
    <motion.div
      layout={!reduzido}
      initial={reduzido ? false : { opacity: 0, scaleY: 0.85 }}
      animate={{ opacity: 1, scaleY: 1 }}
      transition={reduzido ? { duration: 0 } : MOLA_FLUXO}
      style={{ height: altura }}
      className="shrink-0 rounded-[10px] border border-dashed border-linha-forte bg-hover/40"
      aria-hidden
    />
  );
}

/** O card no ar: `fixed`, segue o cursor, levanta 3% e inclina 1,6°. */
export function OverlayArraste({
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

/** O contador do cabeçalho, que conta o DESTINO durante o arraste e anima a troca do número. */
export function ContadorColuna({ valor }: { valor: number }) {
  const reduzido = useReducedMotion();
  return (
    <span className="ml-auto grid rounded-full border border-linha bg-branco px-2 py-px font-mono text-[11.5px] tabular-nums text-suave">
      <motion.span
        key={valor}
        /*
         * NUNCA parte de `opacity: 0`, e o motivo foi MEDIDO: numa aba oculta (ou numa captura
         * headless) o motion não roda a animação e o elemento congela no `initial` — o contador
         * sumia, e um número que some é pior que um número que não anima. Partindo de 0,45 o pior
         * caso é um número um pouco apagado, ainda legível.
         */
        initial={reduzido ? false : { y: -5, opacity: 0.45 }}
        animate={{ y: 0, opacity: 1 }}
        transition={reduzido ? { duration: 0 } : MOLA_FLUXO}
        style={{ gridArea: "1 / 1" }}
      >
        {valor}
      </motion.span>
    </span>
  );
}

/**
 * A barra de rolagem do trilho — própria, não a do sistema.
 *
 * No macOS a nativa só aparece DEPOIS que a pessoa já começou a rolar: quem não sabe que há
 * coluna escondida à direita não descobre. Esta fica visível enquanto houver para onde ir, e é
 * arrastável. O fade nas bordas acende só do lado que ainda esconde coluna.
 */
export function TrilhoRolagem({ alvoRef }: { alvoRef: React.RefObject<HTMLDivElement> }) {
  const [estado, setEstado] = useState({ largura: 0, esquerda: 0, visivel: false });
  const arrastandoRef = useRef<{ x0: number; scroll0: number } | null>(null);

  const medir = useCallback(() => {
    const el = alvoRef.current;
    if (!el) return;
    const razao = el.clientWidth / el.scrollWidth;
    if (razao >= 0.999) return setEstado({ largura: 0, esquerda: 0, visivel: false });
    const largura = Math.max(48, el.clientWidth * razao);
    const max = el.scrollWidth - el.clientWidth;
    const esquerda = max > 0 ? (el.scrollLeft / max) * (el.clientWidth - largura) : 0;
    setEstado({ largura, esquerda, visivel: true });
  }, [alvoRef]);

  useEffect(() => {
    const el = alvoRef.current;
    if (!el) return;
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", medir);
      ro.disconnect();
    };
  }, [alvoRef, medir]);

  useEffect(() => {
    function mover(e: PointerEvent) {
      const el = alvoRef.current;
      const p = arrastandoRef.current;
      if (!el || !p) return;
      const max = el.scrollWidth - el.clientWidth;
      const curso = el.clientWidth - estado.largura;
      el.scrollLeft = p.scroll0 + ((e.clientX - p.x0) / Math.max(1, curso)) * max;
    }
    function largar() {
      arrastandoRef.current = null;
    }
    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerup", largar);
    return () => {
      document.removeEventListener("pointermove", mover);
      document.removeEventListener("pointerup", largar);
    };
  }, [alvoRef, estado.largura]);

  if (!estado.visivel) return null;
  return (
    <div
      className="relative mx-6 mb-2 h-1.5 shrink-0 rounded-full bg-hover"
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        const el = alvoRef.current;
        if (!el) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        el.scrollLeft = ratio * (el.scrollWidth - el.clientWidth);
      }}
    >
      <div
        role="scrollbar"
        aria-orientation="horizontal"
        aria-controls="trilho-funil"
        tabIndex={-1}
        onPointerDown={(e) => {
          const el = alvoRef.current;
          if (!el) return;
          arrastandoRef.current = { x0: e.clientX, scroll0: el.scrollLeft };
        }}
        style={{ width: estado.largura, transform: `translateX(${estado.esquerda}px)` }}
        className="h-full cursor-grab rounded-full bg-linha-forte transition-colors hover:bg-mute active:cursor-grabbing"
      />
    </div>
  );
}

/** As máscaras de fade do trilho — acendem só do lado que ainda esconde coluna. */
export function useFadeTrilho(alvoRef: React.RefObject<HTMLDivElement>): { esquerda: boolean; direita: boolean } {
  const [fade, setFade] = useState({ esquerda: false, direita: false });
  useEffect(() => {
    const el = alvoRef.current;
    if (!el) return;
    const medir = () => {
      setFade({
        esquerda: el.scrollLeft > 4,
        direita: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      });
    };
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", medir);
      ro.disconnect();
    };
  }, [alvoRef]);
  return fade;
}

/** A região que o leitor de tela escuta durante o arraste. */
export function AnuncioArraste({ texto }: { texto: string }) {
  return (
    <span aria-live="polite" aria-atomic className="sr-only">
      {texto}
    </span>
  );
}
