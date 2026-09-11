"use client";

import { useState } from "react";
import { CheckIcon, PencilLineIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversaResumo, Mensagem } from "@/lib/dados/conversas";
import type { Mencionavel } from "@/lib/conversas/mencao";

/**
 * PROPOSTA DO JARVIS SOB DEMANDA (W-D2 — mock do momento 1 da demo).
 *
 * O cabeçalho da conversa ganha "Pedir ao Jarvis": ele lê o fio e o funil e propõe UMA próxima
 * ação, no formato que já é o contrato das tarefas dele (0298): POR QUE AGORA + FAZER + prazo +
 * responsável. A pessoa ACEITA (vira `tarefa_criada`, origem `jarvis_conversa`) ou AJUSTA (edita
 * o FAZER, o prazo e o responsável inline, e então aceita). Nada sai sem clique — é o
 * human-on-the-loop da Constituição §1.2 desenhado como card, não como fila.
 *
 * A proposta aqui é gerada por REGRA sobre a fixture (`gerarPropostaJarvis`) para a demo ter o
 * card na tela; em produção quem gera é o worker `jarvis/tarefas` do runtime.
 */

export interface PropostaDoJarvis {
  porQue: string;
  fazer: string;
  trecho: string | null;
  prazo: "hoje" | "amanha" | "esta_semana";
  responsavelId: string | null;
  responsavelNome: string;
  estado: "proposta" | "aceita";
}

const PRAZOS: Record<PropostaDoJarvis["prazo"], string> = {
  hoje: "Hoje",
  amanha: "Amanhã",
  esta_semana: "Esta semana",
};

function tempoDesde(iso: string | null | undefined): string {
  if (!iso) return "há pouco";
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

export function gerarPropostaJarvis(c: ConversaResumo, msgs: Mensagem[]): PropostaDoJarvis {
  const nome = (c.nome ?? "o lead").split(" ")[0];
  const enviadas = msgs.filter((m) => !m.programada_para);
  const ultima = enviadas[enviadas.length - 1];
  const ultimaEntrada = [...enviadas].reverse().find((m) => m.direcao === "entrada");
  const trecho = ultimaEntrada?.corpo ?? null;
  const semResposta = ultima?.direcao === "entrada";
  const responsavelNome = c.dono_atual?.startsWith("anapaula") ? "Ana Paula" : "Sara";
  const responsavelId = c.dono_atual?.startsWith("anapaula")
    ? "e0000000-0000-4000-8000-000000000004"
    : "e0000000-0000-4000-8000-000000000001";

  if (semResposta && ultimaEntrada) {
    const pergunta = /\?/.test(ultimaEntrada.corpo ?? "");
    return {
      porQue: `${nome} escreveu ${tempoDesde(ultimaEntrada.criado_em)} e ninguém respondeu${pergunta ? " — e é uma pergunta" : ""}. Está em ${c.etapa_nome ?? "etapa sem nome"}.`,
      fazer: pergunta ? `Responder a dúvida de ${nome} e propor a avaliação` : `Responder ${nome} e confirmar o próximo passo`,
      trecho,
      prazo: "hoje",
      responsavelId,
      responsavelNome,
      estado: "proposta",
    };
  }
  if (c.etapa === "avaliacao") {
    return {
      porQue: `${nome} tem avaliação marcada e a clínica pede confirmação 24 h antes. A última mensagem foi ${tempoDesde(ultima?.criado_em)}.`,
      fazer: `Confirmar presença de ${nome} na avaliação e reenviar o endereço`,
      trecho,
      prazo: "amanha",
      responsavelId,
      responsavelNome,
      estado: "proposta",
    };
  }
  if (c.etapa === "proposta" || c.etapa === "negociacao") {
    return {
      porQue: `${nome} está em ${c.etapa_nome} há ${Math.max(1, Math.round((Date.now() - new Date(c.entrou_etapa_em ?? Date.now()).getTime()) / 86_400_000))} dias e a última mensagem foi ${tempoDesde(ultima?.criado_em)}.`,
      fazer: `Ligar para ${nome} e fechar a condição de pagamento`,
      trecho,
      prazo: "hoje",
      responsavelId,
      responsavelNome,
      estado: "proposta",
    };
  }
  return {
    porQue: `${nome} parou em ${c.etapa_nome ?? "etapa"} — sem mensagem nova ${tempoDesde(ultima?.criado_em)}.`,
    fazer: `Retomar contato com ${nome} e oferecer dois horários de audiometria`,
    trecho,
    prazo: "esta_semana",
    responsavelId,
    responsavelNome,
    estado: "proposta",
  };
}

export function PropostaJarvis({
  proposta,
  mencionaveis,
  onAceitar,
  onDescartar,
  onAlterar,
}: {
  proposta: PropostaDoJarvis;
  mencionaveis: Mencionavel[];
  onAceitar: (p: PropostaDoJarvis) => void;
  onDescartar: () => void;
  onAlterar: (p: PropostaDoJarvis) => void;
}) {
  const [ajustando, setAjustando] = useState(false);
  const aceita = proposta.estado === "aceita";
  const humanos = mencionaveis.filter((m) => m.tipo === "humano" && m.ativo);

  return (
    <div
      className={cn(
        "self-stretch rounded-[11px] border border-linha border-l-[3px] bg-branco px-4 py-3.5 shadow-[0_1px_6px_rgba(37,47,99,.05)] animate-rise",
        aceita ? "border-l-verde" : "border-l-navy",
      )}
      role="region"
      aria-label="Proposta do Jarvis"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[0.76rem] font-semibold text-navy">Jarvis propõe</span>
        <span className="text-[0.72rem] text-mute">· próxima ação nesta conversa · {aceita ? "virou tarefa" : "nada foi criado ainda"}</span>
        {aceita && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-verde-bg px-2 py-px text-[0.7rem] font-semibold text-verde">
            <CheckIcon className="size-3" /> tarefa criada
          </span>
        )}
      </div>

      <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-[0.84rem]">
        <dt className="pt-px text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-mute">Por que agora</dt>
        <dd className="leading-relaxed text-tinta">{proposta.porQue}</dd>

        <dt className="pt-px text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-mute">Fazer</dt>
        <dd className="leading-relaxed text-tinta">
          {ajustando ? (
            <input
              autoFocus
              value={proposta.fazer}
              onChange={(e) => onAlterar({ ...proposta, fazer: e.target.value })}
              aria-label="Ajustar o que fazer"
              className="w-full rounded-md border border-linha-forte bg-board px-2.5 py-1.5 text-[0.86rem] text-tinta outline-none focus:border-laranja focus:bg-branco"
            />
          ) : (
            <span className="font-medium">{proposta.fazer}</span>
          )}
        </dd>

        {proposta.trecho && (
          <>
            <dt className="pt-px text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-mute">Trecho</dt>
            <dd className="border-l-2 border-linha-forte pl-2.5 text-[0.8rem] italic leading-relaxed text-suave">“{proposta.trecho}”</dd>
          </>
        )}

        <dt className="pt-px text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-mute">Prazo</dt>
        <dd>
          {ajustando ? (
            <div className="inline-flex rounded-md border border-linha p-0.5 text-[0.76rem]">
              {(Object.keys(PRAZOS) as PropostaDoJarvis["prazo"][]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onAlterar({ ...proposta, prazo: p })}
                  className={cn("rounded-[5px] px-2 py-0.5", proposta.prazo === p ? "bg-navy text-branco" : "text-suave hover:text-tinta")}
                >
                  {PRAZOS[p]}
                </button>
              ))}
            </div>
          ) : (
            <span className={cn(proposta.prazo === "hoje" ? "font-medium text-vermelho" : "text-tinta")}>{PRAZOS[proposta.prazo]}</span>
          )}
        </dd>

        <dt className="pt-px text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-mute">Responsável</dt>
        <dd>
          {ajustando ? (
            <select
              value={proposta.responsavelId ?? ""}
              onChange={(e) => {
                const h = humanos.find((x) => x.id === e.target.value);
                onAlterar({ ...proposta, responsavelId: e.target.value, responsavelNome: h?.nome.split(" ")[0] ?? proposta.responsavelNome });
              }}
              aria-label="Responsável pela tarefa"
              className="rounded-md border border-linha-forte bg-board px-2 py-1 text-[0.82rem] text-tinta outline-none"
            >
              {humanos.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nome}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-tinta">{proposta.responsavelNome}</span>
          )}
        </dd>
      </dl>

      {!aceita && (
        <div className="mt-3.5 flex items-center gap-2 border-t border-linha pt-3">
          <button
            type="button"
            onClick={() => onAceitar(proposta)}
            className="rounded-md bg-laranja px-3.5 py-1.5 text-[13px] font-semibold text-branco transition-colors hover:bg-laranja-esc"
          >
            {ajustando ? "Aceitar com ajustes" : "Aceitar"}
          </button>
          <button
            type="button"
            onClick={() => setAjustando((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-linha-forte px-3 py-1.5 text-[13px] font-medium text-navy transition-colors hover:bg-hover"
          >
            <PencilLineIcon className="size-3.5" />
            {ajustando ? "Pronto" : "Ajustar"}
          </button>
          <button type="button" onClick={onDescartar} className="ml-auto rounded-md px-3 py-1.5 text-[13px] text-suave transition-colors hover:bg-hover hover:text-tinta">
            Descartar
          </button>
        </div>
      )}
    </div>
  );
}
