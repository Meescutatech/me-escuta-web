import type { PropostaJarvis } from "@/components/jarvis/tipos";
import type { TarefaLead } from "@/lib/dados/lead-painel";
import { PESSOAS } from "./modo";

/**
 * PROPOSTAS DO JARVIS na fixture de CONVERSAS (W-D3, 10/09 — pedido do Diogo às 22:10): duas, em
 * conversas diferentes, uma já aceita. Nascem no PONTO do fio em que o Jarvis leu o que o
 * motivou (o `criado_em` é relativo a `agora`, como o resto da fixture), e é ali que a nota
 * aparece. O `trecho_mensagem_id` aponta para a mensagem REAL da fixture de W-D2 — "ver no fio"
 * rola até ela.
 *
 *  · Antônia (conversa …0003, Clara conduzindo): duas perguntas sem resposta há 14 min. PROPOSTA.
 *  · José Carlos (conversa …0002): "minha filha que resolve" há 4 h, sem tarefa. ACEITA pela Sara
 *    dez minutos depois — a nota fica como histórico e a tarefa existe na aba e em /tarefas.
 *
 * Vocabulário: `components/jarvis/tipos.ts` (W-J). A fixture das OUTRAS superfícies do Jarvis
 * (galeria, /tarefas, dashboard) é `lib/ensaio/jarvis.ts`, dele; esta só existe porque os ids de
 * conversa e mensagem precisam bater com a fixture de conversas.
 */

const MIN = 60_000;
const H = 60 * MIN;
const SARA = PESSOAS.find((p) => p.chave === "sara")!;

export const CONVERSA_ANTONIA = "c0nv0000-0000-4000-8000-000000000003";
export const CONVERSA_JOSE_CARLOS = "c0nv0000-0000-4000-8000-000000000002";
export const TAREFA_JOSE_CARLOS = "7a5e0000-0000-4000-8000-000000000901";
// ids de mensagem da fixture de W-D2: prefixo da conversa (24 chars) + posição com 12 dígitos
const MSG = (n: number) => `c0nv0000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function propostasJarvisEnsaio(agora: Date = new Date()): PropostaJarvis[] {
  const t = agora.getTime();
  return [
    {
      id: "prop-ensaio-antonia",
      conversa_id: CONVERSA_ANTONIA,
      lead_id: "1ead0000-0000-4000-8000-000000000003",
      lead_nome: "Antônia Ribeiro Prado",
      // 12 min atrás: logo depois da segunda pergunta dela (13 min) — o Jarvis leu e propôs
      criado_em: new Date(t - 12 * MIN).toISOString(),
      fazer: "Responder a dúvida sobre adaptação e propor a avaliação gratuita",
      por_que: "Antônia fez duas perguntas seguidas e a Clara parou de responder — ela está em Novo lead, sem audiometria, e a dúvida é sobre adaptação, que é onde mais lead esfria.",
      trecho: "e se eu não me adaptar com o aparelho?",
      trecho_mensagem_id: MSG(6),
      tipo: "followup",
      prazo: "hoje",
      responsavel_id: SARA.id,
      responsavel_nome: "Sara",
      estado: "proposta",
    },
    {
      id: "prop-ensaio-jose-carlos",
      conversa_id: CONVERSA_JOSE_CARLOS,
      lead_id: "1ead0000-0000-4000-8000-000000000002",
      lead_nome: "José Carlos Menezes",
      // 3 h 55 min atrás: cinco minutos depois do áudio dele ("minha filha que resolve")
      criado_em: new Date(t - (3 * H + 55 * MIN)).toISOString(),
      fazer: "Retomar com José Carlos na segunda e oferecer conversar com a filha por telefone",
      por_que: "José Carlos disse que a filha decide e que só fala com ela no fim de semana. Sem tarefa marcada, o lead some do radar até segunda — e ele está em Avaliação há 3 dias.",
      trecho: "só que a minha filha que resolve isso, vou falar com ela no fim de semana",
      trecho_mensagem_id: MSG(5),
      tipo: "followup",
      prazo: "esta_semana",
      responsavel_id: SARA.id,
      responsavel_nome: "Sara",
      estado: "aceita",
      decidido_por: "Sara",
      decidido_em: new Date(t - (3 * H + 45 * MIN)).toISOString(),
    },
  ];
}

/** A tarefa que nasceu da proposta aceita — para a aba Tarefas do painel e para /tarefas. */
export function tarefaDaPropostaAceitaEnsaio(agora: Date = new Date()): TarefaLead {
  const p = propostasJarvisEnsaio(agora)[1];
  const prazo = new Date(agora);
  prazo.setDate(prazo.getDate() + ((1 - prazo.getDay() + 7) % 7 || 7)); // próxima segunda
  prazo.setHours(10, 0, 0, 0);
  return {
    id: TAREFA_JOSE_CARLOS,
    titulo: p.fazer,
    responsavel: SARA.email,
    responsavel_id: SARA.id,
    descricao: null,
    tipo: "followup",
    prazo: prazo.toISOString(),
    status: "pendente",
    resultado: null,
    criado_em: p.decidido_em!,
    concluida_em: null,
    por_que: p.por_que,
    fazer: p.fazer,
    trecho: p.trecho,
    origem: "jarvis_conversa",
  };
}
