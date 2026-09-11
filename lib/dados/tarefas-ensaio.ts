import type { EventoTarefa, TarefaVisao } from "./tarefas-visao-calculos";
import type { DadosVisaoTarefas } from "./tarefas-visao";
import { MOLDES_DIA } from "./tarefas-ensaio-dia";

/**
 * FIXTURE DE ENSAIO de /tarefas — só com `NEXT_PUBLIC_TAREFAS_ENSAIO=1`, NUNCA por padrão.
 * Mesmo papel da fixture do marketing (lib/dados/marketing-ensaio.ts): dar à tela todos os
 * ESTADOS que o design precisa ver — vencida, hoje, amanhã, semana, sem prazo, em andamento,
 * concluída com resultado, arquivada com motivo, criada pelo Jarvis com POR QUE + trecho —
 * sem escrever uma linha em banco nenhum (o ledger é append-only; mock lá é proibido).
 *
 * Determinística de propósito: prazos derivam de `agora`, nomes são fixos. Duas aberturas da
 * tela no mesmo minuto desenham o mesmo quadro — design se compara com design, não com sorte.
 */

export function ensaioTarefasLigado(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEXT_PUBLIC_TAREFAS_ENSAIO === "1";
}

const RESPONSAVEIS = [
  { id: "e0000000-0000-4000-8000-000000000001", nome: "sarah@meescuta.com" },
  { id: "e0000000-0000-4000-8000-000000000002", nome: "rodolfo@meescuta.com" },
  // W-D5: a fono da fixture de ensaio (lib/ensaio/modo.ts) — tarefas de pós-venda e ajuste
  { id: "e0000000-0000-4000-8000-000000000004", nome: "anapaula@meescuta.com" },
] as const;

export interface Molde {
  titulo: string;
  /**
   * lead REAL de produção + instante no meio do fio dele. Só nos três primeiros moldes, e só
   * para o ensaio conseguir demonstrar o elo tarefa → conversa ancorada (31/08): com lead
   * sintético o clique cai, corretamente, em "esta conversa não está na caixa de entrada".
   */
  leadReal?: string;
  ancora?: string;
  /** chave de `TIPOS_TAREFA_SEMENTE` (lib/tarefa-tipos.ts) — a tela mostra o rótulo; null = sem tipo */
  tipo: string | null;
  lead: string | null;
  prazoHoras: number | null; // relativo a agora; negativo = vencida
  status?: "concluida" | "arquivada";
  resultado?: string;
  motivo_arquivo?: string;
  jarvis?: { por_que: string; fazer: string; trecho: string };
  andamento?: boolean;
  resp?: 0 | 1 | 2;
  /** W-D5 · benchmark item 4 — ainda não existe no banco; a fixture é quem tem. */
  prioridade?: "alta" | "media" | "baixa";
  /**
   * W-D5 · índice do lead na fixture do FUNIL (`MOLDES_LEADS` em lib/ensaio/fixtures/conversas.ts).
   * Sem ele o `lead_id` sai do índice do molde — que coincide com o funil só por acaso nos moldes
   * 4-7. Com ele, o card do funil e a fila da SDR falam do mesmo paciente.
   */
  leadIdx?: number;
  /** v3 · o que já aconteceu com ela (além de "criada", que é automático): `ha` = horas atrás */
  historico?: { ha: number; tipo: EventoTarefa["tipo"]; texto: string }[];
}

const MOLDES: Molde[] = [
  {
    titulo: "Ligar para agendar a audiometria",
    tipo: "acompanhar_follow_up",
    lead: "Maria Aparecida Souza",
    leadReal: "3594fd74-1fbf-55e0-ab03-affedf0f55ef",
    leadIdx: 0,
    ancora: "2026-07-17T19:48:53.466Z",
    prazoHoras: -30,
    prioridade: "alta",
    resp: 0,
    jarvis: {
      por_que: "Ela disse que decide depois do exame e ninguém agendou — 3 dias parada em Qualificado.",
      fazer: "Ligar e oferecer dois horários de audiometria nesta semana",
      trecho: "vou ver certinho depois do exame aí te falo",
    },
  },
  { titulo: "Cobrar retorno da simulação da Caixa", tipo: "confirmar_pagamento", lead: "José Carlos Menezes", leadReal: "70ba301b-eeb6-5bdf-b44e-b10d82829a7c", leadIdx: 1, ancora: "2026-07-17T10:53:21.620Z", prazoHoras: -4, resp: 0, andamento: true, historico: [{ ha: 52, tipo: "adiada", texto: "adiada em 3 dias — esperando a simulação da Caixa" }, { ha: 28, tipo: "adiada", texto: "adiada para hoje — gerente da Caixa só responde na quinta" }] },
  {
    titulo: "Responder dúvida sobre o teste em casa",
    tipo: "acompanhar_follow_up",
    lead: "Antônia Ribeiro Prado",
    leadReal: "6317dc62-35ef-5fcd-be41-dfae57425a74",
    leadIdx: 2,
    ancora: "2026-07-20T17:48:35.447Z",
    prazoHoras: 2,
    resp: 0,
    jarvis: {
      por_que: "Perguntou ontem à noite como funciona o teste e a conversa está sem resposta nossa há 14 h.",
      fazer: "Explicar o teste de 7 dias e propor a teleconsulta",
      trecho: "e se eu não me adaptar com o aparelho?",
    },
  },
  { titulo: "Confirmar presença na teleconsulta de amanhã", tipo: "confirmar_consulta", lead: "Waldemar Costa Filho", leadIdx: 3, prazoHoras: 26, resp: 1, prioridade: "media" },
  { titulo: "Enviar orientação de uso por áudio", tipo: "pos_venda", lead: "Neusa Maria Braga", leadIdx: 4, prazoHoras: 30, resp: 0, andamento: true, prioridade: "baixa" },
  { titulo: "Verificar rastreio do aparelho enviado", tipo: "logistica_expedicao", lead: "Geraldo Nunes", leadIdx: 5, prazoHoras: 75, resp: 1, prioridade: "media" },
  { titulo: "Retomar lead que pediu contato em setembro", tipo: "acompanhar_follow_up", lead: "Irene Salgado", leadIdx: 6, prazoHoras: 120, resp: 0, prioridade: "baixa" },
  { titulo: "Organizar lista de leads sem dono do funil", tipo: null, lead: null, prazoHoras: null, resp: 1, prioridade: "baixa" },
  {
    titulo: "Agendar audiometria na clínica parceira",
    tipo: "confirmar_exame",
    lead: "Sebastião Moreira Lima",
    prazoHoras: -50,
    status: "concluida",
    resultado: "Agendada para quinta 14h na AudioBH; paciente confirmou por áudio.",
    resp: 0,
  },
  {
    titulo: "Ligar no segundo número do cadastro",
    tipo: "acompanhar_follow_up",
    lead: "Marlene Santos Furtado",
    prazoHoras: -80,
    status: "concluida",
    resultado: "Atendeu; prefere WhatsApp. Conversa retomada.",
    resp: 0,
  },
  {
    titulo: "Cobrar boleto vencido da entrada",
    tipo: "confirmar_pagamento",
    lead: "Osvaldo Pinto",
    prazoHoras: -200,
    status: "arquivada",
    motivo_arquivo: "Paciente renegociou direto com o financeiro — cobrança sai da fila da Sarah.",
    resp: 1,
  },
];

/** `lead_id` da fixture do funil pelo índice do lead lá (`MOLDES_LEADS`). */
export function leadIdDeEnsaio(idx: number): string {
  return `1ead0000-0000-4000-8000-${String(idx + 1).padStart(12, "0")}`;
}

/** as 15 primeiras leads da fixture do funil têm conversa (`c0nv0000-…-<idx+1>`, lib/ensaio/fixtures/conversas.ts) */
export function conversaIdDeEnsaio(idx: number): string | null {
  return idx <= 14 ? `c0nv0000-0000-4000-8000-${String(idx + 1).padStart(12, "0")}` : null;
}

function leadIdDoMolde(m: Molde, i: number, leadsDoFunil: boolean): string | null {
  if (!m.lead) return null;
  if (leadsDoFunil && m.leadIdx != null) return leadIdDeEnsaio(m.leadIdx);
  if (m.leadReal) return m.leadReal;
  return leadIdDeEnsaio(m.leadIdx ?? i);
}

/**
 * `leadsDoFunil` (W-D5): no modo ensaio sem banco (W-D2, `lerSessaoEnsaio`) o lead REAL não
 * existe em lugar nenhum — a conversa que existe é a da fixture do funil, e é para ela que o
 * clique tem de levar. Com a flag, `leadIdx` vence `leadReal`. Sem ela (fixture sobre o banco
 * real, `NEXT_PUBLIC_TAREFAS_ENSAIO`), o lead real continua valendo para o elo de 31/08.
 */
export function visaoTarefasDeEnsaio(
  agora: Date = new Date(),
  { leadsDoFunil = false }: { leadsDoFunil?: boolean } = {},
): DadosVisaoTarefas & { emAndamento: string[] } {
  const base = agora.getTime();
  const iso = (h: number) => new Date(base + h * 3_600_000).toISOString();
  const emAndamento: string[] = [];
  // W-D5: os moldes do dia (tarefas-ensaio-dia.ts) entram DEPOIS dos originais — ids 12+, e os
  // ids 1-11 continuam os mesmos que as outras telas já linkam (`/tarefas#tarefa-<id>`).
  const tarefas: TarefaVisao[] = [...MOLDES, ...MOLDES_DIA].map((m, i) => {
    const id = `en5a10-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    const r = RESPONSAVEIS[m.resp ?? 0];
    const status = m.status ?? "pendente";
    if (m.andamento && status === "pendente") emAndamento.push(id);
    const criadoEm = m.ancora ?? iso((m.prazoHoras ?? 0) - 48);
    const quem = r.nome.split("@")[0];
    const historico: EventoTarefa[] = [
      { quando: criadoEm, tipo: "criada", texto: m.jarvis ? "criada pelo Jarvis a partir da conversa" : `criada por ${quem}` },
      ...(m.historico ?? []).map((h) => ({ quando: iso(-h.ha), tipo: h.tipo, texto: h.texto })),
      ...(m.andamento && status === "pendente" ? [{ quando: iso(-1.5), tipo: "iniciada" as const, texto: `${quem} pegou a tarefa` }] : []),
      ...(status === "concluida" ? [{ quando: iso((m.prazoHoras ?? 0) + 1), tipo: "concluida" as const, texto: `concluída por ${quem}` }] : []),
      ...(status === "arquivada" ? [{ quando: iso((m.prazoHoras ?? 0) + 1), tipo: "arquivada" as const, texto: `arquivada por ${quem}` }] : []),
    ];
    return {
      id,
      lead_id: leadIdDoMolde(m, i, leadsDoFunil),
      conversa_id: leadsDoFunil && m.leadIdx != null ? conversaIdDeEnsaio(m.leadIdx) : null,
      historico,
      lead_nome: m.lead,
      titulo: m.titulo,
      descricao: null,
      tipo: m.tipo,
      responsavel: r.nome,
      responsavel_id: r.id,
      prazo: m.prazoHoras == null ? null : iso(m.prazoHoras),
      status,
      resultado: m.resultado ?? null,
      motivo_arquivo: m.motivo_arquivo ?? null,
      criado_em: criadoEm,
      concluida_em: status === "pendente" ? null : iso((m.prazoHoras ?? 0) + 1),
      vencida: status === "pendente" && m.prazoHoras != null && m.prazoHoras < 0,
      por_que: m.jarvis?.por_que ?? null,
      fazer: m.jarvis?.fazer ?? null,
      trecho: m.jarvis?.trecho ?? null,
      origem: m.jarvis ? "jarvis_conversa" : null,
      prioridade: m.prioridade ?? null,
    };
  });
  return { tarefas, corte: false, derivadaNoBanco: true, emAndamento };
}
