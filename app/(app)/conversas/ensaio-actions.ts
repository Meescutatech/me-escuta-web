"use server";

import { revalidatePath } from "next/cache";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { canaisDeEnvio, gerarCanaisEnsaio } from "@/lib/ensaio/fixtures/canais";
import { gerarConversasEnsaio, gerarLeadsEnsaio } from "@/lib/ensaio/fixtures/conversas";
import {
  gravarEstadoConversasEnsaio,
  instanteDoPrazo,
  lerEstadoConversasEnsaio,
  procurarLeadPorTelefone,
  type DecisaoPropostaEnsaio,
  type LeadAchado,
  type TarefaAceitaEnsaio,
} from "@/lib/ensaio/conversas-extra";
import { ehPrazoCurto, type AjusteProposta, type MotivoDescarte, type PropostaJarvis } from "@/components/jarvis/tipos";
import { chaveCanonicaBR } from "@/lib/conversas/telefone";

/**
 * AÇÕES DO ENSAIO de /conversas (W-D3). Separadas de `actions.ts` de propósito: nada aqui toca
 * porta, ledger ou Supabase — só o cookie de estado do ensaio. Fora do modo ensaio toda ação
 * recusa, para nunca virar caminho de escrita paralelo.
 *
 * O contrato espelha o real (LiderHub `new-conversation.ts` + `start-conversation-dialog`):
 * o LOOKUP responde no servidor "este número é de alguém e por onde já falamos", e ABRIR nunca
 * manda mensagem — cria (ou acha) a conversa e leva a pessoa para o fio.
 */

function id(prefixo: string): string {
  const hex = () => Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  return `${prefixo}${hex()}-${hex().slice(0, 4)}-4${hex().slice(0, 3)}-8${hex().slice(0, 3)}-${hex()}${hex().slice(0, 4)}`.slice(0, 36);
}

export async function procurarPorTelefoneEnsaio(digitado: string): Promise<{ ok: true; lead: LeadAchado | null } | { ok: false; motivo: string }> {
  const pessoa = lerSessaoEnsaio();
  if (!pessoa) return { ok: false, motivo: "fora do modo ensaio" };
  if (!chaveCanonicaBR(digitado)) return { ok: false, motivo: "Digite um número brasileiro com DDD." };
  const agora = new Date();
  const estado = lerEstadoConversasEnsaio();
  const { conversas } = gerarConversasEnsaio(agora);
  const lead = procurarLeadPorTelefone(digitado, gerarLeadsEnsaio(agora), conversas, estado.conversas);
  return { ok: true, lead };
}

export async function abrirConversaEnsaio(entrada: {
  telefone: string;
  nome: string | null;
  canalId: string;
  leadId: string | null;
}): Promise<{ ok: true; conversaId: string; jaExistia: boolean } | { ok: false; motivo: string }> {
  const pessoa = lerSessaoEnsaio();
  if (!pessoa) return { ok: false, motivo: "fora do modo ensaio" };
  const chave = chaveCanonicaBR(entrada.telefone);
  if (!chave) return { ok: false, motivo: "Digite um número brasileiro com DDD." };
  const agora = new Date();
  const canais = gerarCanaisEnsaio(agora);
  // R2/R4: só por um canal que ESTA pessoa pode usar — o servidor confere, não a tela
  const permitidos = canaisDeEnvio(pessoa, canais).canais;
  const canal = permitidos.find((c) => c.canal_id === entrada.canalId);
  if (!canal) return { ok: false, motivo: "Você não envia por este número." };

  const estado = lerEstadoConversasEnsaio();
  const { conversas } = gerarConversasEnsaio(agora);
  const achado = procurarLeadPorTelefone(entrada.telefone, gerarLeadsEnsaio(agora), conversas, estado.conversas);

  // já existe conversa deste lead neste canal → é ela que abre (R3: md5(pnid|tel))
  const existente = achado?.conversas.find((c) => c.canal_id === canal.canal_id);
  if (existente) return { ok: true, conversaId: existente.id, jaExistia: true };

  const nome = (achado?.nome ?? entrada.nome ?? "").trim();
  if (!nome) return { ok: false, motivo: "Digite o nome de quem vai ser cadastrado." };

  const nova = {
    id: id("c0nv"),
    telefone: `+${chave}`,
    nome,
    lead_id: achado?.lead_id ?? id("1ead"),
    lead_novo: !achado,
    canal_id: canal.canal_id,
    por: pessoa.email,
    criado_em: agora.toISOString(),
  };
  gravarEstadoConversasEnsaio({ ...estado, conversas: [...estado.conversas, nova] });
  revalidatePath("/conversas");
  return { ok: true, conversaId: nova.id, jaExistia: false };
}

export async function aceitarPropostaJarvisEnsaio(entrada: {
  proposta: PropostaJarvis;
  /** o que a pessoa mudou antes de aceitar; null = aceitou como veio. */
  ajuste: AjusteProposta | null;
  /** true quando veio do gatilho manual (não está na fixture): o conteúdo vai para o cookie. */
  manual: boolean;
}): Promise<{ ok: true; tarefa: TarefaAceitaEnsaio; proposta: PropostaJarvis } | { ok: false; motivo: string }> {
  const pessoa = lerSessaoEnsaio();
  if (!pessoa) return { ok: false, motivo: "fora do modo ensaio" };
  const p = entrada.proposta;
  const a = entrada.ajuste;
  const fazer = (a?.fazer ?? p.fazer).trim();
  if (!fazer) return { ok: false, motivo: "A tarefa precisa dizer o que fazer." };
  const prazo = a?.prazo === undefined ? p.prazo : a.prazo;
  const responsavelId = a?.responsavel_id === undefined ? p.responsavel_id : a.responsavel_id;
  const responsavelNome = a?.responsavel_nome === undefined ? p.responsavel_nome : a.responsavel_nome;
  const agora = new Date();
  const quem = pessoa.nome.split(" ")[0];
  const tarefa: TarefaAceitaEnsaio = {
    id: id("7a5e"),
    lead_id: p.lead_id ?? null,
    lead_nome: p.lead_nome ?? null,
    conversa_id: p.conversa_id ?? "",
    fazer,
    por_que: p.por_que,
    trecho: p.trecho,
    prazo: ehPrazoCurto(prazo) ? instanteDoPrazo(prazo, agora) : prazo ?? null,
    responsavel_id: responsavelId ?? null,
    responsavel_nome: responsavelNome ?? quem,
    criado_em: agora.toISOString(),
  };
  const houveAjuste = !!a && (fazer !== p.fazer.trim() || (prazo ?? null) !== (p.prazo ?? null) || (responsavelId ?? null) !== (p.responsavel_id ?? null));
  const decisao: DecisaoPropostaEnsaio = {
    id: p.id,
    estado: houveAjuste ? "ajustada" : "aceita",
    por: quem,
    em: agora.toISOString(),
    tarefa_id: tarefa.id,
    ajuste: houveAjuste ? { fazer, prazo, responsavel_id: responsavelId ?? null, responsavel_nome: responsavelNome ?? null } : null,
    original: houveAjuste ? { fazer: p.fazer, prazo: p.prazo, responsavel_nome: p.responsavel_nome } : null,
    conteudo: entrada.manual
      ? {
          id: p.id,
          conversa_id: p.conversa_id,
          lead_id: p.lead_id,
          lead_nome: p.lead_nome,
          criado_em: p.criado_em,
          por_que: p.por_que,
          fazer: p.fazer,
          trecho: p.trecho,
          trecho_mensagem_id: p.trecho_mensagem_id,
          tipo: p.tipo,
          prazo: p.prazo,
          responsavel_id: p.responsavel_id,
          responsavel_nome: p.responsavel_nome,
        }
      : null,
  };
  const estado = lerEstadoConversasEnsaio();
  gravarEstadoConversasEnsaio({
    ...estado,
    tarefas: [...estado.tarefas, tarefa],
    propostas: [...estado.propostas.filter((d) => d.id !== p.id), decisao],
  });
  revalidatePath("/conversas");
  revalidatePath("/tarefas");
  const decidida: PropostaJarvis = houveAjuste
    ? { ...p, fazer, prazo, responsavel_id: responsavelId ?? null, responsavel_nome: responsavelNome ?? null, estado: "ajustada", decidido_por: quem, decidido_em: decisao.em, original: decisao.original }
    : { ...p, estado: "aceita", decidido_por: quem, decidido_em: decisao.em };
  return { ok: true, tarefa, proposta: decidida };
}

export async function descartarPropostaJarvisEnsaio(entrada: {
  propostaId: string;
  manual: boolean;
  motivo: MotivoDescarte;
  observacao: string | null;
}): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const pessoa = lerSessaoEnsaio();
  if (!pessoa) return { ok: false, motivo: "fora do modo ensaio" };
  // proposta manual descartada nunca existiu no fio — não deixa rastro no cookie
  if (!entrada.manual) {
    const estado = lerEstadoConversasEnsaio();
    const decisao: DecisaoPropostaEnsaio = {
      id: entrada.propostaId,
      estado: "descartada",
      por: pessoa.nome.split(" ")[0],
      em: new Date().toISOString(),
      motivo: entrada.motivo,
      observacao: entrada.observacao?.trim() || null,
    };
    gravarEstadoConversasEnsaio({ ...estado, propostas: [...estado.propostas.filter((d) => d.id !== entrada.propostaId), decisao] });
  }
  revalidatePath("/conversas");
  return { ok: true };
}

export async function cancelarProgramadaEnsaio(mensagemId: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const pessoa = lerSessaoEnsaio();
  if (!pessoa) return { ok: false, motivo: "fora do modo ensaio" };
  const estado = lerEstadoConversasEnsaio();
  if (!estado.canceladas.includes(mensagemId)) {
    gravarEstadoConversasEnsaio({ ...estado, canceladas: [...estado.canceladas, mensagemId] });
  }
  revalidatePath("/conversas");
  return { ok: true };
}

// ───────────────────────── painel do lead (W-D3 v3) ─────────────────────────

export async function salvarCampoFichaEnsaio(
  leadId: string,
  slug: string,
  valor: string | number | boolean | null,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const pessoa = lerSessaoEnsaio();
  if (!pessoa) return { ok: false, motivo: "fora do modo ensaio" };
  if (!leadId || !slug.trim()) return { ok: false, motivo: "campo sem slug" };
  const estado = lerEstadoConversasEnsaio();
  gravarEstadoConversasEnsaio({ ...estado, ficha: { ...estado.ficha, [leadId]: { ...(estado.ficha[leadId] ?? {}), [slug]: valor } } });
  revalidatePath("/conversas");
  return { ok: true };
}

export async function moverEtapaEnsaio(leadId: string, etapa: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const pessoa = lerSessaoEnsaio();
  if (!pessoa) return { ok: false, motivo: "fora do modo ensaio" };
  if (!leadId || !etapa) return { ok: false, motivo: "escolha uma etapa" };
  const estado = lerEstadoConversasEnsaio();
  gravarEstadoConversasEnsaio({ ...estado, etapas: { ...estado.etapas, [leadId]: { etapa, em: new Date().toISOString() } } });
  revalidatePath("/conversas");
  revalidatePath("/funil");
  return { ok: true };
}

export async function concluirTarefaEnsaio(tarefaId: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const pessoa = lerSessaoEnsaio();
  if (!pessoa) return { ok: false, motivo: "fora do modo ensaio" };
  const estado = lerEstadoConversasEnsaio();
  if (!estado.concluidas.includes(tarefaId)) gravarEstadoConversasEnsaio({ ...estado, concluidas: [...estado.concluidas, tarefaId] });
  revalidatePath("/conversas");
  revalidatePath("/tarefas");
  return { ok: true };
}

/** W-D3 v6 · adiar do modo foco — `tarefa_prazo_repactuado` em produção; aqui, cookie. */
export async function adiarTarefaEnsaio(tarefaId: string, prazoIso: string, motivo: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const pessoa = lerSessaoEnsaio();
  if (!pessoa) return { ok: false, motivo: "fora do modo ensaio" };
  if (!motivo.trim()) return { ok: false, motivo: "escolha por que está adiando" };
  const estado = lerEstadoConversasEnsaio();
  gravarEstadoConversasEnsaio({ ...estado, prazos: { ...estado.prazos, [tarefaId]: prazoIso } });
  revalidatePath("/conversas");
  revalidatePath("/tarefas");
  return { ok: true };
}
