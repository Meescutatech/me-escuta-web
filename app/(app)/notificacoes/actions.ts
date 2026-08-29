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
 *  - notificacao_lida        {chave}                          (0306, F8) — chave = tarefa:<id>:<especie>
 */

function revalidarSino() {
  revalidatePath("/notificacoes");
  revalidatePath("/conversas");
}

export async function lerNotificacoesAction(): Promise<Notificacao[]> {
  return (await lerNotificacoes()).itens;
}

/**
 * F6 — a conferência de `mencao_lida` é por ESTADO (`lida_em not null`), não por posição: o
 * projetor tem `and m.lida_em is null` ("primeira leitura manda"), então remarcar uma menção já
 * lida é um no-op correto que não carimba posição nova. Conferir por posição reprovaria justamente
 * o caminho idempotente. Ver a tabela CONFERENCIA em lib/eventos/confirmar-projecao.ts.
 */
export async function marcarMencaoLida(mencaoId: string): Promise<ResultadoEvento> {
  if (!mencaoId) return { ok: false, motivo: "menção sem id — recarregue a lista" };
  const r = await registrarEventoUI("mencao_lida", { mencao_id: mencaoId });
  if (r.ok) revalidarSino();
  return r;
}

/**
 * F8 (0306) — a notificação de TAREFA ganha leitura própria. A chave carrega a espécie
 * (`tarefa:<id>:tarefa_atribuida` ≠ `tarefa:<id>:tarefa_vencendo`): ler o aviso de atribuição
 * não apaga o "vence em 1h" que chega depois. O usuário vem do ATOR na porta — ninguém marca
 * lida por outro. Remarcar é no-op (on conflict do nothing) e a conferência é por estado.
 */
export async function marcarNotificacaoLida(chave: string): Promise<ResultadoEvento> {
  const c = chave.trim();
  if (!c) return { ok: false, motivo: "notificação sem chave — recarregue a lista" };
  const r = await registrarEventoUI("notificacao_lida", { chave: c }, undefined, await idExternoLida(c));
  if (r.ok) revalidarSino();
  return r;
}

/**
 * id_externo da marca de leitura POR USUÁRIO. A porta dedupa por UNIQUE(origem,id_externo) com
 * origem fixa 'ui': se a chave fosse só `lida:<chave>`, o segundo usuário a ler a MESMA tarefa
 * (tarefa reatribuída, admin que também recebe) cairia no dedupe do primeiro — evento dele nunca
 * nasceria e a notificação ficaria não lida para sempre (achado do verificador, rodada 2). Com o
 * uid na chave, cada pessoa tem o seu evento e o retry da mesma pessoa continua idempotente.
 * Sem uid identificável, cai no uuid por ação (a porta segue recusando ator sem usuário).
 */
async function idExternoLida(chave: string): Promise<string | undefined> {
  const { criarClienteServidor } = await import("@/lib/supabase/server");
  const { data } = await criarClienteServidor().auth.getUser();
  const uid = data?.user?.id;
  return uid ? `lida:${uid}:${chave}` : undefined;
}

/**
 * "Marcar todas como lidas": um evento por notificação não lida — o ledger registra cada uma.
 * Menção emite `mencao_lida`; tarefa (F8) emite `notificacao_lida {chave}`. Alarme não tem leitura.
 */
export async function marcarTodasLidas(): Promise<ResultadoEvento> {
  const { itens } = await lerNotificacoes();
  const naoLidas = itens.filter((n) => n.lida_em == null);
  const mencoes = naoLidas.filter((n) => n.especie === "mencao" && n.mencao_id);
  const tarefas = naoLidas.filter((n) => n.especie !== "mencao" && n.tarefa_id);
  if (mencoes.length === 0 && tarefas.length === 0) return { ok: true };

  let falha: string | null = null;
  for (const n of mencoes) {
    const r = await registrarEventoUI("mencao_lida", { mencao_id: n.mencao_id });
    if (!r.ok) falha = r.motivo ?? "erro";
  }
  for (const n of tarefas) {
    const chave = `tarefa:${n.tarefa_id}:${n.especie}`;
    const r = await registrarEventoUI("notificacao_lida", { chave }, undefined, await idExternoLida(chave));
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
