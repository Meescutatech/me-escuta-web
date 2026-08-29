import { criarClienteServidor } from "@/lib/supabase/server";
import { vencida as vencidaLocal } from "@/lib/dados/tarefa-calculos";
import type { TarefaVisao } from "./tarefas-visao-calculos";

/**
 * Leitura da VISÃO DE TAREFAS (`/tarefas`, Rodada 14).
 *
 * Fonte canônica: `core.v_tarefa` (0037) — RLS de membro ativo via security_invoker e
 * `vencida` DERIVADA NO BANCO (Bloco A §8: não recalcular no front, nunca persistir).
 * Fallback honesto para `core.tarefa` + derivação local só onde a view não existir —
 * mesma régua do resto do repo: deploy fora de ordem nunca vira tela morta.
 *
 * Duas leituras separadas para a fila vermelha nunca ser roubada pelo histórico:
 *  - ABERTAS por prazo asc (mais atrasada primeiro), teto próprio;
 *  - CONCLUÍDAS/ARQUIVADAS mais recentes primeiro, teto menor.
 * Corte estoura em aviso na UI (`corte`), nunca em completude fingida.
 */

export const TETO_ABERTAS = 500;
export const TETO_FECHADAS = 200;

const COLS_VIEW_R27 =
  "id,lead_id,titulo,descricao,tipo,responsavel,responsavel_id,prazo,status,resultado,motivo_arquivo,criado_em,concluida_em,vencida,por_que,fazer,trecho,origem";
const COLS_VIEW =
  "id,lead_id,titulo,descricao,tipo,responsavel,responsavel_id,prazo,status,resultado,motivo_arquivo,criado_em,concluida_em,vencida";
const COLS_TABELA_R13 =
  "id,lead_id,titulo,descricao,tipo,responsavel,responsavel_id,prazo,status,resultado,motivo_arquivo,criado_em,concluida_em";

export interface DadosVisaoTarefas {
  tarefas: TarefaVisao[];
  /** alguma das leituras bateu no teto — a UI avisa que mostra as mais urgentes/recentes. */
  corte: boolean;
  /** false = caiu no fallback sem a view (vencida derivada localmente). */
  derivadaNoBanco: boolean;
}

type Supabase = ReturnType<typeof criarClienteServidor>;

function paraTarefa(r: any, agoraMs: number, comVencida: boolean): TarefaVisao {
  return {
    id: String(r.id),
    lead_id: r.lead_id != null ? String(r.lead_id) : null,
    lead_nome: null, // resolvido em lote depois
    titulo: String(r.titulo ?? "(sem título)"),
    descricao: r.descricao ?? null,
    tipo: r.tipo ?? null,
    responsavel: r.responsavel ?? null,
    responsavel_id: r.responsavel_id ?? null,
    prazo: r.prazo ?? null,
    status: String(r.status ?? "pendente"),
    resultado: r.resultado ?? null,
    motivo_arquivo: r.motivo_arquivo ?? null,
    criado_em: String(r.criado_em),
    concluida_em: r.concluida_em ?? null,
    vencida: comVencida
      ? r.vencida === true
      : String(r.status ?? "pendente") === "pendente" && vencidaLocal(r.prazo ?? null, agoraMs),
    por_que: r.por_que ?? null,
    fazer: r.fazer ?? null,
    trecho: r.trecho ?? null,
    origem: r.origem ?? null,
  };
}

async function lerDeUmaFonte(
  supabase: Supabase,
  fonte: "v_tarefa" | "tarefa",
  colunas: string,
): Promise<{ rows: any[]; corte: boolean } | null> {
  const [abertas, fechadas] = await Promise.all([
    supabase
      .schema("core")
      .from(fonte)
      .select(colunas)
      .eq("status", "pendente")
      .order("prazo", { ascending: true, nullsFirst: false })
      .order("criado_em", { ascending: true })
      .limit(TETO_ABERTAS),
    supabase
      .schema("core")
      .from(fonte)
      .select(colunas)
      .neq("status", "pendente")
      .order("criado_em", { ascending: false })
      .limit(TETO_FECHADAS),
  ]);
  if (abertas.error || fechadas.error) return null;
  return {
    rows: [...(abertas.data ?? []), ...(fechadas.data ?? [])],
    corte:
      (abertas.data ?? []).length >= TETO_ABERTAS || (fechadas.data ?? []).length >= TETO_FECHADAS,
  };
}

/** Nomes dos leads em lote via core.v_lead_card (chunks — .in() com centenas de ids estoura URL). */
async function resolverNomesLead(supabase: Supabase, leadIds: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>();
  const LOTE = 150;
  const lotes: string[][] = [];
  for (let i = 0; i < leadIds.length; i += LOTE) lotes.push(leadIds.slice(i, i + LOTE));
  const resultados = await Promise.all(
    lotes.map((ids) =>
      supabase.schema("core").from("v_lead_card").select("lead_id,nome").in("lead_id", ids),
    ),
  );
  for (const r of resultados) {
    if (r.error || !r.data) continue;
    for (const linha of r.data as any[]) {
      if (linha.lead_id && linha.nome) nomes.set(String(linha.lead_id), String(linha.nome));
    }
  }
  return nomes;
}

export async function lerVisaoTarefas(): Promise<DadosVisaoTarefas> {
  try {
    const supabase = criarClienteServidor();
    const agoraMs = Date.now();

    // F2: as colunas da 0298 primeiro; sem elas a view antiga; sem a view, a tabela.
    let bruto = await lerDeUmaFonte(supabase, "v_tarefa", COLS_VIEW_R27);
    let derivadaNoBanco = true;
    if (!bruto) bruto = await lerDeUmaFonte(supabase, "v_tarefa", COLS_VIEW);
    if (!bruto) {
      bruto = await lerDeUmaFonte(supabase, "tarefa", COLS_TABELA_R13);
      derivadaNoBanco = false;
    }
    if (!bruto) return { tarefas: [], corte: false, derivadaNoBanco: false };

    const tarefas = bruto.rows.map((r) => paraTarefa(r, agoraMs, derivadaNoBanco));

    const leadIds = [...new Set(tarefas.map((t) => t.lead_id).filter((x): x is string => x != null))];
    if (leadIds.length > 0) {
      const nomes = await resolverNomesLead(supabase, leadIds);
      for (const t of tarefas) if (t.lead_id) t.lead_nome = nomes.get(t.lead_id) ?? null;
    }

    return { tarefas, corte: bruto.corte, derivadaNoBanco };
  } catch {
    return { tarefas: [], corte: false, derivadaNoBanco: false };
  }
}

/**
 * Contador da sidebar: quantas tarefas VENCIDAS existem agora (head-count no banco — usa o
 * índice parcial `tarefa_prazo_pendente_idx`). Indisponível = null, nunca zero inventado.
 */
export async function contarVencidas(): Promise<number | null> {
  try {
    const supabase = criarClienteServidor();
    const { count, error } = await supabase
      .schema("core")
      .from("v_tarefa")
      .select("*", { count: "exact", head: true })
      .eq("vencida", true);
    return error ? null : count ?? 0;
  } catch {
    return null;
  }
}
