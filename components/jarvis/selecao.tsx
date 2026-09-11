"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useJarvis } from "@/lib/jarvis/contexto";
import { MarcaJarvis } from "./marca";
import { useMovimento } from "./movimento";

/**
 * SELEÇÃO → "PERGUNTAR AO JARVIS SOBRE ISTO" (W-JX, 11/09/2026).
 *
 * O gesto que mais cabe na rotina da Sara: ela lê o fio, marca a frase do paciente e pergunta
 * dali. Intercom e Attio fazem exatamente isso sobre transcrição (pesquisa 11/09 §2), e o trecho é
 * o campo que o nosso contrato de tarefa já exige.
 *
 * INTEGRAÇÃO DE UMA LINHA para os donos das telas: ponha `data-jarvis-selecao` no contêiner onde
 * o gesto vale (o fio da conversa, a ficha do lead). Nada a importar — o provedor já escuta.
 * Fora desses contêineres, selecionar texto não faz nada, que é o certo: botão flutuante em toda
 * seleção da tela é ruído.
 */

const MAX = 280;

export function SelecaoJarvis() {
  const { abrir, aberto } = useJarvis();
  const mov = useMovimento();
  const [alvo, setAlvo] = useState<{ texto: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (aberto) {
      setAlvo(null);
      return;
    }
    let relogio: ReturnType<typeof setTimeout> | null = null;
    const avaliar = () => {
      const sel = window.getSelection();
      const texto = sel?.toString().trim() ?? "";
      if (!sel || sel.rangeCount === 0 || texto.length < 3) return setAlvo(null);
      const no = sel.anchorNode;
      const el = no instanceof Element ? no : no?.parentElement;
      if (!el?.closest("[data-jarvis-selecao]")) return setAlvo(null);
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return setAlvo(null);
      setAlvo({ texto: texto.slice(0, MAX), x: r.left + r.width / 2, y: r.top });
    };
    const agendar = () => {
      if (relogio) clearTimeout(relogio);
      relogio = setTimeout(avaliar, 120);
    };
    document.addEventListener("selectionchange", agendar);
    window.addEventListener("scroll", () => setAlvo(null), true);
    return () => {
      if (relogio) clearTimeout(relogio);
      document.removeEventListener("selectionchange", agendar);
    };
  }, [aberto]);

  return (
    <AnimatePresence>
      {alvo && (
        <motion.button
          type="button"
          initial={mov.reduzido ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: mov.reduzido ? 0.1 : 0.16 }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            abrir(`O que o Jarvis diz sobre isto: “${alvo.texto}”`);
            setAlvo(null);
          }}
          style={{ left: alvo.x, top: Math.max(alvo.y - 10, 12) }}
          className="fixed z-[55] flex -translate-x-1/2 -translate-y-full items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-popover px-2.5 py-1 text-[12px] text-foreground shadow-[0_4px_16px_rgba(31,35,40,.14)] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <MarcaJarvis tamanho={16} />
          Perguntar sobre isto
        </motion.button>
      )}
    </AnimatePresence>
  );
}
