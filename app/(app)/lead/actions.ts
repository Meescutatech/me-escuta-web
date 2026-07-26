"use server";

import { revalidatePath } from "next/cache";
import { registrarEventoUI, type ResultadoEvento } from "@/app/(app)/funil/actions";
import { lerPainelLead, type PainelLead } from "@/lib/dados/lead-painel";
import type { ValorCampo } from "@/lib/dados/ficha-calculos";
import {
  payloadMencaoCriada,
  type MencaoResolvida,
  type OrigemMencao,
} from "@/lib/conversas/mencao";
import {
  construirArquivamento,
  construirReatribuicao,
  construirRepactuacao,
} from "@/lib/dados/tarefa-eventos";

/**
 * Ações do PAINEL DO LEAD (ficha + tarefas + anotações + menções) — compartilhadas entre
 * /conversas (zona 3), o composer da conversa e o drawer do funil. Toda escrita passa pela
 * porta api.registrar_evento (única porta de escrita da UI); a projeção é síncrona na porta,
 * então revalidar já re-lê o estado. A porta força ator = `humano:auth.uid()` — o payload
 * carrega o uuid mesmo assim, porque o evento tem que bastar para reconstruir a projeção
 * (princípio §2.5) e porque `responsavel` ≠ `autor do evento`.
 *
 * Contratos (0011 + 0028 + spec R13 §5.2/§5.4):
 *  - tarefa_criada   {titulo, descricao?, tipo?, responsavel_id?, responsavel?, prazo?, conversa_id?}
 *  - tarefa_concluida {tarefa_id, resultado}  — resultado obrigatório (§4.1.2); a porta valida
 *  - anotacao_adicionada {texto, tipo, autor_id?, autor?}  — nota NASCE CLASSIFICADA (§2-bis.3)
 *  - mencao_criada   {mencionado_id, origem_tipo, origem_id, trecho}  — contrato do Bloco B
 *  - mencao_lida     {mencao_id}
 *
 * Sobre `origem_id`: o id da nota/tarefa é o id do evento que a criou, e a porta não devolve
 * esse id para a UI. Por isso a UI gera a chave de idempotência (`id_externo`) e a usa como
 * `origem_id` — é estável, única e casa com o evento de origem pelo par (origem, id_externo).
 * Ponto de integração declarado no relatório: se o Bloco B preferir amarrar `core.mencao.origem_id`
 * ao `evento.id` da nota, a projeção resolve pelo `id_externo` sem mudança nesta UI.
 */

function revalidarPaineis() {
  revalidatePath("/conversas");
  revalidatePath("/tarefas"); // visão de tarefas (R14) lê as mesmas projeções
  // /funil e /timeline já são revalidados dentro de registrarEventoUI
}

/** Leitura via server action p/ o drawer do funil (client) buscar ao abrir o card. */
export async function lerPainelLeadAction(leadId: string): Promise<PainelLead> {
  return lerPainelLead(leadId);
}

/** Tipo da nota. Mínimo desta rodada (§2-bis.3): nasce classificada, com espaço para crescer. */
export type TipoAnotacao = "interna";

export interface DadosNota {
  texto: string;
  tipo?: TipoAnotacao;
  autorId: string | null;
  autorEmail: string | null;
  mencoes: MencaoResolvida[];
}

export interface DadosTarefa {
  titulo: string;
  descricao?: string | null;
  tipo?: string | null;
  responsavelId: string | null;
  /** legado de exibição (e-mail); o dado forte é o `responsavelId`. */
  responsavel?: string | null;
  prazoIso: string | null;
  conversaId?: string | null;
  mencoes: MencaoResolvida[];
}

export async function criarAnotacaoLead(
  leadId: string,
  dados: DadosNota,
): Promise<ResultadoEvento> {
  const texto = dados.texto.trim();
  if (!texto) return { ok: false, motivo: "texto vazio" };

  const origemId = crypto.randomUUID();
  const payload: Record<string, unknown> = { texto, tipo: dados.tipo ?? "interna" };
  if (dados.autorId) payload.autor_id = dados.autorId;
  if (dados.autorEmail) payload.autor = dados.autorEmail;

  const r = await registrarEventoUI("anotacao_adicionada", payload, leadId, origemId);
  if (!r.ok) return r;

  await emitirMencoes(dados.mencoes, "nota", origemId, texto, leadId);
  revalidarPaineis();
  return r;
}

export async function criarTarefaLead(
  leadId: string,
  dados: DadosTarefa,
): Promise<ResultadoEvento> {
  const titulo = dados.titulo.trim();
  if (!titulo) return { ok: false, motivo: "título vazio" };

  const origemId = crypto.randomUUID();
  const payload: Record<string, unknown> = { titulo };
  const descricao = (dados.descricao ?? "").trim();
  if (descricao) payload.descricao = descricao;
  if (dados.tipo) payload.tipo = dados.tipo;
  if (dados.responsavelId) payload.responsavel_id = dados.responsavelId;
  if (dados.responsavel) payload.responsavel = dados.responsavel;
  if (dados.prazoIso) payload.prazo = dados.prazoIso;
  if (dados.conversaId) payload.conversa_id = dados.conversaId;

  const r = await registrarEventoUI("tarefa_criada", payload, leadId, origemId);
  if (!r.ok) return r;

  await emitirMencoes(dados.mencoes, "tarefa", origemId, `${titulo} ${descricao}`.trim(), leadId);
  revalidarPaineis();
  return r;
}

/**
 * Conclusão exige resultado (§4.1.2) — no Kommo só 29,1% das tarefas concluídas têm resultado
 * justamente porque o obrigatório era do formulário. Aqui a UI recusa antes de bater na porta,
 * e a porta (Bloco A) recusa de novo: é a validação que vale.
 */
export async function concluirTarefaLead(
  leadId: string,
  tarefaId: string,
  resultado: string,
): Promise<ResultadoEvento> {
  if (!tarefaId) return { ok: false, motivo: "tarefa sem id — recarregue a lista" };
  const desfecho = resultado.trim();
  if (!desfecho) return { ok: false, motivo: "descreva o resultado para concluir" };
  const r = await registrarEventoUI(
    "tarefa_concluida",
    { tarefa_id: tarefaId, resultado: desfecho },
    leadId,
  );
  if (r.ok) revalidarPaineis();
  return r;
}

/**
 * Ciclo de vida da tarefa (Rodada 14 — A-7 do Bloco C fechado): reatribuir, repactuar prazo e
 * arquivar, pelos MESMOS trilhos da conclusão. Payload construído em módulo puro
 * (lib/dados/tarefa-eventos.ts, testado chave a chave); a porta do Bloco A revalida tudo —
 * motivo obrigatório (23514), membro ativo (22023), só tarefa pendente (55000). O `leadId`
 * ancora o evento no ledger do lead; sem ele o evento ainda é válido (a porta acha a tarefa
 * pelo tarefa_id).
 */
export async function reatribuirTarefaLead(
  leadId: string | null,
  tarefaId: string,
  responsavelId: string,
): Promise<ResultadoEvento> {
  const c = construirReatribuicao(tarefaId, responsavelId);
  if (!c.ok) return c;
  const r = await registrarEventoUI(c.tipo, c.payload, leadId ?? undefined);
  if (r.ok) revalidarPaineis();
  return r;
}

export async function repactuarPrazoTarefaLead(
  leadId: string | null,
  tarefaId: string,
  prazoIso: string,
  motivo: string,
): Promise<ResultadoEvento> {
  const c = construirRepactuacao(tarefaId, prazoIso, motivo);
  if (!c.ok) return c;
  const r = await registrarEventoUI(c.tipo, c.payload, leadId ?? undefined);
  if (r.ok) revalidarPaineis();
  return r;
}

export async function arquivarTarefaLead(
  leadId: string | null,
  tarefaId: string,
  motivo: string,
): Promise<ResultadoEvento> {
  const c = construirArquivamento(tarefaId, motivo);
  if (!c.ok) return c;
  const r = await registrarEventoUI(c.tipo, c.payload, leadId ?? undefined);
  if (r.ok) revalidarPaineis();
  return r;
}

/**
 * C7 — acuse de recebimento da menção (os "olhinhos" do Notion, §7-bis.8). Best-effort: quem
 * leu já leu, e falhar em registrar isso nunca pode virar erro na cara de ninguém.
 */
export async function marcarMencaoLida(mencaoId: string): Promise<ResultadoEvento> {
  if (!mencaoId) return { ok: false, motivo: "menção sem id" };
  return registrarEventoUI("mencao_lida", { mencao_id: mencaoId });
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

/**
 * Um `mencao_criada` por mencionado. Falha de menção NÃO desfaz a nota — a nota já está no
 * ledger e desfazer é impossível (append-only). O autor perde a notificação, não o registro.
 */
async function emitirMencoes(
  mencoes: MencaoResolvida[],
  origemTipo: OrigemMencao,
  origemId: string,
  texto: string,
  leadId: string,
): Promise<void> {
  const unicas = new Map<string, MencaoResolvida>();
  for (const m of mencoes) if (!unicas.has(m.id)) unicas.set(m.id, m);
  for (const m of unicas.values()) {
    await registrarEventoUI(
      "mencao_criada",
      payloadMencaoCriada(m, origemTipo, origemId, texto) as unknown as Record<string, unknown>,
      leadId,
    );
  }
}
