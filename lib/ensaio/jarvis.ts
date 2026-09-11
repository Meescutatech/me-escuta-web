import type { ObservacaoJarvis } from "@/components/jarvis/jarvis-diz";
import type { LinhaAutonomia } from "@/components/jarvis/regua-autonomia";
import type { Pessoa, PropostaJarvis } from "@/components/jarvis/tipos";

/**
 * FIXTURE DAS SUPERFÍCIES DO JARVIS (W-J, 10/09/2026) — modo ensaio, sem banco.
 *
 * Os ids de pessoa são os de `lib/ensaio/modo.ts` (Sara = …0001, Ana Paula = …0004, Rodolfo =
 * …0002) para o card casar com a sessão de ensaio. Os textos seguem o contrato do worker: FAZER
 * em imperativo com o nome, POR QUE com o tempo medido, TRECHO literal do paciente.
 */

export const RESPONSAVEIS_ENSAIO: Pessoa[] = [
  { id: "e0000000-0000-4000-8000-000000000001", nome: "Sara Oliveira" },
  { id: "e0000000-0000-4000-8000-000000000004", nome: "Ana Paula Ferreira" },
  { id: "e0000000-0000-4000-8000-000000000002", nome: "Rodolfo Andrade" },
];

const SARA = RESPONSAVEIS_ENSAIO[0];
const ANA = RESPONSAVEIS_ENSAIO[1];

function iso(agora: Date, minAtras: number): string {
  return new Date(agora.getTime() - minAtras * 60_000).toISOString();
}

/** Uma proposta por estado — o ciclo inteiro, para a galeria e para o fio da conversa. */
export function propostasInlineEnsaio(agora: Date): PropostaJarvis[] {
  return [
    {
      id: "s-0001",
      lead_id: "l-0001",
      lead_nome: "Maria Aparecida",
      conversa_id: "c-0001",
      fazer: "Ligar para Maria e confirmar a audiometria de sexta",
      por_que: "Maria perguntou o endereço da clínica há 3 h e ninguém respondeu. A audiometria é sexta às 9h e a clínica pede confirmação 24 h antes.",
      trecho: "Moça, qual o endereço mesmo? Meu filho vai me levar",
      trecho_mensagem_id: "m-0117",
      tipo: "confirmar_exame",
      prazo: "hoje",
      responsavel_id: SARA.id,
      responsavel_nome: "Sara",
      criado_em: iso(agora, 12),
      estado: "proposta",
    },
    {
      id: "s-0002",
      lead_id: "l-0002",
      lead_nome: "José Carlos",
      conversa_id: "c-0002",
      fazer: "Responder José sobre o teste do aparelho e propor dois horários",
      por_que: "José pediu para experimentar o aparelho há 5 h; a última mensagem nossa foi ontem.",
      trecho: "Dá pra testar antes de comprar?",
      trecho_mensagem_id: "m-0231",
      tipo: "acompanhar_follow_up",
      prazo: "hoje",
      responsavel_id: SARA.id,
      responsavel_nome: "Sara",
      criado_em: iso(agora, 95),
      estado: "aceita",
      decidido_por: "Sara",
      decidido_em: iso(agora, 88),
    },
    {
      id: "s-0003",
      lead_id: "l-0003",
      lead_nome: "Dona Neusa",
      conversa_id: "c-0003",
      fazer: "Ana Paula liga para Neusa e explica a regulagem",
      por_que: "Neusa disse que o aparelho está apitando há 2 dias e mandou dois áudios sem resposta.",
      trecho: "Tá apitando de novo, não sei se é a pilha",
      trecho_mensagem_id: "m-0402",
      tipo: "ligar_lead",
      prazo: "hoje",
      responsavel_id: ANA.id,
      responsavel_nome: "Ana Paula",
      criado_em: iso(agora, 240),
      estado: "ajustada",
      decidido_por: "Sara",
      decidido_em: iso(agora, 225),
      original: { fazer: "Responder Neusa e pedir foto do aparelho", prazo: "amanha", responsavel_nome: "Sara" },
    },
    {
      id: "s-0004",
      lead_id: "l-0004",
      lead_nome: "Antônio Ferreira",
      conversa_id: "c-0004",
      fazer: "Cobrar de Antônio o comprovante do Pix",
      por_que: "Antônio disse que pagou há 26 h e o Asaas não registrou a entrada.",
      trecho: "Já fiz o pix ontem à noite",
      trecho_mensagem_id: "m-0510",
      tipo: "confirmar_pagamento",
      prazo: "hoje",
      responsavel_id: SARA.id,
      responsavel_nome: "Sara",
      criado_em: iso(agora, 400),
      estado: "descartada",
      decidido_por: "Rodolfo",
      decidido_em: iso(agora, 380),
      motivo_descarte: "ja_resolvido",
      observacao_descarte: "caiu às 8h, o Asaas atrasou",
    },
    {
      id: "s-0005",
      lead_id: "l-0005",
      lead_nome: "Sebastiana Lima",
      conversa_id: "c-0005",
      fazer: "Reenviar para Sebastiana o horário da consulta com a fono",
      por_que: "Sebastiana confirmou a consulta de quinta há 2 dias, mas perguntou o horário de novo hoje cedo.",
      trecho: "Que horas era mesmo a consulta?",
      trecho_mensagem_id: "m-0688",
      tipo: "confirmar_exame",
      prazo: "hoje",
      responsavel_id: SARA.id,
      responsavel_nome: "Sara",
      criado_em: iso(agora, 520),
      estado: "feita",
      decidido_por: "Sara",
      decidido_em: iso(agora, 500),
      feita_por: "Sara",
      feita_em: iso(agora, 470),
    },
  ];
}

/** Propostas pendentes para o topo de /tarefas — as três esperando alguém. */
export function propostasTarefaEnsaio(agora: Date): PropostaJarvis[] {
  const base = propostasInlineEnsaio(agora)[0];
  return [
    base,
    {
      id: "s-0011",
      lead_id: "l-0011",
      lead_nome: "Geraldo Nunes",
      conversa_id: "c-0011",
      fazer: "Mandar para Geraldo o laudo da audiometria em PDF",
      por_que: "Geraldo pediu o laudo para o convênio há 1 dia; o exame foi feito segunda e o arquivo está no portal.",
      trecho: "Preciso do laudo pro convênio, consegue me mandar?",
      tipo: "enviar_documento",
      prazo: "amanha",
      responsavel_id: ANA.id,
      responsavel_nome: "Ana Paula",
      criado_em: iso(agora, 60),
      estado: "proposta",
    },
    {
      id: "s-0012",
      lead_id: "l-0012",
      lead_nome: "Terezinha Souza",
      conversa_id: "c-0012",
      fazer: "Retomar contato com Terezinha e oferecer dois horários de audiometria",
      por_que: "Terezinha está em Qualificado há 6 dias sem mensagem nova; o SLA da etapa é 24 h.",
      trecho: "Vou ver com minha filha e te falo",
      tipo: "acompanhar_follow_up",
      prazo: "esta_semana",
      responsavel_id: SARA.id,
      responsavel_nome: "Sara",
      criado_em: iso(agora, 180),
      estado: "proposta",
    },
  ];
}

export function jarvisDizEnsaio(agora: Date): {
  frase: string;
  observacoes: ObservacaoJarvis[];
  perguntas: string[];
  geradoEm: string;
} {
  return {
    frase: "Quatro conversas estão sem resposta há mais de 2 h, e três audiometrias precisam de confirmação até amanhã.",
    observacoes: [
      { texto: "4 conversas sem resposta nossa há mais de 2 h — a mais antiga é a de Maria Aparecida (3 h)", href: "/conversas?filtro=sem_resposta", destino: "conversas", origem: "consultar_conversa", faixa: "AGORA" },
      { texto: "3 audiometrias marcadas para amanhã ainda sem confirmação do paciente", href: "/tarefas?tipo=confirmar_exame", destino: "tarefas", origem: "consultar_tarefas", faixa: "HOJE" },
      { texto: "Terezinha Souza e mais 2 leads parados em Qualificado há mais de 5 dias", href: "/funil?etapa=qualificado", destino: "funil", origem: "consultar_funil", faixa: "NA SEMANA" },
    ],
    perguntas: ["Quem está parado há mais tempo em Qualificado?", "Quantas tarefas vencem hoje, por pessoa?", "Quantos leads chegaram esta semana, por origem?"],
    geradoEm: iso(agora, 7),
  };
}

/** A régua do Jarvis — catálogo da 0161/0165 com o nível que o Jarvis tem hoje (0297: só criar_tarefa=auto). */
export function reguaJarvisEnsaio(): LinhaAutonomia[] {
  return [
    {
      chave: "criar_tarefa",
      rotulo: "Criar tarefa",
      descricao: "Abre tarefa para a equipe a partir da conversa, com o motivo e o trecho citado.",
      nivel: "auto",
      teto: "auto",
      fundamento: "A tarefa é o protocolo de handoff da operação (observado 17/08). Pede atenção humana, não a substitui.",
      alteradaPor: "Diogo · 01/09",
    },
    {
      chave: "responder_roteiro",
      rotulo: "Responder o paciente",
      descricao: "Sugere a resposta no fio para alguém enviar — nunca fala com o paciente sozinho.",
      nivel: "propor",
      teto: "auto",
      fundamento: "RF-A2: responder o roteiro é o ato de qualificar. O teto permite `auto`; a operação escolheu propor.",
    },
    {
      chave: "mover_etapa",
      rotulo: "Mover de etapa no funil",
      descricao: "Propõe mover o lead quando a conversa mostra que a etapa mudou.",
      nivel: "propor",
      teto: "auto",
      fundamento: "Movimento de funil é reversível e já validado na porta (D9). O teto permite `auto`; a operação escolheu propor.",
    },
    {
      chave: "agendar_followup",
      rotulo: "Agendar retorno",
      descricao: "Marca um lembrete de retorno quando o paciente pede para falar depois.",
      nivel: "propor",
      teto: "auto",
      fundamento: "Agendar só enfileira; o disparo re-decide tudo fresco e o envio passa por responder.",
    },
    {
      chave: "prometer_prazo",
      rotulo: "Prometer prazo ao paciente",
      descricao: "Comprometer a empresa com uma data — entrega, retorno, consulta.",
      nivel: "propor",
      teto: "propor",
      fundamento: "Compromisso com data vincula a empresa. O teto constitucional é propor; ninguém sobe para auto.",
    },
    {
      chave: "falar_preco",
      rotulo: "Falar de preço",
      descricao: "Valor do aparelho, parcela, desconto.",
      nivel: "proibido",
      teto: "propor",
      fundamento: "Art. III.3 e D8: preço nunca por agente. Quem fala de preço é a fono, depois da audiometria.",
      travada: true,
    },
    {
      chave: "negociar",
      rotulo: "Negociar condição",
      descricao: "Condição de pagamento, desconto, troca.",
      nivel: "proibido",
      teto: "propor",
      fundamento: "Art. III.3 e D8: condição e desconto são da fono, que é quem negocia na operação real.",
      travada: true,
    },
    {
      chave: "recomendar_credito",
      rotulo: "Recomendar crédito",
      descricao: "Análise de crédito e modalidade de venda.",
      nivel: "proibido",
      teto: "propor",
      fundamento: "Art. III.3: crédito é área do Levindo, com validação humana sempre.",
      travada: true,
    },
    {
      chave: "conduta_clinica",
      rotulo: "Conduta clínica",
      descricao: "Qualquer orientação sobre audição, aparelho ou saúde.",
      nivel: "proibido",
      teto: "propor",
      fundamento: "Art. III.3: quem avalia é a audiometria e a fonoaudióloga. Risco alto — público idoso.",
      travada: true,
    },
  ];
}
