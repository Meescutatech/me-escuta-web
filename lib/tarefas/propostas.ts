import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import type { Prioridade } from "./dia";

/**
 * PROPOSTA DE TAREFA DO JARVIS EM ESTADO "PROPOSTA" (W-D5, 10/09 — benchmark §4 item 9).
 *
 * D62 pôs `criar_tarefa = auto`: a tarefa do Jarvis nasce criada e a tela mostra "Jarvis criou"
 * como registro. Para os tipos que ficam em `propor` (lib/tarefas/autonomia.ts, `TETOS_TAREFA`)
 * a sugestão fica em `core.sugestao_ia` esperando alguém — e NÃO EXISTIA tela para esse alguém.
 * O tipo abaixo é o vocabulário do card de aceite: os mesmos campos do `PropostaTarefa`
 * (lib/tarefas/proposta.ts) mais o que a tela precisa para desenhar (lead, prazo em ISO, ids).
 *
 * As três saídas, por evento (benchmark item 9):
 *   aceitar   → `validar_sugestao(aprovada)`            → `tarefa_criada` como o Jarvis propôs
 *   ajustar   → `validar_sugestao(aprovada, payload)`   → `tarefa_criada` com os campos editados
 *               e `ajustada_de: sugestao_id` no payload
 *   descartar → `validar_sugestao(rejeitada)`           → `sugestao_rejeitada`
 *
 * ⚠️ O que ainda não existe fora da tela (registrado no STATUS): a leitura de `core.sugestao_ia`
 * (tipo tarefa, pendente) para a /tarefas — hoje a página real recebe `propostas: []`.
 */
export interface PropostaTarefaPendente {
  /** `core.sugestao_ia.id` */
  id: string;
  lead_id: string | null;
  lead_nome: string | null;
  /** FAZER — vira o título da tarefa */
  fazer: string;
  por_que: string;
  trecho: string | null;
  tipo: string | null;
  prioridade: Prioridade | null;
  prazo_sugerido: string | null;
  responsavel_sugerido_id: string | null;
  /** quando o Jarvis propôs */
  criado_em: string;
  /** ancoragem no fio — a tarefa criada herda */
  conversa_id?: string | null;
}

/** O que a pessoa pode mudar antes de aceitar. Campo ausente = fica como o Jarvis propôs. */
export interface AjustePropostaTarefa {
  fazer?: string;
  prazo?: string | null;
  responsavel_id?: string | null;
}

/**
 * O `payload` do `tarefa_criada` que sai da aprovação — com ou sem ajuste. `ajustada_de` só entra
 * quando algo mudou: é o rastro de que a pessoa discordou do robô, e discordar tem de ficar no
 * ledger (Constituição §1.2).
 */
export function payloadDaProposta(p: PropostaTarefaPendente, ajuste: AjustePropostaTarefa = {}): Record<string, unknown> {
  const titulo = (ajuste.fazer ?? p.fazer).trim();
  const prazo = ajuste.prazo === undefined ? p.prazo_sugerido : ajuste.prazo;
  const responsavelId = ajuste.responsavel_id === undefined ? p.responsavel_sugerido_id : ajuste.responsavel_id;
  const payload: Record<string, unknown> = {
    titulo,
    origem: "jarvis_conversa",
    por_que: p.por_que,
    fazer: titulo,
  };
  if (p.trecho) payload.trecho = p.trecho;
  if (p.tipo) payload.tipo = p.tipo;
  if (prazo) payload.prazo = prazo;
  if (responsavelId) payload.responsavel_id = responsavelId;
  if (p.conversa_id) payload.conversa_id = p.conversa_id;
  if (p.prioridade) payload.prioridade = p.prioridade;
  if (houveAjuste(p, ajuste)) payload.ajustada_de = p.id;
  return payload;
}

export function houveAjuste(p: PropostaTarefaPendente, a: AjustePropostaTarefa): boolean {
  if (a.fazer !== undefined && a.fazer.trim() !== p.fazer.trim()) return true;
  if (a.prazo !== undefined && (a.prazo ?? null) !== (p.prazo_sugerido ?? null)) return true;
  if (a.responsavel_id !== undefined && (a.responsavel_id ?? null) !== (p.responsavel_sugerido_id ?? null)) return true;
  return false;
}

/**
 * A TarefaVisao que a aprovação produziria — é o que o ensaio insere na fila na hora, e é o
 * mesmo desenho que a projeção `proj_tarefa_jarvis` (0298) devolveria depois.
 */
export function tarefaDaProposta(
  p: PropostaTarefaPendente,
  ajuste: AjustePropostaTarefa,
  agoraMs: number,
  id: string,
): TarefaVisao {
  const pay = payloadDaProposta(p, ajuste);
  const prazo = (pay.prazo as string | undefined) ?? null;
  return {
    id,
    lead_id: p.lead_id,
    lead_nome: p.lead_nome,
    titulo: pay.titulo as string,
    descricao: null,
    tipo: p.tipo,
    responsavel: null,
    responsavel_id: (pay.responsavel_id as string | undefined) ?? null,
    prazo,
    status: "pendente",
    resultado: null,
    motivo_arquivo: null,
    criado_em: new Date(agoraMs).toISOString(),
    concluida_em: null,
    vencida: prazo != null && new Date(prazo).getTime() < agoraMs,
    por_que: p.por_que,
    fazer: pay.titulo as string,
    trecho: p.trecho,
    origem: "jarvis_conversa",
    prioridade: p.prioridade,
  };
}
