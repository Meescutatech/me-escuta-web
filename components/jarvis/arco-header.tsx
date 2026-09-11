"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useJarvis } from "@/lib/jarvis/contexto";
import { MarcaJarvis } from "./marca";

/**
 * O ARCO NO CENTRO DO HEADER — a presença do Jarvis no sistema inteiro (Diogo, 11/09, 16:45:
 * *"esse dot será a presença dele em todas as telas… o header será a cara do Jarvis"*).
 *
 * ── Por que o CENTRO, e não mais um ícone à direita ──────────────────────────────────────────
 * O centro do header é o único ponto da tela que não rola, não muda de lugar entre rotas e não
 * disputa espaço com conteúdo. Um ícone no canto direito é o que ele já era, e ninguém achava:
 * ali ele era o terceiro de três, ao lado do sino e do "relatar". No centro ele é o header.
 *
 * ── O que saiu junto, e por quê ──────────────────────────────────────────────────────────────
 * Saíram os três da direita (o gatilho que levava para `/jarvis`, o "relatar desta tela" e o
 * SINO) e a aba Jarvis da navegação. O arco os substitui de verdade, não por economia de espaço:
 * quem nota que algo precisa de atenção é ele, então o aviso é dele. Manter o sino ao lado seria
 * duas fontes para o mesmo fato, e a segunda envelhece.
 *
 * ── Os estados: o que muda é o PONTO, nunca o arco ───────────────────────────────────────────
 *  · quieto ......... monocromático, do tom do header;
 *  · pensando ....... ponto laranja pulsando (`vivo`, que já respeita prefers-reduced-motion);
 *  · tem algo ....... um anel abre e some UMA vez, e o ponto fica laranja até alguém abrir —
 *                     decidido assim porque insistir é reinventar o sino, e o sino é o vício que
 *                     esta mudança existe para matar (755 em vermelho no Kommo que ninguém olhava);
 *  · falando ........ a marca inteira em laranja enquanto a janela está aberta, para o olho saber
 *                     de onde ela saiu.
 *
 * Só o arco, com um pouco de destaque — sem pílula e sem texto (decisão do Diogo, 16:55). O anel
 * de foco e o realce de hover fazem o trabalho que a legenda faria, sem ocupar o centro com
 * palavra nenhuma.
 */
export function ArcoHeader() {
  const { abrir, aberto, contexto } = useJarvis();
  const aviso = contexto.aviso;

  // "tem algo a dizer" persiste ATÉ ABRIR, e não some sozinho com o tempo. O que se guarda é qual
  // aviso já foi visto: aviso novo volta a marcar, o mesmo aviso não remarca depois de aberto.
  const [vistoAgora, setVistoAgora] = useState<string | null>(null);
  const chaveAviso = aviso ? `${aviso.texto}|${aviso.quantidade ?? ""}` : null;
  const temNovidade = Boolean(chaveAviso) && chaveAviso !== vistoAgora;

  // o anel toca uma vez por aviso novo; o `key` reinicia a animação quando o aviso muda
  const [anel, setAnel] = useState(0);
  const anteriorRef = useRef<string | null>(null);
  useEffect(() => {
    if (chaveAviso && chaveAviso !== anteriorRef.current) setAnel((n) => n + 1);
    anteriorRef.current = chaveAviso;
  }, [chaveAviso]);

  useEffect(() => {
    if (aberto && chaveAviso) setVistoAgora(chaveAviso);
  }, [aberto, chaveAviso]);

  const vivo = aberto || temNovidade;

  return (
    <button
      type="button"
      onClick={() => abrir(aviso?.pergunta ?? null)}
      aria-label={
        temNovidade && aviso
          ? `Jarvis — ${aviso.texto}${aviso.onde ? ` ${aviso.onde}` : ""}`
          : "Perguntar ao Jarvis"
      }
      aria-haspopup="dialog"
      aria-expanded={aberto}
      title={aviso?.previa ?? "Perguntar ao Jarvis · ⌘K"}
      className={cn(
        "relative grid size-9 place-items-center rounded-full transition-colors",
        "text-mute hover:bg-hover hover:text-tinta",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45",
        (aberto || temNovidade) && "text-laranja hover:text-laranja",
      )}
    >
      {/* o anel: abre e some, uma vez por aviso. `pointer-events-none` para não comer o clique. */}
      {temNovidade && (
        <span
          key={anel}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border border-laranja/55 anel-jarvis"
        />
      )}
      <MarcaJarvis tamanho={20} vivo={vivo} />
    </button>
  );
}
