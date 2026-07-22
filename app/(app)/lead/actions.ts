"use server";

import { revalidatePath } from "next/cache";
import { registrarEventoUI, type ResultadoEvento } from "@/app/(app)/funil/actions";
import { lerPainelLead, type PainelLead } from "@/lib/dados/lead-painel";
import type { ValorCampo } from "@/lib/dados/ficha-calculos";

/**
 * Ações do PAINEL DO LEAD (ficha + tarefas + anotações) — compartilhadas entre /conversas
 * (zona 3) e o drawer do funil. Toda escrita passa pela porta api.registrar_evento (única
 * porta de escrita da UI); a projeção é síncrona na porta, então revalidar já re-lê o estado.
 *
 * Contratos (0011 + 0028):
 *  - tarefa_criada  {titulo, responsavel?, prazo?}  → core.tarefa (id = evento.id)
 *  - tarefa_concluida {tarefa_id, resultado} → guard por posição (SEM tarefa_id a projeção
 *    nunca reflete — era o bug da R7, consertado aqui: a UI só conclui tarefa que veio da
 *    projeção, com o id real)
 *  - anotacao_adicionada {texto, autor}
 *  - lead_atualizado {campos: {"<slug>": <valor|null>}} (null = limpar) — contrato fixo D1/R8
 */

function revalidarPaineis() {
  revalidatePath("/conversas");
  // /funil e /timeline já são revalidados dentro de registrarEventoUI
}

/** Leitura via server action p/ o drawer do funil (client) buscar ao abrir o card. */
export async function lerPainelLeadAction(leadId: string): Promise<PainelLead> {
  return lerPainelLead(leadId);
}

export async function criarTarefaLead(
  leadId: string,
  titulo: string,
  prazoIso: string | null,
  responsavel: string | null,
): Promise<ResultadoEvento> {
  const t = titulo.trim();
  if (!t) return { ok: false, motivo: "título vazio" };
  const payload: Record<string, unknown> = { titulo: t };
  if (prazoIso) payload.prazo = prazoIso;
  if (responsavel) payload.responsavel = responsavel;
  const r = await registrarEventoUI("tarefa_criada", payload, leadId);
  if (r.ok) revalidarPaineis();
  return r;
}

export async function concluirTarefaLead(
  leadId: string,
  tarefaId: string,
  resultado: string,
): Promise<ResultadoEvento> {
  if (!tarefaId) return { ok: false, motivo: "tarefa sem id — recarregue a lista" };
  const r = await registrarEventoUI(
    "tarefa_concluida",
    { tarefa_id: tarefaId, resultado: resultado.trim() || "concluída" },
    leadId,
  );
  if (r.ok) revalidarPaineis();
  return r;
}

export async function criarAnotacaoLead(
  leadId: string,
  texto: string,
  autor: string | null,
): Promise<ResultadoEvento> {
  const tx = texto.trim();
  if (!tx) return { ok: false, motivo: "texto vazio" };
  const payload: Record<string, unknown> = { texto: tx };
  if (autor) payload.autor = autor;
  const r = await registrarEventoUI("anotacao_adicionada", payload, leadId);
  if (r.ok) revalidarPaineis();
  return r;
}

export async function salvarCampoFicha(
  leadId: string,
  slug: string,
  valor: ValorCampo,
): Promise<ResultadoEvento> {
  if (!slug.trim()) return { ok: false, motivo: "campo sem slug" };
  const r = await registrarEventoUI("lead_atualizado", { campos: { [slug]: valor } }, leadId);
  if (r.ok) revalidarPaineis();
  return r;
}
