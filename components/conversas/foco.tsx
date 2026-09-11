"use client";

import { useEffect } from "react";
import { ZapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversaEmFoco } from "@/lib/tarefas/foco";

/**
 * O MODO FOCO DENTRO DE /conversas (W-D3 v6, 11/09 — decisão do Diogo às 00:20: "o modo foco
 * agora É a tela de conversas").
 *
 * O que muda ao ligar: a LISTA passa a mostrar só as conversas cujo lead tem tarefa pendente sua,
 * na ordem de ataque (vencidas → hoje → futuras), e cada item mostra a TAREFA no lugar da prévia.
 * O que NÃO muda: a estrutura. Lista, fio e painel continuam exatamente onde estavam — ligar e
 * desligar troca conteúdo, nunca caixas, e por isso não há pulo. É o mesmo princípio do escopo de
 * departamento: o recorte entra como predicado, a moldura fica quieta.
 *
 * O gatilho é UM botão (raio), na linha da busca, com o número de tarefas esperando. Nada na
 * navbar: o foco é um jeito de olhar ESTA tela, não um lugar novo do app.
 */

/**
 * A MOLDURA DO FOCO e o sumiço do shell (Diogo, 01:00 — "eliminar distração", e o desafio
 * nomeado: ZERO layout shift).
 *
 * Ligar o foco marca `data-foco="1"` no `<html>`; as regras abaixo fazem o resto, e todas mexem
 * em PROPRIEDADES ANIMÁVEIS, nunca em `display`:
 *  · a sidebar e o header saem por opacidade + translação — continuam no DOM, apenas fora do
 *    caminho e sem receber clique;
 *  · o espaço que eles ocupavam é devolvido por `padding` com transição de 200ms, e a altura do
 *    fio acompanha porque `--altura-topo` vira 0 no modo (o token é um só, como manda a casa);
 *  · a moldura é um retângulo fixo com quatro gradientes que somem para dentro: não pisca, não
 *    pulsa e não intercepta ponteiro.
 *
 * O `<style>` mora AQUI e não no `globals.css` de propósito: é regra de UMA tela, e morre com ela.
 */
export function MolduraFoco({ ligado }: { ligado: boolean }) {
  useEffect(() => {
    const el = document.documentElement;
    if (ligado) el.dataset.foco = "1";
    else delete el.dataset.foco;
    return () => {
      delete el.dataset.foco;
    };
  }, [ligado]);

  return (
    <>
      <style>{`
        .min-h-screen { transition: padding-left 200ms ease; }
        main { transition: padding-top 200ms ease; }
        aside.lateral-r9, header[role="banner"] { transition: opacity 180ms ease, transform 200ms ease; }
        html[data-foco="1"] { --altura-topo: 0px; }
        html[data-foco="1"] .min-h-screen { padding-left: 0; }
        html[data-foco="1"] aside.lateral-r9 { opacity: 0; transform: translateX(-100%); pointer-events: none; }
        html[data-foco="1"] aside.lateral-r9:hover, html[data-foco="1"] aside.lateral-r9:focus-within { width: 60px; box-shadow: none; }
        html[data-foco="1"] header[role="banner"] { opacity: 0; transform: translateY(-100%); pointer-events: none; }
      `}</style>
      <div
        aria-hidden
        className={cn("pointer-events-none fixed inset-0 z-[60] transition-opacity duration-300", ligado ? "opacity-100" : "opacity-0")}
        style={{
          backgroundImage: [
            "linear-gradient(to bottom, rgba(236,102,46,.28), rgba(236,102,46,0) 10px)",
            "linear-gradient(to top, rgba(236,102,46,.28), rgba(236,102,46,0) 10px)",
            "linear-gradient(to right, rgba(236,102,46,.28), rgba(236,102,46,0) 10px)",
            "linear-gradient(to left, rgba(236,102,46,.28), rgba(236,102,46,0) 10px)",
          ].join(","),
          boxShadow: "inset 0 0 0 1.5px rgba(236,102,46,.45)",
        }}
      />
    </>
  );
}

export function BotaoFoco({ ligado, pendentes, onAlternar }: { ligado: boolean; pendentes: number; onAlternar: () => void }) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-pressed={ligado}
      title={ligado ? "Sair do foco" : pendentes > 0 ? `Foco: ${pendentes} ${pendentes === 1 ? "conversa espera" : "conversas esperam"} por você` : "Foco: nada esperando por você"}
      aria-label={ligado ? "Sair do modo foco" : `Entrar no modo foco — ${pendentes} conversas com tarefa pendente`}
      className={cn(
        "relative grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40",
        ligado ? "bg-laranja-cl text-laranja-esc" : "text-mute hover:bg-hover hover:text-navy",
      )}
    >
      <ZapIcon className={cn("size-4", ligado && "fill-current")} strokeWidth={2} />
      {!ligado && pendentes > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-[14px] min-w-[14px] place-items-center rounded-full bg-laranja px-[3px] text-[9px] font-bold leading-none text-branco ring-2 ring-branco">
          {pendentes > 9 ? "9+" : pendentes}
        </span>
      )}
    </button>
  );
}

/**
 * A linha de contagem do topo da fila — ocupa o lugar das abas, não soma altura, e traz a barra
 * fininha do percurso. Sem "sair do foco" aqui: quem tira do modo é o raio, e só ele (01:00) —
 * dois botões para a mesma saída é o tipo de redundância que faz a pessoa procurar o terceiro.
 */
export function ContagemFoco({ linhas, feitas, posicao }: { linhas: ConversaEmFoco[]; feitas: number; posicao: number }) {
  const vencidas = linhas.filter((l) => l.tarefa.estado === "vencida").length;
  const total = linhas.length + feitas;
  const andado = total > 0 ? Math.min(100, Math.round(((feitas + Math.max(0, posicao)) / total) * 100)) : 0;
  return (
    <div className="relative flex h-8 items-center gap-2 border-b border-linha px-3 text-[12px]">
      <span className="min-w-0 truncate">
        {posicao >= 0 ? (
          <span className="font-semibold tabular-nums text-tinta">
            {feitas + posicao + 1} de {total}
          </span>
        ) : (
          <span className="font-semibold text-tinta">
            {linhas.length} {linhas.length === 1 ? "conversa" : "conversas"}
          </span>
        )}
        {vencidas > 0 && <span className="text-vermelho"> · {vencidas} {vencidas === 1 ? "vencida" : "vencidas"}</span>}
        {feitas > 0 && <span className="text-verde"> · {feitas} {feitas === 1 ? "feita" : "feitas"}</span>}
      </span>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-linha">
        <span className="block h-full bg-laranja transition-[width] duration-300" style={{ width: `${andado}%` }} />
      </span>
    </div>
  );
}

/** Fim da fila — dentro da própria lista, sem tela nova (Diogo: "estado zero por hoje"). */
export function FimDaFila({ feitas }: { feitas: number }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-[13px] font-medium text-tinta">Zero por hoje.</p>
      <p className="mt-1 text-[12px] leading-relaxed text-suave">
        {feitas > 0 ? (
          <>
            Você fechou {feitas} {feitas === 1 ? "conversa" : "conversas"} nesta rodada. Nada mais está esperando por você aqui.
          </>
        ) : (
          <>Nenhuma conversa com tarefa pendente sua. O que chegar de novo aparece aqui.</>
        )}
      </p>
      <p className="mt-2 text-[11.5px] text-mute">O raio no topo tira você do foco.</p>
    </div>
  );
}

/**
 * Atalhos do foco: ⏎ concluir · A adiar · P pular · Esc sai. Só quando o teclado não está num
 * campo — digitar "a" numa resposta ao paciente não pode adiar tarefa nenhuma.
 */
export function useAtalhosFoco({
  ligado,
  onConcluir,
  onAdiar,
  onPular,
  onSair,
}: {
  ligado: boolean;
  onConcluir: () => void;
  onAdiar: () => void;
  /** "próxima": J, seta direita e P caem todos aqui — pular rápido é o coração do modo */
  onPular: () => void;
  onSair: () => void;
}) {
  useEffect(() => {
    if (!ligado) return;
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const digitando = !!alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      if (e.key === "Escape" && !digitando) {
        onSair();
        return;
      }
      if (digitando || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        onConcluir();
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        onAdiar();
      } else if (e.key === "p" || e.key === "P" || e.key === "j" || e.key === "J" || e.key === "ArrowRight") {
        e.preventDefault();
        onPular();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ligado, onConcluir, onAdiar, onPular, onSair]);
}
