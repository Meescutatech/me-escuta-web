import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import { diffDiasSP } from "@/lib/dados/tarefas-visao-calculos";
import { visaoTarefasDeEnsaio } from "@/lib/dados/tarefas-ensaio";
import { pessoaPorId } from "@/lib/ensaio/modo";
import { pesoPrioridade } from "./dia";

/**
 * "PRÓXIMA TAREFA" DE UM LEAD (W-D5, 10/09 — benchmark §4 itens 1 e 2).
 *
 * É o `next_activity_date` do Pipedrive e o card "Próxima atividade" do LiderHub
 * (`highlight-activity-card.tsx`: a pendência de menor `dueAt`, com badge destructive / warning /
 * muted). O funil hoje calcula `tem_tarefa_pendente` (lib/dados/funil.ts:69) e joga fora o QUAL —
 * este módulo devolve o qual.
 *
 * DUAS CAMADAS, e a separação é o ponto:
 *   · `derivarProximaTarefa(pendentesDoLead, agora)` — PURA. Recebe as tarefas e devolve a
 *     próxima. É o que a `v_lead_card` fará no banco ([M] do benchmark: `min(prazo) where
 *     status='pendente'` + título + responsável); até lá é o que o front faz com o que leu.
 *   · `proximaTarefaDoLead(leadId, agora)` — sobre a FIXTURE de ensaio. É o que o card do funil
 *     (W-D6) importa hoje, e o que sai de cena quando a coluna chegar na view.
 *
 * Os quatro estados são os do benchmark item 2, e a diferença entre os dois últimos é o motivo
 * de a linha existir: cinza "sem tarefa" ≠ vermelho "vencida" — são falhas diferentes
 * (funil-filtros.ts:38-40). Tarefa vencida ao menos existe e aparece para alguém; lead sem
 * tarefa nenhuma some em silêncio.
 */

export type EstadoProxima = "vencida" | "hoje" | "futura" | "sem_tarefa";

export interface ProximaTarefa {
  /** null só em `sem_tarefa` */
  titulo: string | null;
  /** ISO; null em `sem_tarefa` ou tarefa sem prazo (que conta como `futura`) */
  prazo: string | null;
  /** primeiro nome de quem responde; null quando não há ou não se sabe */
  responsavel: string | null;
  estado: EstadoProxima;
  /** id da tarefa, para linkar `/tarefas#tarefa-<id>`; null em `sem_tarefa` */
  tarefa_id: string | null;
}

const SEM_TAREFA: ProximaTarefa = { titulo: null, prazo: null, responsavel: null, estado: "sem_tarefa", tarefa_id: null };

function prazoMs(t: Pick<TarefaVisao, "prazo">): number {
  const ms = t.prazo ? new Date(t.prazo).getTime() : NaN;
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

export function estadoDoPrazo(prazoIso: string | null, agoraMs: number): Exclude<EstadoProxima, "sem_tarefa"> {
  if (!prazoIso) return "futura";
  const ms = new Date(prazoIso).getTime();
  if (!Number.isFinite(ms)) return "futura";
  if (ms < agoraMs) return "vencida";
  const d = diffDiasSP(prazoIso, agoraMs);
  return d != null && d <= 0 ? "hoje" : "futura";
}

/**
 * A pendente de MENOR prazo (sem prazo por último; prioridade desempata). Recebe qualquer
 * conjunto — filtra `status === "pendente"` sozinha, para o chamador não ter de lembrar.
 */
export function derivarProximaTarefa(
  tarefasDoLead: readonly TarefaVisao[],
  agoraMs: number,
  nomeDe: (responsavelId: string | null) => string | null = () => null,
): ProximaTarefa {
  const pendentes = tarefasDoLead.filter((t) => t.status === "pendente");
  if (pendentes.length === 0) return SEM_TAREFA;
  const [p] = [...pendentes].sort(
    (a, b) => prazoMs(a) - prazoMs(b) || pesoPrioridade(a.prioridade) - pesoPrioridade(b.prioridade),
  );
  return {
    titulo: p.titulo,
    prazo: p.prazo,
    responsavel: nomeDe(p.responsavel_id),
    estado: estadoDoPrazo(p.prazo, agoraMs),
    tarefa_id: p.id,
  };
}

/** Índice lead → próxima, para quem tem a lista inteira na mão (o board, a lista de conversas). */
export function proximaPorLead(
  tarefas: readonly TarefaVisao[],
  agoraMs: number,
  nomeDe?: (responsavelId: string | null) => string | null,
): Map<string, ProximaTarefa> {
  const porLead = new Map<string, TarefaVisao[]>();
  for (const t of tarefas) {
    if (!t.lead_id || t.status !== "pendente") continue;
    if (!porLead.has(t.lead_id)) porLead.set(t.lead_id, []);
    porLead.get(t.lead_id)!.push(t);
  }
  const saida = new Map<string, ProximaTarefa>();
  for (const [leadId, ts] of porLead) saida.set(leadId, derivarProximaTarefa(ts, agoraMs, nomeDe));
  return saida;
}

function primeiroNomeDeEnsaio(responsavelId: string | null): string | null {
  const p = pessoaPorId(responsavelId);
  return p ? p.nome.split(" ")[0] : null;
}

/**
 * PARA O CARD DO FUNIL (W-D6) — a próxima tarefa do lead, CALCULADA DA FIXTURE DE ENSAIO.
 *
 *   proximaTarefaDoLead("1ead0000-0000-4000-8000-000000000024")
 *   → { titulo: "Mandar o endereço da clínica para a Cleusa", prazo: "…", responsavel: "Sara",
 *       estado: "vencida", tarefa_id: "en5a10-…-000000000012" }
 *   proximaTarefaDoLead("1ead0000-0000-4000-8000-000000000010")
 *   → { titulo: null, prazo: null, responsavel: null, estado: "sem_tarefa", tarefa_id: null }
 *   proximaTarefaDoLead("")  → null   (sem lead não há o que derivar — o card não desenha a linha)
 *
 * É pura no sentido que importa: sem `next/headers`, sem banco — pode ser chamada de componente
 * cliente. Lê a fixture com `leadsDoFunil: true`, então os ids são os de `MOLDES_LEADS`
 * (lib/ensaio/fixtures/conversas.ts). `agora` opcional para o teste ser determinístico.
 *
 * ⚠️ Só vale no ensaio. Em produção a fonte é a `v_lead_card` ([M] do benchmark) — quando a
 * coluna existir, o card passa a ler `card.proxima_tarefa` e esta função sai do caminho.
 */
export function proximaTarefaDoLead(leadId: string, agora: Date = new Date()): ProximaTarefa | null {
  if (!leadId) return null;
  const { tarefas } = visaoTarefasDeEnsaio(agora, { leadsDoFunil: true });
  return derivarProximaTarefa(
    tarefas.filter((t) => t.lead_id === leadId),
    agora.getTime(),
    primeiroNomeDeEnsaio,
  );
}
