"use client";

import { useEffect, useRef, useState } from "react";
import { MarcaJarvis } from "@/components/jarvis/marca";
import { EXEMPLOS_JARVIS, NAO_ENTENDI, aplicarLeitura, interpretarBusca, type LeituraJarvis } from "@/lib/dados/funil-jarvis";
import type { FiltrosFunil } from "@/lib/dados/funil-filtros";
import type { EtapaFunil } from "@/lib/dados/funil";
import { cn } from "@/lib/utils";

/*
 * W-D6 v4 (11/09 00:05) · A BUSCA COM O JARVIS — o pedido central do Diogo: "o Jarvis deve estar
 * presente em todo o sistema".
 *
 * O campo aceita duas coisas ao mesmo tempo, e a diferença é do usuário, não de um seletor de modo:
 *  · TEXTO CURTO ("maria", "99881") continua sendo busca por nome/telefone — é o caso de 90% das
 *    vezes e não precisa de interpretação nenhuma;
 *  · PERGUNTA ("leads de BH sem tarefa na proposta") vira FILTROS. O Enter chama o Jarvis.
 *
 * A regra que define o desenho: **ele devolve filtros, não uma lista mágica.** Depois do Enter, os
 * chips aparecem na barra (removíveis, editáveis) e uma linha do arco diz "entendi assim: cidade:
 * Belo Horizonte · sem próxima ação · etapa: Proposta enviada — 7 leads". A pessoa confere a
 * interpretação e corrige um chip; a conta continua sendo a do board. Lista opaca seria o oposto
 * da Constituição §1.2 (o agente propõe, o humano valida).
 *
 * Quando ele não entende, DIZ que não entendeu e não mexe em filtro nenhum — e o texto segue
 * valendo como busca comum. Inventar um recorte a partir de palavra solta é o modo de falha que
 * faria a Sara desconfiar da tela inteira.
 *
 * `⌘K` foca o campo de qualquer lugar do board.
 */

export function BuscaJarvis({
  filtros,
  onChange,
  etapas,
  cidadesConhecidas,
  temUsuario,
  qtdResultado,
  leitura,
  onLeitura,
}: {
  filtros: FiltrosFunil;
  onChange: (f: FiltrosFunil) => void;
  etapas: EtapaFunil[];
  cidadesConhecidas: string[];
  temUsuario: boolean;
  /** quantos leads o recorte atual devolveu — a linha do arco fecha com o número */
  qtdResultado: number;
  /** a última leitura (mora no board, para a linha do arco sobreviver a re-render) */
  leitura: LeituraJarvis | null;
  onLeitura: (l: LeituraJarvis | null) => void;
}) {
  const [foco, setFoco] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [naoEntendi, setNaoEntendi] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K foca a busca de qualquer lugar do board
  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    }
    document.addEventListener("keydown", atalho);
    return () => document.removeEventListener("keydown", atalho);
  }, []);

  function perguntar(frase: string) {
    const r = interpretarBusca(frase, { etapas, cidadesConhecidas, temUsuario });
    if (!r.entendeu) {
      setNaoEntendi(true);
      onLeitura(null);
      return;
    }
    setNaoEntendi(false);
    // o "pensando" é curto de propósito: 320 ms é o tempo de o arco acender e a pessoa perceber
    // QUEM respondeu. Mais que isso seria teatro; menos, e a troca de filtros parece mágica.
    setPensando(true);
    setTimeout(() => {
      setPensando(false);
      onLeitura(r);
      onChange(aplicarLeitura(filtros, r));
      ref.current?.blur();
    }, 320);
  }

  const valor = filtros.busca;
  const sugerir = foco && valor.trim().length === 0;

  return (
    <div className="relative min-w-[300px] flex-1 md:max-w-[520px]">
      <div
        className={cn(
          "flex h-9 items-center gap-2 rounded-[8px] border bg-branco px-2.5 transition-colors",
          foco ? "border-laranja/70 ring-2 ring-laranja/15" : "border-linha hover:border-linha-forte",
        )}
      >
        <MarcaJarvis tamanho={16} vivo={pensando} className={cn(pensando ? "text-laranja" : "text-suave")} />
        <input
          ref={ref}
          value={valor}
          onChange={(e) => {
            onChange({ ...filtros, busca: e.target.value });
            if (naoEntendi) setNaoEntendi(false);
          }}
          onFocus={() => setFoco(true)}
          // o blur atrasa para o clique numa sugestão chegar antes de a lista desmontar
          onBlur={() => setTimeout(() => setFoco(false), 140)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valor.trim().length > 2) perguntar(valor);
            if (e.key === "Escape") {
              onChange({ ...filtros, busca: "" });
              setNaoEntendi(false);
              ref.current?.blur();
            }
          }}
          placeholder="Buscar ou perguntar ao Jarvis…"
          aria-label="Buscar lead ou perguntar ao Jarvis"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-tinta outline-none placeholder:text-mute"
        />
        {valor.trim().length > 2 ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => perguntar(valor)}
            className="shrink-0 rounded-[5px] bg-laranja-cl px-2 py-1 text-[11.5px] font-semibold text-laranja-esc transition-colors hover:bg-pessego"
          >
            Perguntar ⏎
          </button>
        ) : (
          <kbd className="shrink-0 rounded-[4px] border border-linha px-1.5 py-px font-mono text-[10.5px] text-mute">⌘K</kbd>
        )}
      </div>

      {/* sugestões ao focar: quatro frases que FUNCIONAM (a lista é a mesma do teste) */}
      {sugerir && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-full overflow-hidden rounded-[10px] border border-linha bg-branco p-1.5 shadow-[0_10px_34px_rgba(37,47,99,.16)]">
          <p className="px-2 pb-1 pt-0.5 text-[11px] text-mute">Pergunte com suas palavras — o Jarvis vira filtro</p>
          {EXEMPLOS_JARVIS.slice(0, 4).map((frase) => (
            <button
              key={frase}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange({ ...filtros, busca: frase });
                perguntar(frase);
              }}
              className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12.5px] text-suave transition-colors hover:bg-hover hover:text-tinta"
            >
              <MarcaJarvis tamanho={16} className="text-mute" />
              <span className="min-w-0 truncate">{frase}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A linha do arco: o que ele entendeu e quantos leads sobraram. Fica sob a barra, com os chips. */
export function LinhaJarvis({
  leitura,
  qtd,
  naoEntendi,
  onDescartar,
}: {
  leitura: LeituraJarvis | null;
  qtd: number;
  naoEntendi: boolean;
  onDescartar: () => void;
}) {
  if (naoEntendi) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-suave">
        <MarcaJarvis tamanho={16} className="text-mute" />
        {NAO_ENTENDI}
      </span>
    );
  }
  if (!leitura?.entendeu) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-suave">
      <MarcaJarvis tamanho={16} className="text-laranja" />
      <span className="min-w-0 truncate">
        entendi assim — <span className="text-tinta">{leitura.explicacao}</span> ·{" "}
        {/* zero resultado com a interpretação CERTA é um caso real (e comum): a frase virou um
            recorte que a operação não tem hoje. Dizer só "0 leads" deixaria a pessoa achando que a
            busca falhou; a frase seguinte diz o que fazer. */}
        <span className="tabular-nums">{qtd === 1 ? "1 lead" : `${qtd.toLocaleString("pt-BR")} leads`}</span>
        {qtd === 0 && <span className="text-mute"> — tire um chip para alargar</span>}
      </span>
      <button type="button" onClick={onDescartar} className="shrink-0 text-mute underline-offset-2 hover:text-tinta hover:underline">
        não era isso
      </button>
    </span>
  );
}
