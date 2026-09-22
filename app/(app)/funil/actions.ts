"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { confirmarProjecao, type RespostaRegistrarEvento } from "@/lib/eventos/confirmar-projecao";
import { buscarLeads, type ResultadoBusca } from "@/lib/dados/funil";
import { lerMensagens, type Mensagem } from "@/lib/dados/conversas";
import { ordenarFiosDoLead } from "@/lib/conversas/fios-do-lead";
import { decidirArquivamento } from "@/lib/funil/arquivar";

export interface ResultadoEvento {
  ok: boolean;
  motivo?: string;
  /**
   * true = a porta absorveu por idempotência (mesma `id_externo`). É SUCESSO, não falha — mas
   * sucesso distinguível: nada novo foi gravado, e a projeção vigente é a do evento original.
   * Quem trata "salvei" e "já estava salvo" igual está mentindo por omissão.
   */
  duplicado?: boolean;
}

/**
 * ÚNICO caminho de escrita da UI: a porta `api.registrar_evento(p jsonb)` (param = `p`).
 * Envelope EXATO (verificado no corpo da função no remoto):
 *   { tipo, id_externo:<uuid v4 novo por ação>, versao_payload:1, lead_id?, payload:{...} }
 * A porta FORÇA ator=`humano:<uid>` + origem=ui — NÃO enviar. Idempotência por (origem, id_externo).
 *
 * TODO(spec) D9 — formato de ator diverge entre RPCs da porta: registrar_evento carimba
 * `humano:<uid>` (auth.uid), enquanto propor/validar_sugestao usam `humano:<email>` (auth.jwt.email).
 * Ex.: enviar_mensagem_humana → humano:<uid>; prompt_atualizado → humano:<email>. Unificar pós-MVP
 * (dono do laço = Agent 2). Cosmético; não afeta a demo.
 */
export async function registrarEventoUI(
  tipo: string,
  payload: Record<string, unknown>,
  leadId?: string,
  idExterno?: string,
): Promise<ResultadoEvento> {
  const supabase = criarClienteServidor();
  const envelope: Record<string, unknown> = {
    tipo,
    // idExterno estável (ex.: id da bolha otimista) ⇒ retry da MESMA ação cai no dedupe
    // UNIQUE(origem,id_externo) da porta em vez de gravar evento novo. Ausente ⇒ uuid por ação.
    id_externo: idExterno ?? randomUUID(),
    versao_payload: 1,
    payload,
  };
  if (leadId) envelope.lead_id = leadId;

  const { data, error } = await supabase.schema("api").rpc("registrar_evento", { p: envelope });
  if (error) return { ok: false, motivo: error.message };

  // F6 — o corpo da resposta era JOGADO FORA aqui, e com ele a única prova de que a escrita virou
  // dado. Verificado por execução: reenviar a mesma id_externo com texto diferente devolve
  // {"duplicado":true}, o texto novo some, e a tela dizia que salvou.
  const resposta = (data ?? null) as RespostaRegistrarEvento | null;
  const conferido = await confirmarProjecao(supabase, tipo, payload, resposta);
  if (!conferido.ok) return conferido;

  revalidatePath("/funil");
  revalidatePath("/timeline");
  return { ok: true, ...(resposta?.duplicado ? { duplicado: true } : {}) };
}

/**
 * Atribui/remove o responsável do lead (0060): emite dono_atribuido {lead_id, dono_id}.
 * A chave dono_id vai SEMPRE no payload — null é remoção EXPLÍCITA (a porta recusa ausência).
 */
export async function atribuirDono(leadId: string, donoId: string | null): Promise<ResultadoEvento> {
  return registrarEventoUI("dono_atribuido", { lead_id: leadId, dono_id: donoId }, leadId);
}

/**
 * Açúcar do arrastar-card: emite etapa_alterada no shape do contrato.
 *
 * R20 — `motivo` só existe na saída para etapa de tipo `perdido`, e vai no MESMO evento, não num
 * evento seguinte: perder o lead e dizer por quê é um ato só. Dois eventos criariam a janela em que
 * o lead está perdido sem motivo, que é exatamente o estado que o campo existe para impedir.
 */
export async function moverCardEtapa(
  leadId: string,
  etapaDe: string,
  etapaPara: string,
  motivo?: { chave: string; detalhe?: string },
): Promise<ResultadoEvento> {
  const payload: Record<string, unknown> = {
    lead_id: leadId,
    etapa_de: etapaDe,
    etapa_para: etapaPara,
  };
  if (motivo?.chave) {
    payload.motivo_perda = motivo.chave;
    if (motivo.detalhe?.trim()) payload.motivo_detalhe = motivo.detalhe.trim();
  }
  return registrarEventoUI("etapa_alterada", payload, leadId);
}

/**
 * 4i · ARQUIVAR LEAD À MÃO — a "exclusão" que faltava, no modelo event-sourced.
 *
 * Num ledger append-only não se DELETA um lead (o fato não se apaga; só se compensa). O sistema já
 * modela isso: `arquivado` é uma etapa real (582 dos 679 leads vivem lá) e a ingestão DESARQUIVA
 * sozinha quando o lead volta a falar (migration 0029). Então "excluir da mão" = mover para
 * `arquivado` via `etapa_alterada`, com motivo — o mesmo caminho da perda, reversível por natureza.
 *
 * Recebe a etapa atual para gravar `etapa_de` correto (o ledger conta de-para, não só o destino).
 * O `motivo` é opcional mas recomendado: arquivar sem dizer por quê é a operação que a auditoria
 * mais reclama de não ter rastro.
 */
export async function arquivarLead(
  leadId: string,
  etapaDe: string,
  motivo?: string,
): Promise<ResultadoEvento> {
  const decisao = decidirArquivamento(leadId, etapaDe, motivo);
  if (!decisao.ok) return { ok: false, motivo: decisao.motivo };
  return registrarEventoUI("etapa_alterada", decisao.payload, leadId);
}

/** Campos do lead criado à mão. Só `nome` é obrigatório — telefone entra depois, pela ficha. */
export interface NovoLead {
  nome: string;
  telefone?: string;
  origem?: string;
  etapa: string;
  /** uuid de core.usuario — quem fica com o lead. Ausente = sem dono (a faixa de alarme acusa). */
  donoId?: string | null;
}

/**
 * R20 · CRIAR LEAD À MÃO — o ato que faltava para isto ser um sistema e não um receptor de WhatsApp.
 *
 * Quem chega por ligação, indicação ou pela mão da fono não tem conversa de WhatsApp para nascer
 * de, e hoje simplesmente não existe no board (medido no gap: A6 = NÃO TEM).
 *
 * O `lead_id` é gerado AQUI e vai no envelope: `proj_lead` usa o lead_id do evento como chave da
 * projeção. O `id_externo` é o MESMO uuid — assim o duplo-clique no botão cai no dedupe da porta
 * (UNIQUE(origem,id_externo)) em vez de criar dois leads iguais, que é o defeito clássico desta tela.
 */
export async function criarLeadManual(dados: NovoLead): Promise<ResultadoEvento & { leadId?: string }> {
  const nome = dados.nome.trim();
  if (!nome) return { ok: false, motivo: "Nome é obrigatório." };

  const leadId = randomUUID();
  const payload: Record<string, unknown> = { lead_id: leadId, nome, etapa: dados.etapa };
  const tel = dados.telefone?.trim();
  if (tel) payload.telefone = tel;
  // origem fica sob vocabulário da config de captação; 'manual' é o valor honesto para quem foi
  // digitado por uma pessoa — nunca herdar 'meta'/'wa' de um lead que não veio de canal nenhum.
  payload.origem = dados.origem?.trim() || "manual";
  if (dados.donoId) payload.dono_id = dados.donoId;

  const res = await registrarEventoUI("lead_criado", payload, leadId, leadId);
  return res.ok ? { ...res, leadId } : res;
}

/*
 * ── R23 · Trilha E — a busca do board ───────────────────────────────────────────────────────
 *
 * LEITURA PURA. Não passa pela porta, não registra evento, não escreve nada — é um SELECT com a
 * mesma sessão/RLS do resto do app. Está aqui, e não numa rota, porque é o board (componente de
 * cliente) que pergunta, e a resposta precisa vir do servidor para poder olhar o banco inteiro em
 * vez do array que o board já tem na memória.
 *
 * Por que o servidor e não mais um `fetch` do cliente contra o PostgREST: a chave anônima no
 * navegador só enxerga o que a RLS permitir para a sessão, e a montagem do card (chip de
 * responsável, mapa de origem, tags) tem que ser a MESMA do board — ela mora em `montarCard`,
 * server-side. Duas montagens dariam duas caras ao mesmo lead.
 */
export async function buscarLeadsAcao(termo: string): Promise<ResultadoBusca> {
  return buscarLeads(termo);
}

/*
 * ── W-D6 (10/09) · A CONVERSA DENTRO DO DRAWER (card G6 do board) ─────────────────────────────
 *
 * LEITURA PURA, como a busca acima: SELECT com a sessão/RLS de quem está logado, zero escrita.
 * Existe porque o botão "Abrir conversa" do drawer empurrava a pessoa para /conversas e a tirava
 * do funil — e a pergunta que ela tinha ("o que ele disse por último?") cabe numa aba. Responder
 * continua sendo em /conversas: o composer, a janela de 24h e o seletor de número moram lá, e
 * duplicá-los aqui seria dois lugares para o mesmo envio.
 *
 * A conversa MAIS RECENTE do lead (um lead pode ter mais de uma: número oficial + Lite da fono).
 * `null` = não há conversa OU a leitura falhou — a aba diz "sem conversa registrada" nos dois
 * casos, porque para quem lê o efeito é o mesmo e inventar a distinção seria chutar.
 */
export interface ConversaDoLeadLida {
  conversaId: string;
  mensagens: Mensagem[];
  /**
   * 15/09 · o que o `chipDoNumero` (M7) precisa para etiquetar o bloco. Antes existia só um
   * `canal: string | null` já achatado, e com ele a etiqueta perde os cinco casos e os selos —
   * inclusive o de TESTE, que é o que corrige um engano ativo.
   */
  phone_number_id: string | null;
  numero_apelido: string | null;
  numero_e164: string | null;
  finalidade: "producao" | "teste" | null;
  /** ordena os blocos; `null` vai para o fim sem sumir. */
  atualizado_em: string | null;
  /** 0352 — pushname do WhatsApp. */
  nome_contato: string | null;
}

/**
 * TODOS os fios do lead, do mais recente para o mais antigo — um por número.
 *
 * Antes esta leitura tinha teto de um único registro, e isso deixou de ser verdade em 15/09 com o
 * fio novo por número:
 * o lead com 3 fios mostraria 1 e esconderia 2, em silêncio. O teto foi embora; o que segura o
 * custo é o `ULTIMAS_MENSAGENS` do drawer, por bloco.
 */
export async function lerFiosDoLeadAcao(leadId: string): Promise<ConversaDoLeadLida[]> {
  try {
    const supabase = criarClienteServidor();
    const consulta = (colunas: string) =>
      supabase
        .schema("core")
        .from("v_conversa")
        .select(colunas)
        .eq("lead_id", leadId)
        .order("atualizado_em", { ascending: false, nullsFirst: false });
    // mesmo degrau de `lerConversas`: apelido, identidade e finalidade vêm da 0094 e podem não
    // existir no ambiente. Sem `phone_number_id` e `finalidade` o chip cai no caso errado e o selo
    // de TESTE some justamente quando todo mundo está testando — por isso eles entram no degrau 1.
    let { data, error } = await consulta(
      "id,phone_number_id,numero_apelido,numero_e164,finalidade,atualizado_em,nome_contato",
    );
    if (error) ({ data, error } = await consulta("id,phone_number_id,numero_apelido,numero_e164,finalidade,atualizado_em"));
    if (error) ({ data, error } = await consulta("id,atualizado_em"));
    if (error || !data) return [];
    const linhas = (data as any[]) ?? [];
    const fios = await Promise.all(
      linhas.map(async (linha) => ({
        conversaId: String(linha.id),
        mensagens: await lerMensagens(String(linha.id)),
        phone_number_id: linha.phone_number_id ?? null,
        numero_apelido: linha.numero_apelido ?? null,
        numero_e164: linha.numero_e164 ?? null,
        finalidade: linha.finalidade ?? null,
        atualizado_em: linha.atualizado_em ?? null,
        nome_contato: linha.nome_contato ?? null,
      })),
    );
    return ordenarFiosDoLead(fios);
  } catch {
    return [];
  }
}
