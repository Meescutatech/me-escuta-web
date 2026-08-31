import type { TarefaVisao } from "./tarefas-visao-calculos";
import type { DadosVisaoTarefas } from "./tarefas-visao";

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
  { id: "e0000000-0000-4000-8000-000000000002", nome: "diogo@meescuta.com" },
] as const;

interface Molde {
  titulo: string;
  tipo: string;
  lead: string | null;
  prazoHoras: number | null; // relativo a agora; negativo = vencida
  status?: "concluida" | "arquivada";
  resultado?: string;
  motivo_arquivo?: string;
  jarvis?: { por_que: string; fazer: string; trecho: string };
  andamento?: boolean;
  resp?: 0 | 1;
}

const MOLDES: Molde[] = [
  {
    titulo: "Ligar para agendar a audiometria",
    tipo: "ligar",
    lead: "Maria Aparecida Souza",
    prazoHoras: -30,
    resp: 0,
    jarvis: {
      por_que: "Ela disse que decide depois do exame e ninguém agendou — 3 dias parada em Qualificado.",
      fazer: "Ligar e oferecer dois horários de audiometria nesta semana",
      trecho: "vou ver certinho depois do exame aí te falo",
    },
  },
  { titulo: "Cobrar retorno da simulação da Caixa", tipo: "cobranca", lead: "José Carlos Menezes", prazoHoras: -4, resp: 0, andamento: true },
  {
    titulo: "Responder dúvida sobre o teste em casa",
    tipo: "followup",
    lead: "Antônia Ribeiro Prado",
    prazoHoras: 2,
    resp: 0,
    jarvis: {
      por_que: "Perguntou ontem à noite como funciona o teste e a conversa está sem resposta nossa há 14 h.",
      fazer: "Explicar o teste de 7 dias e propor a teleconsulta",
      trecho: "e se eu não me adaptar com o aparelho?",
    },
  },
  { titulo: "Confirmar presença na teleconsulta de amanhã", tipo: "confirmar", lead: "Waldemar Costa Filho", prazoHoras: 26, resp: 1 },
  { titulo: "Enviar orientação de uso por áudio", tipo: "followup", lead: "Neusa Maria Braga", prazoHoras: 30, resp: 0, andamento: true },
  { titulo: "Verificar rastreio do aparelho enviado", tipo: "logistica_expedicao", lead: "Geraldo Nunes", prazoHoras: 75, resp: 1 },
  { titulo: "Retomar lead que pediu contato em setembro", tipo: "followup", lead: "Irene Salgado", prazoHoras: 120, resp: 0 },
  { titulo: "Organizar lista de leads sem dono do funil", tipo: "interno", lead: null, prazoHoras: null, resp: 1 },
  {
    titulo: "Agendar audiometria na clínica parceira",
    tipo: "agendar",
    lead: "Sebastião Moreira Lima",
    prazoHoras: -50,
    status: "concluida",
    resultado: "Agendada para quinta 14h na AudioBH; paciente confirmou por áudio.",
    resp: 0,
  },
  {
    titulo: "Ligar no segundo número do cadastro",
    tipo: "ligar",
    lead: "Marlene Santos Furtado",
    prazoHoras: -80,
    status: "concluida",
    resultado: "Atendeu; prefere WhatsApp. Conversa retomada.",
    resp: 0,
  },
  {
    titulo: "Cobrar boleto vencido da entrada",
    tipo: "cobranca",
    lead: "Osvaldo Pinto",
    prazoHoras: -200,
    status: "arquivada",
    motivo_arquivo: "Paciente renegociou direto com o financeiro — cobrança sai da fila da Sarah.",
    resp: 1,
  },
];

export function visaoTarefasDeEnsaio(agora: Date = new Date()): DadosVisaoTarefas & { emAndamento: string[] } {
  const base = agora.getTime();
  const iso = (h: number) => new Date(base + h * 3_600_000).toISOString();
  const emAndamento: string[] = [];
  const tarefas: TarefaVisao[] = MOLDES.map((m, i) => {
    const id = `en5a10-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    const r = RESPONSAVEIS[m.resp ?? 0];
    const status = m.status ?? "pendente";
    if (m.andamento && status === "pendente") emAndamento.push(id);
    return {
      id,
      lead_id: m.lead ? `1ead0000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` : null,
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
      criado_em: iso((m.prazoHoras ?? 0) - 48),
      concluida_em: status === "pendente" ? null : iso((m.prazoHoras ?? 0) + 1),
      vencida: status === "pendente" && m.prazoHoras != null && m.prazoHoras < 0,
      por_que: m.jarvis?.por_que ?? null,
      fazer: m.jarvis?.fazer ?? null,
      trecho: m.jarvis?.trecho ?? null,
      origem: m.jarvis ? "jarvis_conversa" : null,
    };
  });
  return { tarefas, corte: false, derivadaNoBanco: true, emAndamento };
}
