import type { ConversaResumo, Mensagem } from "@/lib/dados/conversas";
import type { PropostaJarvis } from "@/components/jarvis/tipos";

export type { AjusteProposta, EstadoProposta, MotivoDescarte, PrazoCurto, PropostaJarvis } from "@/components/jarvis/tipos";
export { ROTULO_PRAZO as PRAZOS_PROPOSTA } from "@/components/jarvis/tipos";

/**
 * PROPOSTA DO JARVIS DENTRO DO FIO (W-D3, 10/09 — regra do Diogo às 22:10).
 *
 * O Jarvis não é um botão: as propostas dele nascem NO PONTO da conversa em que ele leu o que o
 * motivou, e ficam ali como nota interna dele — nunca como mensagem para o paciente. O formato
 * é o contrato das tarefas dele (0298): POR QUE AGORA + FAZER + trecho + prazo + responsável.
 *
 * O VOCABULÁRIO é o de `components/jarvis/tipos.ts` (W-J): um tipo só para a proposta em
 * qualquer superfície, com os 5 estados (`proposta → aceita / ajustada / descartada → feita`) e os
 * nomes do contrato do worker (`fazer`, `por_que`, `trecho`). Este módulo só re-exporta o tipo e
 * guarda a regra que GERA uma proposta a partir do fio, para o gatilho manual do ensaio. Quem
 * gera de verdade é o worker `jarvis/tarefas`.
 */

export function tempoDesde(iso: string | null | undefined, agoraMs = Date.now()): string {
  if (!iso) return "há pouco";
  const min = Math.max(1, Math.round((agoraMs - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

const SARA_ID = "e0000000-0000-4000-8000-000000000001";
const FONO_ID = "e0000000-0000-4000-8000-000000000004";

/**
 * Gatilho manual do ensaio ("Pedir sugestão ao Jarvis"): uma proposta por REGRA sobre o fio e o
 * funil. Não é o produto — é para a demo ter a nota em qualquer conversa.
 */
export function gerarPropostaJarvis(c: ConversaResumo, msgs: Mensagem[], agora = new Date()): PropostaJarvis {
  const nome = (c.nome ?? "o lead").split(" ")[0];
  const enviadas = msgs.filter((m) => !m.programada_para);
  const ultima = enviadas[enviadas.length - 1];
  const ultimaEntrada = [...enviadas].reverse().find((m) => m.direcao === "entrada");
  // o TRECHO é a evidência: a última frase do paciente que diz alguma coisa — "?" sozinho não é trecho
  const comTrecho = [...enviadas].reverse().find((m) => m.direcao === "entrada" && (m.corpo ?? "").trim().length >= 8) ?? ultimaEntrada;
  const semResposta = ultima?.direcao === "entrada";
  const daFono = !!c.dono_atual?.startsWith("anapaula");
  const t = agora.getTime();
  const base = {
    id: `prop-${c.id.slice(-6)}-${t.toString(36)}`,
    conversa_id: c.id,
    lead_id: c.lead_id ?? null,
    lead_nome: c.nome ?? null,
    criado_em: agora.toISOString(),
    trecho: comTrecho?.corpo ?? null,
    trecho_mensagem_id: comTrecho?.id ?? null,
    responsavel_id: daFono ? FONO_ID : SARA_ID,
    responsavel_nome: daFono ? "Ana Paula" : "Sara",
    estado: "proposta" as const,
  };

  if (semResposta && ultimaEntrada) {
    const pergunta = /\?/.test(ultimaEntrada.corpo ?? "");
    return {
      ...base,
      tipo: "followup",
      por_que: `${nome} escreveu ${tempoDesde(ultimaEntrada.criado_em, t)} e ninguém respondeu${pergunta ? " — e é uma pergunta" : ""}. Está em ${c.etapa_nome ?? "etapa sem nome"}.`,
      fazer: pergunta ? `Responder a dúvida de ${nome} e propor a avaliação` : `Responder ${nome} e confirmar o próximo passo`,
      prazo: "hoje",
    };
  }
  if (c.etapa === "avaliacao") {
    return {
      ...base,
      tipo: "confirmar_consulta",
      por_que: `${nome} tem avaliação marcada e a clínica pede confirmação 24 h antes. A última mensagem foi ${tempoDesde(ultima?.criado_em, t)}.`,
      fazer: `Confirmar presença de ${nome} na avaliação e reenviar o endereço`,
      prazo: "amanha",
    };
  }
  if (c.etapa === "proposta" || c.etapa === "negociacao") {
    const dias = Math.max(1, Math.round((t - new Date(c.entrou_etapa_em ?? t).getTime()) / 86_400_000));
    return {
      ...base,
      tipo: "ligar",
      por_que: `${nome} está em ${c.etapa_nome} há ${dias} ${dias === 1 ? "dia" : "dias"} e a última mensagem foi ${tempoDesde(ultima?.criado_em, t)}.`,
      fazer: `Ligar para ${nome} e fechar a condição de pagamento`,
      prazo: "hoje",
    };
  }
  return {
    ...base,
    tipo: "followup",
    por_que: `${nome} parou em ${c.etapa_nome ?? "etapa"} — sem mensagem nova ${tempoDesde(ultima?.criado_em, t)}.`,
    fazer: `Retomar contato com ${nome} e oferecer dois horários de audiometria`,
    prazo: "esta_semana",
  };
}
