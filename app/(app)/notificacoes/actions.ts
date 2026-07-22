"use server";

import { revalidatePath } from "next/cache";
import { registrarEventoUI, type ResultadoEvento } from "@/app/(app)/funil/actions";
import { lerNotificacoes } from "@/lib/dados/notificacoes";
import type { Notificacao } from "@/lib/notificacoes";

/**
 * Ações das NOTIFICAÇÕES (Rodada 13 / Bloco B). Toda escrita passa pela porta
 * `api.registrar_evento` — a mesma e única porta de escrita da UI. A porta valida (0038):
 * só o mencionado marca como lida; mencionado OU autor promovem a tarefa (§10.2).
 *
 * Contratos (spec §5.2, exatos):
 *  - mencao_lida             {mencao_id}
 *  - mencao_promovida_tarefa {mencao_id, tarefa_id}
 *  - tarefa_criada           {titulo, responsavel?, prazo?}   (0011)
 *  - tarefa_concluida        {tarefa_id, resultado}           (0011)
 */

function revalidarSino() {
  revalidatePath("/notificacoes");
  revalidatePath("/conversas");
}

export async function lerNotificacoesAction(): Promise<Notificacao[]> {
  return (await lerNotificacoes()).itens;
}

export async function marcarMencaoLida(mencaoId: string): Promise<ResultadoEvento> {
  if (!mencaoId) return { ok: false, motivo: "menção sem id — recarregue a lista" };
  const r = await registrarEventoUI("mencao_lida", { mencao_id: mencaoId });
  if (r.ok) revalidarSino();
  return r;
}

/** "Marcar todas como lidas": um evento por menção não lida — o ledger registra cada uma. */
export async function marcarTodasLidas(): Promise<ResultadoEvento> {
  const { itens } = await lerNotificacoes();
  const alvos = itens.filter((n) => n.especie === "mencao" && n.mencao_id && n.lida_em == null);
  if (alvos.length === 0) return { ok: true };

  let falha: string | null = null;
  for (const n of alvos) {
    const r = await registrarEventoUI("mencao_lida", { mencao_id: n.mencao_id });
    if (!r.ok) falha = r.motivo ?? "erro";
  }
  revalidarSino();
  return falha ? { ok: false, motivo: falha } : { ok: true };
}

/**
 * PROMOVER MENÇÃO A TAREFA EM 1 CLIQUE (§7, decisão §10.2) — o item que resolve o problema
 * na raiz: "@Dani liga hoje sem falta" É uma tarefa, escrita como nota porque criar tarefa
 * custava mais que escrever a frase.
 *
 * Dois eventos, nesta ordem: `tarefa_criada` (que nasce com o título vindo do trecho da
 * menção) e `mencao_promovida_tarefa` (que liga os dois e resolve a pendência). Se o segundo
 * falhar, a tarefa fica de pé e a menção segue pendente — estado honesto, sem tarefa órfã
 * invisível nem menção marcada como resolvida sem tarefa.
 *
 * DEPENDÊNCIA DO BLOCO A (0037): `responsavel_id uuid` ainda não existe em core.tarefa. O
 * payload manda `responsavel` no contrato vigente da 0011; quando a 0037 entrar, acrescentar
 * `responsavel_id` aqui (o projetor já preferirá a coluna nova).
 */
export async function promoverMencaoTarefa(
  mencaoId: string,
  leadId: string | null,
  titulo: string,
  responsavel: string | null,
): Promise<ResultadoEvento> {
  if (!mencaoId) return { ok: false, motivo: "menção sem id — recarregue a lista" };
  const t = titulo.trim();
  if (!t) return { ok: false, motivo: "a menção não tem texto para virar título da tarefa" };

  const payloadTarefa: Record<string, unknown> = { titulo: t };
  if (responsavel) payloadTarefa.responsavel = responsavel;

  // id_externo DERIVADO da menção: repetir o clique cai no dedupe UNIQUE(origem,id_externo) da
  // porta em vez de criar uma segunda tarefa. É também como recuperamos o id real depois.
  const idExterno = `mencao:${mencaoId}`;
  const criada = await registrarEventoUI(
    "tarefa_criada",
    payloadTarefa,
    leadId ?? undefined,
    idExterno,
  );
  if (!criada.ok) return criada;

  // core.tarefa.id = id do EVENTO tarefa_criada (0011) — a UI não o conhece antes de projetar
  const idReal = await idDoEvento(idExterno);
  if (!idReal) {
    return { ok: false, motivo: "tarefa criada, mas não localizada no ledger — recarregue" };
  }

  const ligada = await registrarEventoUI(
    "mencao_promovida_tarefa",
    { mencao_id: mencaoId, tarefa_id: idReal },
    leadId ?? undefined,
    `promocao:${mencaoId}`,
  );
  revalidarSino();
  return ligada;
}

async function idDoEvento(idExterno: string): Promise<string | null> {
  const { criarClienteServidor } = await import("@/lib/supabase/server");
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .schema("core")
    .from("evento")
    .select("id")
    .eq("origem", "ui")
    .eq("id_externo", idExterno)
    .limit(1);
  if (error || !data?.length) return null;
  return data[0].id as string;
}

/** Concluir tarefa direto do sino (o botão "Concluir" do mockup, estados b e c). */
export async function concluirTarefaNotificacao(
  tarefaId: string,
  resultado: string,
): Promise<ResultadoEvento> {
  if (!tarefaId) return { ok: false, motivo: "tarefa sem id — recarregue a lista" };
  const r = await registrarEventoUI("tarefa_concluida", {
    tarefa_id: tarefaId,
    resultado: resultado.trim() || "concluída",
  });
  if (r.ok) revalidarSino();
  return r;
}
