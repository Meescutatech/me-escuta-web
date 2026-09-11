import { cookies } from "next/headers";
import type { ConversaResumo, Mensagem } from "@/lib/dados/conversas";
import type { CardLead } from "@/lib/dados/funil";
import type { TarefaLead } from "@/lib/dados/lead-painel";
import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import type { EnvioProgramadoLinha } from "@/lib/conversas/envios-programados";
import { chaveCanonicaBR, mesmoNumeroBR } from "@/lib/conversas/telefone";
import type { AjusteProposta, MotivoDescarte, PropostaJarvis } from "@/components/jarvis/tipos";
import { PESSOAS, type PessoaEnsaio } from "./modo";
import type { CanalEnsaio } from "./fixtures/canais";
import { etapasEnsaio } from "./fixtures/conversas";

/**
 * O QUE O ENSAIO DE /conversas PRECISA LEMBRAR ENTRE DUAS REQUISIÇÕES (W-D3, 10/09).
 *
 * As fixtures são puras e determinísticas — abrir a tela duas vezes desenha o mesmo quadro. Mas
 * três gestos da demo MUDAM o quadro e precisam sobreviver ao `router.refresh()` que a tela já
 * dá depois de cada ação: a conversa NOVA aberta pelo "+", a tarefa que a pessoa ACEITOU do
 * Jarvis, e a programada que ela CANCELOU. Sem banco, a memória é um cookie — pequeno, sem PII
 * de verdade (é fixture), e só lido com `ensaioLigado()`.
 *
 * Este arquivo NÃO edita nenhuma fixture existente: ele soma por cima (`conversasExtra`,
 * `tarefasAceitas`) ou subtrai (`canceladas`). As fixtures de W-D2 continuam sendo a base.
 */

export const COOKIE_ESTADO_CONVERSAS = "me_escuta_ensaio_conversas";
const MAX_AGE = 60 * 60 * 24 * 7;
/** Cookie tem teto de ~4 KB; guardamos só os últimos gestos, que é o que a demo usa. */
const LIMITE_POR_LISTA = 8;

export interface ConversaNovaEnsaio {
  id: string;
  /** E.164 como foi digitado (com o 9). */
  telefone: string;
  nome: string;
  /** lead da fixture quando o número já era de alguém; senão um id novo, sintético. */
  lead_id: string;
  lead_novo: boolean;
  canal_id: string;
  /** quem abriu — vira `dono_atual`. */
  por: string;
  criado_em: string;
}

export interface TarefaAceitaEnsaio {
  id: string;
  lead_id: string | null;
  lead_nome: string | null;
  conversa_id: string;
  fazer: string;
  por_que: string;
  trecho: string | null;
  prazo: string | null;
  responsavel_id: string | null;
  responsavel_nome: string;
  criado_em: string;
}

/**
 * O que mudou numa proposta do Jarvis (vocabulário W-J, `components/jarvis/tipos.ts`): aceita
 * como veio, AJUSTADA (com o que estava antes) ou descartada (motivo em chip + observação).
 */
export interface DecisaoPropostaEnsaio {
  id: string;
  estado: "aceita" | "ajustada" | "descartada";
  por: string;
  em: string;
  /** só `ajustada`: os campos que a pessoa mudou. */
  ajuste?: AjusteProposta | null;
  /** só `ajustada`: o que o Jarvis tinha proposto. */
  original?: PropostaJarvis["original"];
  /** só `descartada`. */
  motivo?: MotivoDescarte | null;
  observacao?: string | null;
  tarefa_id?: string | null;
  /** proposta gerada pelo gatilho manual (não está na fixture): guarda o conteúdo para a nota ficar. */
  conteudo?: Omit<PropostaJarvis, "estado" | "decidido_por" | "decidido_em" | "original" | "motivo_descarte" | "observacao_descarte" | "feita_em" | "feita_por"> | null;
}

export interface EstadoConversasEnsaio {
  conversas: ConversaNovaEnsaio[];
  tarefas: TarefaAceitaEnsaio[];
  /** ids de mensagens programadas (da fixture) que a pessoa cancelou. */
  canceladas: string[];
  propostas: DecisaoPropostaEnsaio[];
}

const VAZIO: EstadoConversasEnsaio = { conversas: [], tarefas: [], canceladas: [], propostas: [] };

export function lerEstadoConversasEnsaio(): EstadoConversasEnsaio {
  try {
    const bruto = cookies().get(COOKIE_ESTADO_CONVERSAS)?.value;
    if (!bruto) return VAZIO;
    const j = JSON.parse(bruto) as Partial<EstadoConversasEnsaio>;
    return {
      conversas: Array.isArray(j.conversas) ? j.conversas : [],
      tarefas: Array.isArray(j.tarefas) ? j.tarefas : [],
      canceladas: Array.isArray(j.canceladas) ? j.canceladas : [],
      propostas: Array.isArray(j.propostas) ? j.propostas : [],
    };
  } catch {
    return VAZIO;
  }
}

/** Só de dentro de server action. Corta cada lista no teto para o cookie nunca estourar. */
export function gravarEstadoConversasEnsaio(estado: EstadoConversasEnsaio): void {
  const enxuto: EstadoConversasEnsaio = {
    conversas: estado.conversas.slice(-LIMITE_POR_LISTA),
    tarefas: estado.tarefas.slice(-LIMITE_POR_LISTA),
    canceladas: estado.canceladas.slice(-LIMITE_POR_LISTA * 2),
    propostas: estado.propostas.slice(-LIMITE_POR_LISTA),
  };
  cookies().set(COOKIE_ESTADO_CONVERSAS, JSON.stringify(enxuto), {
    path: "/",
    sameSite: "lax",
    maxAge: MAX_AGE,
  });
}

// ───────────────────────── leads "legados" só para a busca ─────────────────────────

/**
 * Dois números que existem SÓ na busca do "+": leads importados do Kommo, gravados SEM o nono
 * dígito (como a base real tem aos milhares). Servem para provar que a busca acha o lead antigo
 * quando a pessoa digita o número de hoje, com o 9 — e diz como achou.
 */
export const LEADS_LEGADOS_BUSCA: Array<Pick<CardLead, "lead_id" | "nome" | "telefone" | "etapa" | "kommo_lead_id" | "idade">> = [
  { lead_id: "1ead0000-0000-4000-8000-000000000101", nome: "Lourdes Andrade", telefone: "+553188712345", etapa: "avaliacao", kommo_lead_id: "8841203", idade: 79 },
  { lead_id: "1ead0000-0000-4000-8000-000000000102", nome: "Antônio Bento Lima", telefone: "+553187654321", etapa: "perdido", kommo_lead_id: "7710982", idade: 83 },
];

export interface LeadAchado {
  lead_id: string;
  nome: string;
  telefone: string;
  etapa: string;
  etapa_nome: string;
  kommo_lead_id: string | null;
  /** o número gravado difere do digitado só pelo 9 — a tela diz isso. */
  pela_variante: boolean;
  /** conversas que este lead já tem, por canal — "já falamos por aqui?" */
  conversas: Array<{ id: string; canal_id: string }>;
}

/**
 * "Este número já é de alguém?" — compara pela chave canônica (com o 9), nunca por igualdade de
 * string. Olha os 40 leads da fixture, as conversas novas do cookie e os legados sem o 9.
 */
export function procurarLeadPorTelefone(
  digitado: string,
  leads: CardLead[],
  conversas: ConversaResumo[],
  extras: ConversaNovaEnsaio[],
): LeadAchado | null {
  const chave = chaveCanonicaBR(digitado);
  if (!chave) return null;
  const nomeEtapa = (k: string) => etapasEnsaio().find((e) => e.chave === k)?.nome ?? k;

  const daFixture = leads.find((l) => mesmoNumeroBR(l.telefone, digitado));
  if (daFixture) {
    return {
      lead_id: daFixture.lead_id,
      nome: daFixture.nome ?? daFixture.telefone ?? digitado,
      telefone: daFixture.telefone ?? digitado,
      etapa: daFixture.etapa,
      etapa_nome: nomeEtapa(daFixture.etapa),
      kommo_lead_id: daFixture.kommo_lead_id ?? null,
      pela_variante: false,
      conversas: [
        ...conversas.filter((c) => c.lead_id === daFixture.lead_id && c.phone_number_id).map((c) => ({ id: c.id, canal_id: c.phone_number_id! })),
        ...extras.filter((e) => e.lead_id === daFixture.lead_id).map((e) => ({ id: e.id, canal_id: e.canal_id })),
      ],
    };
  }
  const nova = extras.find((e) => mesmoNumeroBR(e.telefone, digitado));
  if (nova) {
    return {
      lead_id: nova.lead_id,
      nome: nova.nome,
      telefone: nova.telefone,
      etapa: "novo",
      etapa_nome: nomeEtapa("novo"),
      kommo_lead_id: null,
      pela_variante: false,
      conversas: extras.filter((e) => e.lead_id === nova.lead_id).map((e) => ({ id: e.id, canal_id: e.canal_id })),
    };
  }
  const legado = LEADS_LEGADOS_BUSCA.find((l) => mesmoNumeroBR(l.telefone, digitado));
  if (legado) {
    return {
      lead_id: legado.lead_id,
      nome: legado.nome ?? legado.telefone ?? digitado,
      telefone: legado.telefone ?? digitado,
      etapa: legado.etapa,
      etapa_nome: nomeEtapa(legado.etapa),
      kommo_lead_id: legado.kommo_lead_id ?? null,
      pela_variante: true,
      conversas: extras.filter((e) => e.lead_id === legado.lead_id).map((e) => ({ id: e.id, canal_id: e.canal_id })),
    };
  }
  return null;
}

// ───────────────────────── a conversa nova como a tela a lê ─────────────────────────

/** `ConversaResumo` de uma conversa aberta pelo "+": sem mensagem ainda, dono = quem abriu. */
export function resumoDaConversaNova(
  n: ConversaNovaEnsaio,
  canais: CanalEnsaio[],
  leads: CardLead[],
): ConversaResumo | null {
  const canal = canais.find((c) => c.canal_id === n.canal_id);
  if (!canal) return null;
  const lead = leads.find((l) => l.lead_id === n.lead_id) ?? LEADS_LEGADOS_BUSCA.find((l) => l.lead_id === n.lead_id) ?? null;
  const etapa = lead?.etapa ?? "novo";
  return {
    id: n.id,
    telefone: n.telefone,
    nome: n.nome,
    mode: "HUMANO",
    dono_atual: n.por,
    status: "aberta",
    atualizado_em: n.criado_em,
    ultima_entrada_em: null,
    ultima_msg_em: null,
    lead_id: n.lead_id,
    etapa,
    etapa_nome: etapasEnsaio().find((e) => e.chave === etapa)?.nome ?? etapa,
    entrou_etapa_em: (lead as CardLead | null)?.entrou_etapa_em ?? n.criado_em,
    valor: (lead as CardLead | null)?.valor ?? null,
    origem: (lead as CardLead | null)?.origem ?? null,
    tags: (lead as CardLead | null)?.tags ?? [],
    kommo_lead_id: lead?.kommo_lead_id ?? null,
    idade: lead?.idade ?? null,
    previa: null,
    previa_saida: false,
    nao_lida: false,
    nao_lidas_qtd: 0,
    area: canal.departamento === "clinico" ? "clinico" : "pre_venda",
    phone_number_id: canal.canal_id,
    numero_apelido: canal.apelido,
    numero_e164: canal.numero_e164,
    finalidade: canal.finalidade,
  };
}

/** O lead sintético de um contato NOVO — para o painel de contexto não ficar vazio. */
export function cardDoLeadNovo(n: ConversaNovaEnsaio, pessoa: PessoaEnsaio): CardLead {
  const p = PESSOAS.find((x) => x.id === pessoa.id) ?? pessoa;
  return {
    lead_id: n.lead_id,
    nome: n.nome,
    idade: null,
    telefone: n.telefone,
    etapa: "novo",
    entrou_etapa_em: n.criado_em,
    valor: null,
    origem: null,
    responsavel: { tipo: p.chave === "fono" ? "fono" : "sara", nome: p.nome.split(" ")[0] },
    dono_id: p.id,
    dono_nome: p.nome.split(" ")[0],
    tags: [],
    proposta: null,
    kommo_lead_id: null,
    tem_tarefa_pendente: false,
    ultima_mensagem: null,
    compromisso_em: null,
  };
}

// ───────────────────────── tarefas aceitas do Jarvis ─────────────────────────

/** Como `TarefaLead` (painel da conversa + registro no fio). */
export function tarefaAceitaComoLead(t: TarefaAceitaEnsaio): TarefaLead {
  const pessoa = PESSOAS.find((p) => p.id === t.responsavel_id);
  return {
    id: t.id,
    titulo: t.fazer,
    responsavel: pessoa?.email ?? t.responsavel_nome,
    responsavel_id: t.responsavel_id,
    descricao: null,
    tipo: "followup",
    prazo: t.prazo,
    status: "pendente",
    resultado: null,
    criado_em: t.criado_em,
    concluida_em: null,
    por_que: t.por_que,
    fazer: t.fazer,
    trecho: t.trecho,
    origem: "jarvis_conversa",
  };
}

/**
 * Como `TarefaVisao` (a lista de /tarefas). Quem monta a página de tarefas junta isto ao
 * `visaoTarefasDeEnsaio()`: `[...tarefasAceitasComoVisao(), ...dados.tarefas]`.
 */
export function tarefasAceitasComoVisao(estado: EstadoConversasEnsaio = lerEstadoConversasEnsaio(), agora = new Date()): TarefaVisao[] {
  return estado.tarefas.map((t) => {
    const pessoa = PESSOAS.find((p) => p.id === t.responsavel_id);
    return {
      id: t.id,
      lead_id: t.lead_id,
      lead_nome: t.lead_nome,
      titulo: t.fazer,
      descricao: null,
      tipo: "followup",
      responsavel: pessoa?.email ?? t.responsavel_nome,
      responsavel_id: t.responsavel_id,
      prazo: t.prazo,
      status: "pendente",
      resultado: null,
      motivo_arquivo: null,
      criado_em: t.criado_em,
      concluida_em: null,
      vencida: !!t.prazo && new Date(t.prazo).getTime() < agora.getTime(),
      por_que: t.por_que,
      fazer: t.fazer,
      trecho: t.trecho,
      origem: "jarvis_conversa",
    };
  });
}

// ───────────────────────── programadas ─────────────────────────

/** As bolhas programadas da fixture como linhas de `api.v_envios_programados` (a faixa do composer). */
export function programadasDaConversa(conversaId: string, mensagens: Mensagem[], canceladas: string[]): EnvioProgramadoLinha[] {
  return mensagens
    .filter((m) => m.programada_para && !canceladas.includes(m.id))
    .map((m) => ({
      id: m.id,
      conversa_id: conversaId,
      corpo: m.corpo ?? "",
      enviar_em: m.programada_para!,
      status: "agendado" as const,
      erro: null,
      criado_por: null,
    }));
}

/** Instante de um prazo relativo ("hoje" = 18h de hoje, "amanhã" = 9h, "esta semana" = sexta 12h), fuso da operação (-03). */
export function instanteDoPrazo(prazo: "hoje" | "amanha" | "esta_semana", agora = new Date()): string {
  const OFFSET = -3 * 3_600_000;
  const local = new Date(agora.getTime() + OFFSET);
  const y = local.getUTCFullYear();
  const mo = local.getUTCMonth();
  const d = local.getUTCDate();
  const dow = local.getUTCDay();
  let alvo: number;
  if (prazo === "hoje") alvo = Date.UTC(y, mo, d, 18, 0) - OFFSET;
  else if (prazo === "amanha") alvo = Date.UTC(y, mo, d + 1, 9, 0) - OFFSET;
  else alvo = Date.UTC(y, mo, d + ((5 - dow + 7) % 7 || 7), 12, 0) - OFFSET;
  if (alvo <= agora.getTime()) alvo = agora.getTime() + 2 * 3_600_000;
  return new Date(alvo).toISOString();
}

// ───────────────────────── propostas do Jarvis ─────────────────────────

function aplicarDecisao(p: PropostaJarvis, d: DecisaoPropostaEnsaio): PropostaJarvis {
  if (d.estado === "descartada") {
    return { ...p, estado: "descartada", decidido_por: d.por, decidido_em: d.em, motivo_descarte: d.motivo ?? "outro", observacao_descarte: d.observacao ?? null };
  }
  if (d.estado === "ajustada") {
    return {
      ...p,
      fazer: d.ajuste?.fazer ?? p.fazer,
      prazo: d.ajuste?.prazo === undefined ? p.prazo : d.ajuste.prazo,
      responsavel_id: d.ajuste?.responsavel_id === undefined ? p.responsavel_id : d.ajuste.responsavel_id,
      responsavel_nome: d.ajuste?.responsavel_nome === undefined ? p.responsavel_nome : d.ajuste.responsavel_nome,
      estado: "ajustada",
      decidido_por: d.por,
      decidido_em: d.em,
      original: d.original ?? { fazer: p.fazer, prazo: p.prazo, responsavel_nome: p.responsavel_nome },
    };
  }
  return { ...p, estado: "aceita", decidido_por: d.por, decidido_em: d.em };
}

/**
 * As propostas como a tela as lê: a fixture com as decisões do cookie aplicadas por cima, mais
 * as propostas MANUAIS que foram decididas (descartada manual não deixa rastro — nunca existiu
 * no fio; aceita/ajustada manual fica, porque virou tarefa).
 */
export function propostasComDecisoes(fixture: PropostaJarvis[], estado: EstadoConversasEnsaio): PropostaJarvis[] {
  const decisoes = new Map(estado.propostas.map((d) => [d.id, d]));
  const saida: PropostaJarvis[] = fixture.map((p) => {
    const d = decisoes.get(p.id);
    return d ? aplicarDecisao(p, d) : p;
  });
  for (const d of estado.propostas) {
    if (d.conteudo && d.estado !== "descartada" && !fixture.some((p) => p.id === d.id)) {
      saida.push(aplicarDecisao({ ...d.conteudo, estado: "proposta" }, d));
    }
  }
  return saida;
}

/** id da tarefa que nasceu de uma proposta decidida (para o "Ver tarefa" da nota). */
export function tarefaDaProposta(propostaId: string, estado: EstadoConversasEnsaio): string | null {
  return estado.propostas.find((d) => d.id === propostaId)?.tarefa_id ?? null;
}
