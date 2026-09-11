import type { Molde } from "./tarefas-ensaio";
import type { PropostaTarefaPendente } from "@/lib/tarefas/propostas";

/**
 * FIXTURE DO DIA (W-D5, 10/09) — o que a view "Hoje", a prioridade, as propostas do Jarvis e o
 * "Próxima tarefa" do card do funil precisam ver. Arquivo próprio para não mexer no desenho dos
 * 11 moldes originais (lib/dados/tarefas-ensaio.ts), que outras telas já fotografaram.
 *
 * `leadIdx` é o ÍNDICE do lead na fixture do funil (lib/ensaio/fixtures/conversas.ts,
 * `MOLDES_LEADS`): `lead_id = 1ead0000-0000-4000-8000-<idx+1>`. É esse elo que faz o card do
 * funil dizer "Próxima tarefa: …" para o MESMO paciente que aparece aqui — e é ele que
 * `proximaTarefaDoLead()` (lib/tarefas/proxima.ts) lê para o W-D6.
 *
 * Prazos em HORAS relativas a `agora`, como os moldes originais: "hoje" = poucas horas à frente,
 * "vencida" = negativo. Determinística dentro do minuto; entre 22h e 0h um "hoje" pode virar
 * "amanhã" — a fixture é honesta com o relógio, não com o print.
 */

/** 1 = Sara · 2 = Rodolfo · 3 = Ana Paula (índices de RESPONSAVEIS em tarefas-ensaio.ts) */
export const MOLDES_DIA: Molde[] = [
  {
    titulo: "Mandar o endereço da clínica para a Cleusa",
    tipo: "confirmar_exame",
    lead: "Cleusa Martins",
    leadIdx: 23,
    prazoHoras: -9,
    prioridade: "alta",
    resp: 0,
    jarvis: {
      por_que: "Avaliação amanhã às 9h e ela perguntou “onde fica?” ontem à noite — a pergunta está sem resposta.",
      fazer: "Enviar o endereço e o mapa da AudioBH e confirmar o horário",
      trecho: "onde fica a clínica? é perto do centro?",
    },
  },
  {
    titulo: "Ligar para o Manoel sobre a análise de crédito",
    tipo: "validar_serasa",
    lead: "Manoel Dias",
    leadIdx: 30,
    prazoHoras: 0.5,
    prioridade: "alta",
    resp: 0,
  },
  {
    titulo: "Responder ao Expedito sobre o recarregável",
    tipo: "acompanhar_follow_up",
    lead: "Expedito Araújo",
    leadIdx: 28,
    prazoHoras: 0.75,
    prioridade: "media",
    resp: 0,
    jarvis: {
      por_que: "Ele pediu a diferença de preço entre pilha e recarregável há 5 h; proposta de R$ 21.000 parada em Proposta há 18 h.",
      fazer: "Responder com a diferença de preço e oferecer o teste com o recarregável",
      trecho: "o recarregável compensa? quanto fica a mais?",
    },
  },
  {
    titulo: "Reagendar a audiometria da Elza",
    tipo: "confirmar_exame",
    lead: "Elza Moreira",
    leadIdx: 19,
    prazoHoras: 1,
    prioridade: "baixa",
    resp: 0,
  },
  {
    titulo: "Confirmar pagamento da entrada — Iolanda",
    tipo: "confirmar_pagamento",
    lead: "Iolanda Freitas",
    leadIdx: 29,
    prazoHoras: 40,
    prioridade: "alta",
    resp: 0,
  },
  {
    titulo: "Enviar proposta dos dois aparelhos — Jorge",
    tipo: "acompanhar_follow_up",
    lead: "Jorge Nascimento",
    leadIdx: 24,
    prazoHoras: 3,
    prioridade: "alta",
    resp: 1,
  },
  {
    titulo: "Retorno de 30 dias — Terezinha",
    tipo: "pos_venda",
    lead: "Terezinha Alves",
    leadIdx: 10,
    prazoHoras: 100,
    prioridade: "baixa",
    resp: 2,
  },
  {
    titulo: "Ajuste fino do aparelho da Rosângela",
    tipo: "assistencia_tecnica",
    lead: "Rosângela Pinto",
    leadIdx: 31,
    prazoHoras: -20,
    prioridade: "media",
    resp: 2,
  },
];

/**
 * Propostas do Jarvis ESPERANDO ALGUÉM — `core.sugestao_ia` pendente, tipo tarefa. Duas para a
 * Sara (a fila dela mostra), uma para o Rodolfo (só "Do time" mostra). Todas com POR QUE AGORA
 * medido e trecho citado, como o contrato da 0298 exige.
 */
export function propostasDeEnsaio(agora: Date = new Date()): PropostaTarefaPendente[] {
  const base = agora.getTime();
  const iso = (h: number) => new Date(base + h * 3_600_000).toISOString();
  const lead = (idx: number) => `1ead0000-0000-4000-8000-${String(idx + 1).padStart(12, "0")}`;
  return [
    {
      id: "5u9e5740-0000-4000-8000-000000000001",
      lead_id: lead(22),
      lead_nome: "Arlindo Fonseca",
      fazer: "Responder com a faixa de preço e propor a avaliação gratuita",
      por_que: "Arlindo mandou um áudio há 3 h perguntando o preço e ficou sem resposta. Está em Qualificando há 7 h — lead de WhatsApp que pergunta preço cedo costuma fechar na primeira semana.",
      trecho: "quanto fica mais ou menos o aparelho?",
      tipo: "acompanhar_follow_up",
      prioridade: "alta",
      prazo_sugerido: iso(2),
      responsavel_sugerido_id: "e0000000-0000-4000-8000-000000000001",
      criado_em: iso(-0.4),
    },
    {
      id: "5u9e5740-0000-4000-8000-000000000002",
      lead_id: lead(20),
      lead_nome: "Nelson Batista",
      fazer: "Ligar para o Nelson e oferecer o teste de 7 dias com o modelo recarregável",
      por_que: "Já usou aparelho e parou de responder há 4 dias em Qualificando. Quem já usou e reclama de microfonia fecha em uma ligação, não por texto.",
      trecho: "o meu antigo dava muita microfonia",
      tipo: "acompanhar_follow_up",
      prioridade: "media",
      prazo_sugerido: iso(26),
      responsavel_sugerido_id: "e0000000-0000-4000-8000-000000000001",
      criado_em: iso(-3),
    },
    {
      id: "5u9e5740-0000-4000-8000-000000000003",
      lead_id: lead(27),
      lead_nome: "Wilma Siqueira",
      fazer: "Rever a proposta da Wilma e oferecer a entrada menor com 12 parcelas",
      por_que: "Proposta de R$ 9.400 parada há 5 dias sem resposta; ela disse que a entrada pesou. É o padrão de quem fecha quando a entrada cai.",
      trecho: "a entrada ficou pesada pra mim esse mês",
      tipo: "acompanhar_follow_up",
      prioridade: "media",
      prazo_sugerido: iso(4),
      responsavel_sugerido_id: "e0000000-0000-4000-8000-000000000002",
      criado_em: iso(-1),
    },
  ];
}
