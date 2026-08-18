import type { CardLead } from "@/lib/dados/funil";

/**
 * FIXTURES da página /prototipo. Nome, telefone e conversa são INVENTADOS — nada aqui sai do
 * banco de produção, e é assim de propósito: a vitrine do workshop não precisa de dado de
 * paciente para provar o desenho, e usar um exporia gente real numa tela de teste.
 *
 * Os prazos são relativos ao `agora` que a página calcula, para o card "estourado" continuar
 * estourado amanhã.
 */

const DIA = 86_400_000;
const HORA = 3_600_000;

function iso(agora: number, deltaMs: number): string {
  return new Date(agora - deltaMs).toISOString();
}

function base(id: string): Pick<CardLead, "lead_id" | "idade" | "dono_id" | "dono_nome" | "tags" | "proposta" | "tem_tarefa_pendente" | "kommo_lead_id"> {
  return {
    lead_id: id,
    idade: null,
    dono_id: null,
    dono_nome: null,
    tags: [],
    proposta: null,
    tem_tarefa_pendente: true,
    kommo_lead_id: null,
  };
}

/** Seis cards cobrindo as três faixas de prazo e os dois lados da última mensagem. */
export function cardsExemplo(agora: number): CardLead[] {
  return [
    {
      ...base("p1"),
      nome: "Antônio Ribeiro",
      telefone: "5531998810022",
      etapa: "qualificando",
      entrou_etapa_em: iso(agora, 9 * DIA),
      valor: 8400,
      origem: "meta",
      responsavel: { tipo: "sara", nome: "Sarah" },
      ultima_mensagem: { texto: "Vou ver com minha filha e te falo", em: iso(agora, 9 * DIA), de: "cliente" },
    },
    {
      ...base("p2"),
      nome: "Maria de Lourdes Campos",
      telefone: "5531991224455",
      etapa: "qualificando",
      entrou_etapa_em: iso(agora, 6 * DIA),
      valor: null,
      origem: "wa",
      responsavel: { tipo: "sara", nome: "Sarah" },
      ultima_mensagem: { texto: "Bom dia! Consegue me mandar o endereço?", em: iso(agora, 5 * DIA - 2 * HORA), de: "cliente" },
    },
    {
      ...base("p3"),
      nome: null,
      telefone: "5531987443311",
      etapa: "qualificando",
      entrou_etapa_em: iso(agora, 3 * DIA - 4 * HORA),
      valor: null,
      origem: "meta",
      responsavel: null,
      ultima_mensagem: { texto: "Te mandei os horários de terça, fico no aguardo", em: iso(agora, 2 * DIA), de: "nos" },
    },
    {
      ...base("p4"),
      nome: "José Carlos Pinto",
      telefone: "5531996002211",
      etapa: "qualificando",
      entrou_etapa_em: iso(agora, 30 * HORA),
      valor: 12900,
      origem: "ind",
      responsavel: { tipo: "fono", nome: "Fono Camila" },
      ultima_mensagem: { texto: "Perfeito, pode ser quinta de manhã", em: iso(agora, 26 * HORA), de: "cliente" },
    },
    {
      ...base("p5"),
      nome: "Terezinha Alves",
      telefone: "5531994778866",
      etapa: "qualificando",
      entrou_etapa_em: iso(agora, 5 * HORA),
      valor: null,
      origem: "wa",
      responsavel: { tipo: "dm", nome: "Clara" },
      ultima_mensagem: { texto: "Oi, vi o anúncio de vocês sobre aparelho auditivo", em: iso(agora, 4 * HORA), de: "cliente" },
    },
    {
      ...base("p6"),
      nome: "Wilson Batista de Souza",
      telefone: "5531993330077",
      etapa: "qualificando",
      entrou_etapa_em: iso(agora, 4 * DIA + 6 * HORA),
      valor: 6200,
      origem: "wa",
      responsavel: { tipo: "sara", nome: "Sarah" },
      ultima_mensagem: null,
    },
  ];
}

import type { FalaLida } from "@/lib/conversas/sugestao-jarvis";

/**
 * O fio da conversa de exemplo, no MESMO formato que a regra do Jarvis lê na tela real. A
 * vitrine chama `sugerirTarefa` sobre isto em vez de trazer um cartão escrito à mão — senão ela
 * mostraria uma sugestão que o app nunca produziria, que é a pior coisa que uma demonstração
 * pode fazer.
 *
 * Os tempos deixam o fio no gatilho da regra 2: nós prometemos voltar e não voltamos.
 */
export function conversaExemplo(agora: number): FalaLida[] {
  const h = (n: number) => new Date(agora - n * HORA).toISOString();
  return [
    { id: "f1", direcao: "entrada", corpo: "Boa tarde! Vi o anúncio de vocês. Minha mãe tem 78 anos e está ouvindo muito mal.", criado_em: h(25) },
    { id: "f2", direcao: "saida", corpo: "Boa tarde! Que bom que procurou. O primeiro passo é a audiometria — é ela que diz o grau da perda. É gratuita aqui.", criado_em: h(24.5) },
    { id: "f3", direcao: "entrada", corpo: "Entendi. Ela faz hemodiálise terça e quinta, então só consigo levar na sexta de manhã.", criado_em: h(24) },
    { id: "f4", direcao: "saida", corpo: "Fechado, vou ver a agenda da fono para sexta e te confirmo.", criado_em: h(23) },
  ];
}
