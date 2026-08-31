"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  carimbo,
  carimboSoHora,
  carimboPrazo,
  destino,
  ehEspecieDeTarefa,
  naoLida,
  podePromover,
  textoAtraso,
  type Notificacao,
} from "@/lib/notificacoes";
import {
  concluirTarefaNotificacao,
  marcarMencaoLida,
  promoverMencaoTarefa,
  marcarNotificacaoLida,
} from "@/app/(app)/notificacoes/actions";
import { chaveLeitura, ehTarefa, fraseF8, textoVenceEm } from "./regras";

/**
 * Item de notificação — o MESMO no popover e na visão expandida (é assim no mockup
 * notificacoes-sino-v3.html, classe `.n`, e é o que mantém as duas telas coerentes).
 *
 * Gramática do mockup, ao pé da letra:
 *  · não-lida = ponto laranja de 7px à esquerda + nome em tinta;
 *    lida = sem ponto e o texto inteiro em suave;
 *  · nenhum ícone colorido por tipo — o tipo vem ESCRITO ("mencionou você", "atribuiu", "venceu");
 *  · atraso é a única exceção cromática: vermelho, porque é a informação que muda a ação;
 *  · citação com filete à esquerda; menção dentro da citação vira chip navy sobre #EAECF5.
 */
export function ItemNotificacao({
  n,
  agoraMs,
  expandido = false,
}: {
  n: Notificacao;
  agoraMs: number;
  expandido?: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const lida = !naoLida(n);
  // F8: a frase conhece `tarefa_vencendo` e a tarefa que o Jarvis criou; o resto delega à antiga
  const { forte, resto } = fraseF8(n);
  const especie = n.especie;
  const atraso = especie === "tarefa_vencida" ? textoAtraso(n.prazo, agoraMs) : "";
  // "vence em 40 min" — a única linha em laranja: é prazo, não atraso (o vermelho fica pro vencido)
  const venceEm = especie === "tarefa_vencendo" ? textoVenceEm(n.prazo, agoraMs) : "";
  const citacao = n.especie === "mencao" ? n.trecho : n.titulo ? n.trecho : null;

  function abrir() {
    if (n.mencao_id && naoLida(n)) iniciar(() => void marcarMencaoLida(n.mencao_id!));
    // tarefa (F8, 0306): abrir marca lida ESTA espécie — ler "atribuída" não lê "vence em breve"
    const chave = ehTarefa(n) && naoLida(n) ? chaveLeitura(n) : null;
    if (chave) iniciar(() => void marcarNotificacaoLida(chave));
    const url = destino(n);
    if (url) router.push(url);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={abrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          abrir();
        }
      }}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 border-b border-[#F1F0EC] py-[11px] pl-3 pr-3.5 last:border-b-0 hover:bg-hover",
        expandido && "px-6",
        pendente && "opacity-70",
      )}
    >
      {/* ponto de não-lida — 7px, laranja; lida não tem ponto (ocupa o espaço, não pula) */}
      <span
        aria-label={lida ? undefined : "não lida"}
        className={cn(
          "mt-1.5 h-[7px] w-[7px] flex-none rounded-full",
          lida ? "bg-transparent" : "bg-laranja",
        )}
      />

      <span className="min-w-0 flex-1">
        <span className={cn("block text-[13.5px] leading-[1.45]", lida && "text-suave")}>
          <b className={cn("font-semibold", lida && "text-suave")}>{forte}</b>
          {resto}
        </span>

        {citacao && (
          <span className="mt-[3px] block border-l-2 border-linha pl-[9px] text-[12.5px] leading-[1.45] text-suave">
            <TrechoComMencoes texto={citacao} />
          </span>
        )}

        <span className="mt-[5px] flex flex-wrap items-center gap-x-[7px] gap-y-1 text-[11.5px] text-mute">
          {n.lead_nome && <span className="text-suave">{n.lead_nome}</span>}
          {atraso && <span className="whitespace-nowrap font-semibold text-vermelho">{atraso}</span>}
          {venceEm && <span className="whitespace-nowrap font-semibold text-laranja-esc">{venceEm}</span>}
          {/*
            O carimbo era escolhido por `especie === "mencao"`: menção mostrava a HORA e TODO o
            resto caía em `carimboPrazo`. Com o alarme de cobertura — que não tem prazo — isso
            renderizava a palavra **"sem prazo"** debaixo de um aviso que nunca teve prazo nenhum:
            a tela afirmando ausência de algo que não se aplica.
            Agora quem carimba prazo é a ESPÉCIE DE TAREFA; o resto (menção, alarme) carimba quando
            aconteceu, que é a informação que existe.
          */}
          {ehEspecieDeTarefa(especie) ? (
            <span className="whitespace-nowrap">{carimboPrazo(n.prazo, agoraMs)}</span>
          ) : (
            <span className="whitespace-nowrap font-mono tabular-nums">
              {/* na expandida o dia já está no cabeçalho do grupo — aqui só a hora */}
              {expandido ? carimboSoHora(n.quando) : carimbo(n.quando, agoraMs)}
            </span>
          )}
        </span>
      </span>

      {/*
        Ação direta. O popover tem 376px: no mockup só a tarefa VENCIDA carrega botão ali —
        é o que cabe sem estrangular a citação. A visão expandida, larga, mostra as duas ações:
        concluir a tarefa e transformar a menção pendente em tarefa (§7/§10.2).
      */}
      {n.tarefa_id && n.especie !== "mencao" && (expandido || n.especie === "tarefa_vencida") && (
        <BotaoAcao
          rotulo="Concluir"
          pendente={pendente}
          onAcao={() => iniciar(() => void concluirTarefaNotificacao(n.tarefa_id!, "concluída"))}
        />
      )}
      {expandido && podePromover(n) && (
        <BotaoAcao
          rotulo="Virar tarefa"
          titulo="Cria uma tarefa com o texto da menção e resolve a pendência"
          pendente={pendente}
          onAcao={() =>
            iniciar(() =>
              void promoverMencaoTarefa(n.mencao_id!, n.lead_id, n.trecho ?? "", n.ator),
            )
          }
        />
      )}
    </div>
  );
}

function BotaoAcao({
  rotulo,
  titulo,
  pendente,
  onAcao,
}: {
  rotulo: string;
  titulo?: string;
  pendente: boolean;
  onAcao: () => void;
}) {
  return (
    <button
      type="button"
      title={titulo}
      disabled={pendente}
      onClick={(e) => {
        e.stopPropagation();
        onAcao();
      }}
      className="ml-auto flex-none self-center rounded-[6px] border border-linha bg-branco px-2.5 py-1 text-[12px] font-semibold text-tinta hover:bg-hover disabled:opacity-50"
    >
      {rotulo}
    </button>
  );
}

/**
 * `@Fulano` dentro da citação vira chip navy — igual ao `.men` do mockup.
 * O chip cobre o NOME INTEIRO ("@Camila Rocha", não "@Camila"): nome próprio é sequência de
 * palavras capitalizadas. Agente vem em minúsculas e casa pelo segundo ramo ("@levindo").
 */
function TrechoComMencoes({ texto }: { texto: string }) {
  const partes = texto.split(/(@\p{Lu}\p{L}*(?:\s\p{Lu}\p{L}*)*|@[\w.-]+)/u);
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith("@") ? (
          <span key={i} className="rounded-[4px] bg-[#EAECF5] px-[3px] font-medium text-navy">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
