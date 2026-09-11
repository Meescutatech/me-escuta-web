"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ondeCurto, useJarvis, type AvisoJarvis } from "@/lib/jarvis/contexto";
import { avisoEnsaioDaTela } from "@/lib/ensaio/jarvis-telas";
import { MarcaJarvis } from "./marca";
import { useMovimento } from "./movimento";
import { PequenoJarvis } from "./pequeno";

/**
 * O DOCK DO JARVIS (W-JX, 11/09/2026 · v2, depois do "não pode ficar assim jogado no canto,
 * e precisa ter contexto do que vai falar").
 *
 * POR QUE O CANTO INFERIOR DIREITO (a justificativa que o Diogo pediu):
 *  1. o header já tem o gatilho do painel lateral, e dois botões do mesmo agente na mesma barra é
 *     o anti-padrão nº 3 da pesquisa (três desenhos para uma entidade);
 *  2. é o único lugar que existe em TODAS as telas, inclusive nas de altura cheia que não rolam
 *     (/conversas, /funil, /tarefas) — é por isso que o carimbo de build já mora lá;
 *  3. é onde o mercado ancorou: Linear no canto inferior direito, Intercom na borda direita.
 *
 * O QUE MUDOU NA v2 — ele deixou de ser um enfeite solto:
 *  · a pílula DIZ DE ONDE VEM o que ela tem a dizer: `no funil · 3 leads parados`, `em tarefas ·
 *    7 vencidas`, `nesta conversa · sem resposta há 2 h`. O "de onde" sai da rota e do que a tela
 *    registrou em `useContextoJarvis`;
 *  · passar o mouse abre uma PRÉVIA de uma linha do que ele diria — dá para decidir se vale abrir
 *    sem abrir nada;
 *  · clicar entra no MODO PEQUENO ali mesmo: a pílula vira campo e ele responde em até três linhas.
 *    Nada escurece, nada se move por baixo. O popup fica para blocos, listas e trace.
 *
 * A pílula, o campo pequeno e o popup são a MESMA casca (`layoutId="jarvis-casca"`): uma vira a
 * outra com mola, em vez de uma sumir e outra aparecer. Com `prefers-reduced-motion` a morfose não
 * acontece — só a troca.
 */

/** A física da morfose pílula ↔ campo (referência `animated-search-bar` do 21st.dev). */
export const MORFOSE = { type: "spring", duration: 0.55, bounce: 0.15 } as const;

/** distância das bordas quando o canto está livre, e o respiro sobre quem já estiver lá */
const BASE = 24;
const RESPIRO = 8;

export function DockJarvis({ ensaio = false }: { ensaio?: boolean }) {
  const { abrir, fechar, modo, contexto } = useJarvis();
  const mov = useMovimento();
  const [montado, setMontado] = useState(false);
  const [sobre, setSobre] = useState(false);
  const [base, setBase] = useState(BASE);
  const [atalhoDaTela, setAtalhoDaTela] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  /**
   * Quem mais já ocupa o canto inferior direito — e o dock se empilha 8px acima do mais alto.
   *
   * Por HIT-TESTING (`elementsFromPoint`), não varrendo o DOM: varrer `body *` com
   * `getComputedStyle` custa milhares de leituras de layout numa tela densa como o funil, e o
   * navegador já sabe responder "o que está pintado aqui". De brinde, `elementsFromPoint` ignora
   * quem tem `pointer-events:none` — que é exatamente o caso do carimbo de build, que eu NÃO devo
   * evitar (ele é decorativo e fica por baixo).
   */
  const medirCanto = useCallback(() => {
    if (typeof window === "undefined") return;
    const { innerHeight: alturaJanela, innerWidth: larguraJanela } = window;
    let topoMaisAlto = alturaJanela;
    for (let dx = 24; dx <= 220; dx += 48) {
      for (let dy = 6; dy <= 140; dy += 10) {
        const x = larguraJanela - dx;
        const y = alturaJanela - dy;
        for (const alvo of document.elementsFromPoint(x, y)) {
          if (!(alvo instanceof HTMLElement)) continue;
          if (raiz.current?.contains(alvo)) break; // é o meu próprio dock: para de subir aqui
          let no: HTMLElement | null = alvo;
          while (no && no !== document.body) {
            if (window.getComputedStyle(no).position === "fixed") {
              if (raiz.current?.contains(no)) break;
              const r = no.getBoundingClientRect();
              if (r.width > 0 && r.width <= 520 && alturaJanela - r.bottom <= 140) topoMaisAlto = Math.min(topoMaisAlto, r.top);
              break;
            }
            no = no.parentElement;
          }
        }
      }
    }
    const proposto = topoMaisAlto >= alturaJanela ? BASE : Math.round(alturaJanela - topoMaisAlto + RESPIRO);
    setBase((atual: number) => (Math.abs(atual - proposto) < 2 ? atual : proposto));
  }, []);

  useLayoutEffect(() => {
    medirCanto();
    const atrasada = setTimeout(medirCanto, 400);
    let relogio: ReturnType<typeof setTimeout> | null = null;
    const aoRedimensionar = () => {
      if (relogio) clearTimeout(relogio);
      relogio = setTimeout(medirCanto, 120);
    };
    window.addEventListener("resize", aoRedimensionar);
    return () => {
      clearTimeout(atrasada);
      if (relogio) clearTimeout(relogio);
      window.removeEventListener("resize", aoRedimensionar);
    };
  }, [medirCanto, contexto.rota]);

  /*
   * A TELA PODE TER FICADO COM O ⌘K (`data-jarvis-atalho-local` — o /funil ficou, combinado com o
   * dono). Nesse caso o hint "⌘K" na pílula vira MENTIRA: ali o ⌘K foca a busca dele. Mostramos
   * ⇧⌘K, que é o que realmente abre daquela tela.
   */
  useEffect(() => {
    const conferir = () => setAtalhoDaTela(Boolean(document.querySelector("[data-jarvis-atalho-local]")));
    conferir();
    // a tela pode montar o campo DEPOIS do dock (o shell e a página montam em ordens diferentes, e
    // o Next ainda streama) — medido em 11/09 no /funil, onde o hint saiu "⌘K" na primeira pintura
    const t1 = setTimeout(conferir, 400);
    const t2 = setTimeout(conferir, 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [contexto.rota, contexto.busca, montado]);

  // o dock só entra depois da primeira pintura: evita que ele apareça "já lá" no carregamento
  useEffect(() => {
    const t = setTimeout(() => setMontado(true), 150);
    return () => clearTimeout(t);
  }, []);

  const aviso: AvisoJarvis | null = contexto.aviso ?? (ensaio ? avisoEnsaioDaTela(contexto.rota) : null);
  const onde = aviso?.onde ?? ondeCurto(contexto);
  const assunto = aviso ? (aviso.quantidade != null ? `${aviso.quantidade} ${aviso.texto}` : aviso.texto) : null;
  const pilula = montado && modo === "fechado";
  const tecla = atalhoDaTela ? "⇧⌘K" : "⌘K";

  return (
    <div ref={raiz} style={{ bottom: base }} className="fixed right-6 z-40 flex flex-col items-end gap-2">
      {/* a prévia: uma linha do que ele diria, antes de abrir qualquer coisa */}
      <AnimatePresence>
        {pilula && sobre && aviso?.previa && (
          <motion.p
            key="previa"
            initial={mov.reduzido ? { opacity: 0 } : { opacity: 0, y: 6, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={mov.reduzido ? { duration: 0.14 } : { type: "spring", duration: 0.45, bounce: 0.2 }}
            className="max-w-[320px] rounded-lg border border-border/60 bg-popover px-3 py-2 text-[12px] leading-snug text-muted-foreground shadow-[0_6px_20px_rgba(31,35,40,.12)]"
          >
            {aviso.previa}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence mode="popLayout">
        {pilula && (
          <motion.button
            key="pilula"
            type="button"
            layout
            layoutId={mov.reduzido ? undefined : "jarvis-casca"}
            style={{ borderRadius: 999 }}
            onMouseEnter={() => setSobre(true)}
            onMouseLeave={() => setSobre(false)}
            onFocus={() => setSobre(true)}
            onBlur={() => setSobre(false)}
            onClick={() => abrir(aviso?.pergunta ?? null)}
            initial={mov.reduzido ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={mov.reduzido ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={mov.reduzido ? { duration: 0.12 } : MORFOSE}
            aria-label={assunto ? `Jarvis — ${onde}: ${assunto}` : "Perguntar ao Jarvis"}
            aria-keyshortcuts={atalhoDaTela ? "Shift+Meta+K Shift+Control+K" : "Meta+K Control+K"}
            title={assunto ? `${onde}: ${assunto} — perguntar ao Jarvis (${tecla})` : `Perguntar ao Jarvis (${tecla})`}
            className={cn(
              "group flex items-center border border-border bg-card text-foreground shadow-[0_2px_10px_rgba(31,35,40,.10)] transition-colors",
              "hover:border-foreground/25 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              assunto ? "h-9 gap-2 pl-3 pr-2.5" : "size-9 justify-center",
            )}
          >
            <motion.span layout="position" className="grid place-items-center">
              <MarcaJarvis tamanho={20} vivo={Boolean(assunto)} />
            </motion.span>
            {assunto && (
              <motion.span layout="position" className="flex min-w-0 items-baseline gap-1.5 text-[12.5px] leading-none">
                <span className="shrink-0 whitespace-nowrap text-muted-foreground">{onde}</span>
                <span className="shrink-0 text-muted-foreground/50" aria-hidden>
                  ·
                </span>
                {/* é PÍLULA, não frase: o aviso da tela pode vir comprido ("14 leads parados além
                    do prazo da etapa") e aqui ele trunca — quem quer a frase inteira passa o mouse
                    e lê a prévia, ou abre */}
                <span className="max-w-[22ch] truncate font-medium" title={assunto ?? undefined}>
                  {assunto}
                </span>
                <kbd className="ml-1 hidden shrink-0 rounded-[4px] border border-border bg-muted px-1 py-px font-sans text-[10px] leading-[14px] text-muted-foreground sm:inline">{tecla}</kbd>
              </motion.span>
            )}
          </motion.button>
        )}

        {montado && modo === "pequeno" && <PequenoJarvis key="pequeno" aoFechar={fechar} />}
      </AnimatePresence>
    </div>
  );
}
