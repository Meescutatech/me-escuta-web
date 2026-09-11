import type { CardLead } from "@/lib/dados/funil";
import type { ProximaTarefa } from "@/lib/dados/funil-calculos";
import type { Mensagem } from "@/lib/dados/conversas";
import type { PainelLead, TarefaLead } from "@/lib/dados/lead-painel";
import { PESSOAS } from "./modo";
import { gerarConversasEnsaio, gerarLeadsEnsaio, painelLeadEnsaio } from "./fixtures/conversas";

/*
 * W-D6 (10/09) · O QUE O FUNIL PRECISA ALÉM DOS 40 LEADS DA FIXTURE.
 *
 * Arquivo NOVO, e não edição de `fixtures/conversas.ts`, porque aquele arquivo é do W-D2 e outros
 * agentes trabalham nele nesta mesma noite. Tudo aqui é derivado DETERMINÍSTICO do índice do lead
 * (`lead_id` termina no índice+1) — o mesmo lead tem a mesma cidade, a mesma audiometria e a mesma
 * próxima tarefa em todo reload, e os prints são reproduzíveis.
 *
 * `proximaTarefaDoLead` é o STUB do helper que o W-D5 vai expor em `lib/tarefas/` com a mesma
 * assinatura. Quando ele existir, o import em `app/(app)/funil/page.tsx` troca de módulo e este
 * stub morre. Enquanto isso, a fixture de tarefas daqui é a MESMA que `painelLeadEnsaio` devolve na
 * aba Tarefas do drawer — card e drawer não podem discordar sobre qual é a próxima.
 */

const H = 3_600_000;

/** Cidades da região onde a Me Escuta atende (a clínica é em Contagem). Ordem = frequência real. */
const CIDADES = ["Contagem", "Belo Horizonte", "Betim", "Ribeirão das Neves", "Ibirité", "Sabará", "Nova Lima", "Santa Luzia"];

function indiceDoLead(leadId: string): number {
  const n = Number(leadId.slice(-12));
  return Number.isNaN(n) ? 0 : Math.max(0, n - 1);
}

/** Cidade DECLARADA (ficha, slug `cidade`) — H5. Um em cada sete leads ainda não disse. */
export function cidadeDoLeadEnsaio(leadId: string): string | null {
  const i = indiceDoLead(leadId);
  if (i % 7 === 5) return null;
  return CIDADES[(i * 3) % CIDADES.length];
}

/**
 * Audiometria (card G4): quem está de "avaliação" para a frente já fez; em "qualificando" metade
 * mandou a foto do exame; lead novo ainda não respondeu (ficha sem o campo).
 */
export function audiometriaDoLeadEnsaio(lead: Pick<CardLead, "lead_id" | "etapa">): "fez" | "nao_fez" | null {
  const i = indiceDoLead(lead.lead_id);
  if (lead.etapa === "novo") return i % 4 === 0 ? "nao_fez" : null;
  if (lead.etapa === "qualificando") return i % 2 === 0 ? "fez" : "nao_fez";
  return "fez";
}

/** Departamento do lead: ganho e a carteira da fono são pós-venda; o resto é aquisição. */
export function departamentoDoLeadEnsaio(lead: Pick<CardLead, "etapa" | "responsavel">): "pre_venda" | "pos_venda" {
  if (lead.etapa === "ganho" || lead.responsavel?.tipo === "fono") return "pos_venda";
  return "pre_venda";
}

/**
 * As tarefas PENDENTES do lead na fixture. A distribuição é a que a Sara vive: uma parte vencida
 * (a régua do Kommo em ação — 97,9% das abertas lá estão vencidas), uma parte para hoje, uma parte
 * agendada, e um terço dos leads SEM tarefa nenhuma — o estado que o card passa a acusar.
 *
 * Mesmo molde de `painelLeadEnsaio` (id, responsável, tipo) para a aba Tarefas do drawer bater
 * com a linha do card.
 */
const TITULOS: Array<{ titulo: string; tipo: string; fazer: string; por_que: string }> = [
  { titulo: "Confirmar audiometria de quinta", tipo: "confirmar_consulta", fazer: "Mandar o lembrete e confirmar presença", por_que: "Ela confirmou quinta às 14h, e a clínica pede confirmação 24 h antes." },
  { titulo: "Retornar sobre a proposta", tipo: "follow_up", fazer: "Ligar e perguntar se a filha viu as parcelas", por_que: "Disse que a filha decide e que falaria com ela no fim de semana." },
  { titulo: "Pedir foto do exame", tipo: "coletar_exame", fazer: "Pedir a foto da audiometria pelo WhatsApp", por_que: "Sem o exame a fono não consegue indicar o modelo." },
  { titulo: "Agendar avaliação com a Ana Paula", tipo: "agendar", fazer: "Oferecer dois horários e marcar", por_que: "Topou fazer o teste de 7 dias." },
  { titulo: "Enviar contrato pela ClickSign", tipo: "contrato", fazer: "Gerar o contrato com as 12 parcelas e enviar", por_que: "Confirmou a proposta de 12x com a primeira parcela em outubro." },
  { titulo: "Ligar: 3 dias sem resposta", tipo: "follow_up", fazer: "Ligar no celular à tarde", por_que: "Última mensagem nossa ficou sem retorno há 3 dias." },
];

export function tarefasDoLeadEnsaio(lead: Pick<CardLead, "lead_id" | "etapa" | "tem_tarefa_pendente" | "responsavel">, agora: Date = new Date()): TarefaLead[] {
  const i = indiceDoLead(lead.lead_id);
  const t = agora.getTime();
  // lead fechado não tem próxima ação por definição; um terço dos abertos está largado
  if (lead.etapa === "ganho" || lead.etapa === "perdido") return [];
  if (i % 3 === 1) return [];
  const sara = PESSOAS.find((p) => p.chave === "sara")!;
  const fono = PESSOAS.find((p) => p.chave === "fono")!;
  const dono = lead.responsavel?.tipo === "fono" ? fono : sara;
  const molde = TITULOS[i % TITULOS.length];
  // prazo: i%4 → 0 vencida (ontem/anteontem) · 1 hoje · 2 amanhã · 3 semana que vem
  const prazo =
    i % 4 === 0
      ? new Date(t - (i % 2 === 0 ? 30 : 4) * H)
      : i % 4 === 1
        ? (() => { const d = new Date(t + 2 * H); d.setMinutes(0, 0, 0); return d; })()
        : i % 4 === 2
          ? (() => { const d = new Date(t + 24 * H); d.setHours(9, 0, 0, 0); return d; })()
          : (() => { const d = new Date(t + 6 * 24 * H); d.setHours(10, 30, 0, 0); return d; })();
  const principal: TarefaLead = {
    id: `t0000000-0000-4000-8000-${lead.lead_id.slice(-12)}`,
    titulo: molde.titulo,
    responsavel: dono.email,
    responsavel_id: dono.id,
    descricao: null,
    tipo: molde.tipo,
    prazo: prazo.toISOString(),
    status: "pendente",
    resultado: null,
    criado_em: new Date(t - 26 * H).toISOString(),
    concluida_em: null,
    por_que: molde.por_que,
    fazer: molde.fazer,
    trecho: null,
    origem: i % 2 === 0 ? "jarvis_conversa" : null,
  };
  // um em cada cinco tem uma segunda tarefa, mais tarde — para provar que a "próxima" é a mais cedo
  if (i % 5 === 0) {
    const segunda: TarefaLead = {
      ...principal,
      id: `t0000000-0000-4000-8001-${lead.lead_id.slice(-12)}`,
      titulo: "Enviar guia do teste em casa",
      tipo: "enviar_material",
      prazo: new Date(t + 9 * 24 * H).toISOString(),
      por_que: null,
      fazer: null,
      origem: null,
    };
    return [principal, segunda];
  }
  return [principal];
}

/**
 * STUB do helper do W-D5 (`lib/tarefas/proximaTarefaDoLead`). Mesma assinatura: recebe o id, devolve
 * a próxima pendente ou null. Só vale em ensaio — em produção a próxima vem da leitura do board
 * (`lerLeadsComTarefaPendente`, lib/dados/funil.ts).
 */
export function proximaTarefaDoLead(leadId: string, agora: Date = new Date()): ProximaTarefa | null {
  const lead = gerarLeadsEnsaio(agora).find((l) => l.lead_id === leadId);
  if (!lead) return null;
  const pendentes = tarefasDoLeadEnsaio(lead, agora)
    .filter((x) => x.status === "pendente")
    .sort((a, b) => (a.prazo ?? "9").localeCompare(b.prazo ?? "9"));
  const p = pendentes[0];
  return p ? { id: p.id, titulo: p.titulo, prazo: p.prazo, responsavel_id: p.responsavel_id, responsavel: p.responsavel } : null;
}

/** Os 40 cards da fixture com os campos que o card novo desenha. */
export function enriquecerCardsEnsaio(cards: CardLead[], agora: Date = new Date()): CardLead[] {
  return cards.map((c) => {
    const tarefas = tarefasDoLeadEnsaio(c, agora);
    const proxima = proximaTarefaDoLead(c.lead_id, agora);
    return {
      ...c,
      cidade: cidadeDoLeadEnsaio(c.lead_id),
      audiometria: audiometriaDoLeadEnsaio(c),
      departamento: departamentoDoLeadEnsaio(c),
      // `tem_tarefa_pendente` da fixture original era `i % 3 === 0`; a partir daqui a verdade é a
      // lista de tarefas — card e drawer bebem da mesma fonte
      tem_tarefa_pendente: tarefas.some((t) => t.status === "pendente"),
      proxima_tarefa: proxima,
      compromisso_em: proxima?.prazo && Date.parse(proxima.prazo) > agora.getTime() ? proxima.prazo : null,
    };
  });
}

/**
 * A FICHA do ensaio (v3): a config `ficha_lead` real tem o grupo Principal com `audiometria`
 * (seleção Não/Sim) — aqui ela ganha os campos que a fono pergunta em voz alta: para quem é, quem é
 * o paciente, percebe perda, já usou, cidade. Valores determinísticos pelo índice do lead.
 */
const GRUPOS_FICHA_ENSAIO: PainelLead["ficha"]["grupos"] = [
  {
    chave: "paciente",
    nome: "Paciente",
    campos: [
      { slug: "audiometria", nome: "Audiometria", tipo: "selecao", opcoes: ["Não", "Sim"], editavel: true },
      { slug: "audiometria_em", nome: "Feita em", tipo: "data", opcoes: [], editavel: true },
      { slug: "para_quem", nome: "Aparelho para", tipo: "selecao", opcoes: ["Para mim", "Familiar"], editavel: true },
      { slug: "paciente_nome", nome: "Quem é o paciente", tipo: "texto", opcoes: [], editavel: true },
      { slug: "percebe_perda", nome: "Percebe a perda", tipo: "booleano", opcoes: [], editavel: true },
      { slug: "ja_usou", nome: "Já usou aparelho", tipo: "booleano", opcoes: [], editavel: true },
      { slug: "cidade", nome: "Cidade", tipo: "texto", opcoes: [], editavel: true },
      { slug: "e_de_bh", nome: "Região de BH", tipo: "booleano", opcoes: [], editavel: true },
    ],
  },
  {
    chave: "comercial",
    nome: "Comercial",
    campos: [
      { slug: "como_conheceu", nome: "Como conheceu", tipo: "selecao", opcoes: ["Anúncio", "Indicação", "Busca no Google", "Já era paciente"], editavel: true },
      { slug: "faixa_valor", nome: "Faixa de valor", tipo: "selecao", opcoes: ["Até R$ 5 mil", "R$ 5-10 mil", "R$ 10-20 mil", "Acima de R$ 20 mil"], editavel: true },
      { slug: "observacoes", nome: "Observações", tipo: "texto_longo", opcoes: [], editavel: true },
      { slug: "kommo_id", nome: "Kommo", tipo: "texto", opcoes: [], editavel: false },
    ],
  },
];

/** O painel do drawer (ficha/tarefas/anotações/histórico), com as tarefas desta fixture. */
export function painelDoLeadEnsaio(lead: CardLead, agora: Date = new Date()): PainelLead {
  const base = painelLeadEnsaio(lead, agora);
  const i = indiceDoLead(lead.lead_id);
  const familiar = lead.tags?.includes("familiar decide") || /\(m[ãa]e:/i.test(lead.nome ?? "");
  const cidade = cidadeDoLeadEnsaio(lead.lead_id);
  const valores: Record<string, unknown> = {
    audiometria: lead.audiometria === "fez" ? "Sim" : lead.audiometria === "nao_fez" ? "Não" : null,
    audiometria_em: lead.audiometria === "fez" ? `2026-0${(i % 3) + 6}-${String((i % 27) + 1).padStart(2, "0")}` : null,
    para_quem: familiar ? "Familiar" : "Para mim",
    paciente_nome: familiar ? (lead.nome?.match(/m[ãa]e:\s*([^)]+)/i)?.[1] ?? "Mãe") : null,
    percebe_perda: i % 5 !== 3,
    ja_usou: lead.tags?.includes("já usou aparelho") ?? false,
    cidade: cidade,
    e_de_bh: cidade ? cidade !== "Nova Lima" : null,
    como_conheceu: lead.origem === "ind" ? "Indicação" : lead.origem === "meta" || lead.origem === "ig" ? "Anúncio" : i % 2 === 0 ? "Busca no Google" : null,
    faixa_valor: lead.valor == null ? null : lead.valor < 5000 ? "Até R$ 5 mil" : lead.valor < 10000 ? "R$ 5-10 mil" : lead.valor < 20000 ? "R$ 10-20 mil" : "Acima de R$ 20 mil",
    observacoes: i % 4 === 0 ? "Prefere contato à tarde. Filha decide." : null,
    kommo_id: lead.kommo_lead_id ?? null,
  };
  return {
    ...base,
    ficha: { grupos: GRUPOS_FICHA_ENSAIO, valores },
    tarefas: tarefasDoLeadEnsaio(lead, agora),
  };
}

export interface ConversaDoLead {
  conversaId: string;
  mensagens: Mensagem[];
  /** rótulo do número da empresa por onde a conversa corre — para o rodapé do fio */
  canal: string | null;
}

/** A conversa aberta do lead (a fixture tem uma por lead, para 15 dos 40). */
export function conversaDoLeadEnsaio(leadId: string, agora: Date = new Date()): ConversaDoLead | null {
  const { conversas, mensagens } = gerarConversasEnsaio(agora);
  const c = conversas.find((x) => x.lead_id === leadId);
  if (!c) return null;
  return { conversaId: c.id, mensagens: mensagens.get(c.id) ?? [], canal: c.numero_apelido ?? c.numero_e164 ?? null };
}

/** Tudo que o drawer precisa em ensaio, indexado por lead — calculado uma vez no servidor. */
export interface EnsaioFunil {
  paineis: Record<string, PainelLead>;
  conversas: Record<string, ConversaDoLead>;
}

export function ensaioDoFunil(cards: CardLead[], agora: Date = new Date()): EnsaioFunil {
  const paineis: Record<string, PainelLead> = {};
  const conversas: Record<string, ConversaDoLead> = {};
  const { conversas: lista, mensagens } = gerarConversasEnsaio(agora);
  for (const c of cards) {
    paineis[c.lead_id] = painelDoLeadEnsaio(c, agora);
    const conv = lista.find((x) => x.lead_id === c.lead_id);
    if (conv) conversas[c.lead_id] = { conversaId: conv.id, mensagens: mensagens.get(conv.id) ?? [], canal: conv.numero_apelido ?? conv.numero_e164 ?? null };
  }
  return { paineis, conversas };
}
