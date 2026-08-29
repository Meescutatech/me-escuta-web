/**
 * QUADRO POR STATUS (`/tarefas?ver=quadro`, F8 · 27/08) — lógica PURA, sem I/O, testável com
 * node --test. O componente (components/tarefas/quadro-status.tsx) só desenha o que sai daqui.
 *
 * Três colunas, e cada uma é um ESTADO derivado do ledger (0305):
 *   a_fazer      = status pendente e iniciada_em null
 *   em_andamento = status pendente e iniciada_em not null   (sub-estado de aberta — nunca um 4º status)
 *   concluida    = status concluida
 * Arquivada não tem coluna: saiu da fila com rastro, e a lista (`?status=arquivadas`) é o lugar dela.
 *
 * ARRASTAR É EMITIR EVENTO. A transição entre colunas vira uma sequência de tipos que a porta já
 * conhece — `tarefa_iniciada`, `tarefa_reaberta`, `tarefa_concluida` — e nada aqui grava estado:
 * o estado é o que a projeção devolver depois. Concluir exige RESULTADO (0037, check_violation),
 * então a transição para `concluida` não é imediata: o card cai na coluna com o campo aberto, e só
 * vira evento quando a pessoa escreve o que aconteceu (regras/conclusao.ts).
 *
 * Benchmark (Linear / Pipedrive / HubSpot / Todoist, 27/08) — o que entrou daqui:
 *   · quadro por status com arrastar (Linear "board layout") — esta tela;
 *   · mudar status pelo TECLADO sem arrastar (Linear: `S`; Pipedrive: `J`/`K` para andar) — `acaoPorTecla`;
 *   · concluir INLINE sem sair da lista (Todoist) — já existia (concluir-tarefa.tsx), reaproveitado;
 *   · agrupar por lead dentro da coluna (Pipedrive "contextual view" agrupa por negócio) — `agruparPorLead`;
 *   · Hoje / Atrasadas / Próximas (HubSpot "Due today / Overdue / Upcoming", Todoist "Today/Upcoming")
 *     — NÃO duplicado aqui: é o Funil por prazo que já existe, mantido como visão alternativa.
 */

export type ColunaStatus = "a_fazer" | "em_andamento" | "concluida";

export const COLUNAS: readonly { chave: ColunaStatus; rotulo: string; vazio: string }[] = [
  { chave: "a_fazer", rotulo: "A fazer", vazio: "Nada para fazer" },
  { chave: "em_andamento", rotulo: "Em andamento", vazio: "Ninguém pegou nada ainda" },
  { chave: "concluida", rotulo: "Concluída", vazio: "Nada concluído ainda" },
];

/** O mínimo que o quadro precisa saber de uma tarefa. `TarefaVisao` satisfaz. */
export interface TarefaQuadro {
  id: string;
  lead_id: string | null;
  lead_nome: string | null;
  status: string;
  prazo: string | null;
  vencida: boolean;
  criado_em: string;
  concluida_em: string | null;
}

/**
 * A coluna DERIVADA. `emAndamento` é o conjunto de ids com `iniciada_em` (lido de core.v_tarefa);
 * chega separado porque `TarefaVisao` ainda não carrega a coluna e a leitura degrada honesta
 * (conjunto vazio = tudo em A fazer, nunca tela morta).
 * `null` = fora do quadro (arquivada, ou status desconhecido).
 */
export function colunaDe(t: TarefaQuadro, emAndamento: ReadonlySet<string>): ColunaStatus | null {
  if (t.status === "concluida") return "concluida";
  if (t.status !== "pendente") return null;
  return emAndamento.has(t.id) ? "em_andamento" : "a_fazer";
}

export type TipoEventoQuadro = "tarefa_iniciada" | "tarefa_reaberta" | "tarefa_concluida";

export interface Transicao {
  /** na ordem em que a porta os recebe */
  eventos: TipoEventoQuadro[];
  /** `tarefa_concluida` exige resultado — o card espera o texto antes de virar evento */
  pedeResultado: boolean;
}

/** A sequência de eventos que leva uma tarefa de `de` para `para`. `null` = não há movimento. */
export function transicao(de: ColunaStatus, para: ColunaStatus): Transicao | null {
  if (de === para) return null;
  if (para === "concluida") return { eventos: ["tarefa_concluida"], pedeResultado: true };
  if (de === "a_fazer" && para === "em_andamento") return { eventos: ["tarefa_iniciada"], pedeResultado: false };
  if (de === "em_andamento" && para === "a_fazer") return { eventos: ["tarefa_reaberta"], pedeResultado: false };
  if (de === "concluida" && para === "a_fazer") return { eventos: ["tarefa_reaberta"], pedeResultado: false };
  // concluída → em andamento: reabre (volta a A fazer) e inicia, nesta ordem
  return { eventos: ["tarefa_reaberta", "tarefa_iniciada"], pedeResultado: false };
}

const SEM_PRAZO = Number.MAX_SAFE_INTEGER;
function prazoMs(t: TarefaQuadro): number {
  const ms = t.prazo ? new Date(t.prazo).getTime() : NaN;
  return Number.isFinite(ms) ? ms : SEM_PRAZO;
}

/**
 * Distribui nas três colunas, aplicando os OVERRIDES otimistas (id → coluna para onde a pessoa
 * arrastou e a porta ainda não confirmou). Ordem dentro da coluna:
 *   abertas: vencida primeiro, depois prazo mais próximo, sem prazo por último;
 *   concluídas: mais recente primeiro.
 */
export function distribuir<T extends TarefaQuadro>(
  tarefas: readonly T[],
  emAndamento: ReadonlySet<string>,
  overrides: ReadonlyMap<string, ColunaStatus>,
): Record<ColunaStatus, T[]> {
  const r: Record<ColunaStatus, T[]> = { a_fazer: [], em_andamento: [], concluida: [] };
  for (const t of tarefas) {
    const col = overrides.get(t.id) ?? colunaDe(t, emAndamento);
    if (col) r[col].push(t);
  }
  const abertas = (a: T, b: T) =>
    Number(b.vencida) - Number(a.vencida) || prazoMs(a) - prazoMs(b) || a.criado_em.localeCompare(b.criado_em);
  r.a_fazer.sort(abertas);
  r.em_andamento.sort(abertas);
  r.concluida.sort((a, b) => (b.concluida_em ?? b.criado_em).localeCompare(a.concluida_em ?? a.criado_em));
  return r;
}

/**
 * Overrides que o servidor JÁ reflete saem do mapa — é assim que o otimista para de mandar sem
 * precisar de relógio: quando a releitura (tempo real → router.refresh) traz a tarefa na coluna
 * pedida, a verdade assume. Override cuja tarefa sumiu da leitura também sai.
 */
export function reconciliar(
  overrides: ReadonlyMap<string, ColunaStatus>,
  tarefas: readonly TarefaQuadro[],
  emAndamento: ReadonlySet<string>,
): Map<string, ColunaStatus> {
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const vivo = new Map<string, ColunaStatus>();
  for (const [id, col] of overrides) {
    const t = porId.get(id);
    if (!t) continue;
    if (colunaDe(t, emAndamento) !== col) vivo.set(id, col);
  }
  return vivo;
}

export interface GrupoLead<T> {
  chave: string;
  rotulo: string;
  tarefas: T[];
}

/** Agrupa por lead dentro de uma coluna, preservando a ordem; sem lead vai para o fim. */
export function agruparPorLead<T extends TarefaQuadro>(lista: readonly T[]): GrupoLead<T>[] {
  const grupos = new Map<string, GrupoLead<T>>();
  for (const t of lista) {
    const chave = t.lead_id ?? "";
    let g = grupos.get(chave);
    if (!g) {
      g = { chave, rotulo: t.lead_id ? t.lead_nome ?? "Lead sem nome" : "Sem lead", tarefas: [] };
      grupos.set(chave, g);
    }
    g.tarefas.push(t);
  }
  const lista2 = [...grupos.values()];
  const semLead = lista2.filter((g) => g.chave === "");
  return [...lista2.filter((g) => g.chave !== ""), ...semLead];
}

// ─────────────── teclado ───────────────

export const ATALHOS: readonly { teclas: string; faz: string }[] = [
  { teclas: "↑ ↓  ou  J K", faz: "andar pelos cards" },
  { teclas: "← →  ou  H L", faz: "trocar de coluna" },
  { teclas: "E", faz: "pegar (Em andamento)" },
  { teclas: "C", faz: "concluir (pede o resultado)" },
  { teclas: "V", faz: "voltar para A fazer" },
  { teclas: "Enter", faz: "abrir o lead" },
  { teclas: "?", faz: "mostrar ou esconder esta lista" },
];

/** Para que coluna a tecla manda o card focado. `null` = tecla sem ação, ou já está lá. */
export function acaoPorTecla(tecla: string, atual: ColunaStatus): ColunaStatus | null {
  const k = tecla.toLowerCase();
  const alvo: ColunaStatus | null = k === "e" ? "em_andamento" : k === "c" ? "concluida" : k === "v" ? "a_fazer" : null;
  if (!alvo || alvo === atual) return null;
  return alvo;
}

/** Índice seguinte numa lista circular; lista vazia devolve -1. */
export function proximoIndice(atual: number, delta: number, total: number): number {
  if (total <= 0) return -1;
  if (atual < 0) return delta > 0 ? 0 : total - 1;
  return (((atual + delta) % total) + total) % total;
}

export function proximaColuna(atual: ColunaStatus, delta: number): ColunaStatus {
  const i = COLUNAS.findIndex((c) => c.chave === atual);
  return COLUNAS[proximoIndice(i, delta, COLUNAS.length)].chave;
}
