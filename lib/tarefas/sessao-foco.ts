import type { EventoTarefa, TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import { escritasVazias, type EscritasEnsaio } from "@/lib/tarefas/ensaio-local";

/**
 * A SESSÃO DE FOCO E O ESTADO DO ENSAIO DE /tarefas — a parte PURA (W-T, 10/09 noite).
 *
 * Tipos e conversões que o cliente e o servidor compartilham: o que o cookie guarda
 * (`EstadoTarefasEnsaio`), como ele vira as `EscritasEnsaio` que a lista já usa, e como uma
 * tarefa criada no "e agora?" volta a ser `TarefaVisao`. Quem LÊ e GRAVA o cookie de verdade é
 * `lib/ensaio/tarefas-sessao.ts` (next/headers, só no servidor) — este arquivo não importa nada
 * de servidor, de propósito, para o componente cliente poder montar o estado a gravar.
 *
 * Por que cookie e não `useState`: o modo foco é uma ROTA (`/tarefas/foco`); concluir lá e
 * voltar para a lista precisa mostrar a tarefa riscada, e "3 de 12" precisa sobreviver a um F5.
 * Mesmo padrão do W-D3 (`conversas-extra.ts`). Sem PII de verdade — é fixture.
 */

export const COOKIE_ESTADO_TAREFAS = "me_escuta_ensaio_tarefas";
export interface TarefaCriadaCookie {
  id: string;
  lead_id: string | null;
  lead_nome: string | null;
  titulo: string;
  tipo: string | null;
  responsavel_id: string | null;
  prazo: string | null;
  prioridade: "alta" | "media" | "baixa" | null;
  criado_em: string;
  /** criada a partir de qual tarefa concluída ("e agora?") — vira o histórico */
  depois_de: string | null;
}

export interface SessaoFocoCookie {
  iniciada_em: string;
  /** ids na ordem em que a fila estava quando começou */
  ordem: string[];
  /** ids pulados (ficam para o fim; nunca viram evento) */
  puladas: string[];
  /** ids em que a pessoa entrou (o `tarefa_iniciada` que o foco emitiria) */
  iniciadas: string[];
}

export interface EstadoTarefasEnsaio {
  concluidas: Record<string, { resultado: string; em: string }>;
  prazos: Record<string, { prazo: string; motivo: string; em: string }>;
  criadas: TarefaCriadaCookie[];
  sessao: SessaoFocoCookie | null;
}

export const ESTADO_TAREFAS_VAZIO: EstadoTarefasEnsaio = { concluidas: {}, prazos: {}, criadas: [], sessao: null };

export function normalizar(j: unknown): EstadoTarefasEnsaio {
  const o = (j && typeof j === "object" ? j : {}) as Partial<EstadoTarefasEnsaio>;
  const sessao = o.sessao && typeof o.sessao === "object" && Array.isArray(o.sessao.ordem)
    ? {
        iniciada_em: String(o.sessao.iniciada_em ?? new Date().toISOString()),
        ordem: o.sessao.ordem.map(String),
        puladas: Array.isArray(o.sessao.puladas) ? o.sessao.puladas.map(String) : [],
        iniciadas: Array.isArray(o.sessao.iniciadas) ? o.sessao.iniciadas.map(String) : [],
      }
    : null;
  return {
    concluidas: o.concluidas && typeof o.concluidas === "object" ? o.concluidas : {},
    prazos: o.prazos && typeof o.prazos === "object" ? o.prazos : {},
    criadas: Array.isArray(o.criadas) ? o.criadas : [],
    sessao,
  };
}

/** o cookie vira as `EscritasEnsaio` iniciais da lista — a mesma forma que o `useState` já usa */
export function escritasDoCookie(estado: EstadoTarefasEnsaio, nomes: Map<string, string>): EscritasEnsaio {
  const e = escritasVazias();
  for (const [id, c] of Object.entries(estado.concluidas)) e.concluidas.set(id, c.resultado);
  for (const [id, p] of Object.entries(estado.prazos)) {
    e.prazos.set(id, p.prazo);
    const ev: EventoTarefa = { quando: p.em, tipo: "adiada", texto: p.motivo };
    e.eventos.set(id, [...(e.eventos.get(id) ?? []), ev]);
  }
  for (const c of estado.criadas) e.criadas.push(tarefaDoCookie(c, nomes));
  if (estado.sessao) for (const id of estado.sessao.iniciadas) e.iniciadas.add(id);
  return e;
}

export function tarefaDoCookie(c: TarefaCriadaCookie, nomes: Map<string, string>): TarefaVisao {
  const quem = c.responsavel_id ? (nomes.get(c.responsavel_id)?.split("@")[0] ?? "alguém") : "alguém";
  return {
    id: c.id,
    lead_id: c.lead_id,
    lead_nome: c.lead_nome,
    titulo: c.titulo,
    descricao: null,
    tipo: c.tipo,
    responsavel: null,
    responsavel_id: c.responsavel_id,
    prazo: c.prazo,
    status: "pendente",
    resultado: null,
    motivo_arquivo: null,
    criado_em: c.criado_em,
    concluida_em: null,
    vencida: false,
    por_que: null,
    fazer: null,
    trecho: null,
    origem: null,
    prioridade: c.prioridade,
    historico: [{ quando: c.criado_em, tipo: "criada", texto: c.depois_de ? `criada por ${quem} ao concluir a anterior ("e agora?")` : `criada por ${quem}` }],
  };
}
