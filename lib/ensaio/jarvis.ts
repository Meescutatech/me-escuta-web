import type { ObservacaoJarvis } from "@/components/jarvis/jarvis-diz";
import type { ItemAcao } from "@/components/jarvis/lista-de-acoes";
import type { LinhaAutonomia } from "@/components/jarvis/regua-autonomia";
import type { AcaoResposta, RespostaJarvis } from "@/lib/jarvis/resposta-tipos";
import type { ContextoJarvisTela } from "@/lib/jarvis/contexto";
import { passos, responderTela } from "./jarvis-telas";
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
      { id: "o1", texto: "4 conversas sem resposta nossa há mais de 2 h — a mais antiga é a de Maria Aparecida (3 h)", href: "/conversas?filtro=sem_resposta", destino: "conversas", origem: "consultar_conversa", faixa: "AGORA" },
      { id: "o2", texto: "3 audiometrias marcadas para amanhã ainda sem confirmação do paciente", href: "/tarefas?tipo=confirmar_exame", destino: "tarefas", origem: "consultar_tarefas", faixa: "HOJE" },
      { id: "o3", texto: "Terezinha Souza e mais 2 leads parados em Qualificado há mais de 5 dias", href: "/funil?etapa=qualificado", destino: "funil", origem: "consultar_funil", faixa: "NA SEMANA" },
      { id: "o4", texto: "Canal lite:ana-paula ficou desconectado das 07:50 às 08:14 — já reconectou", href: "/configuracoes/canais", destino: "canais", origem: "consultar_dashboard", estado: "feito" },
      { id: "o5", texto: "2 propostas do Jarvis esperando decisão em /tarefas desde ontem", href: "/tarefas?filtro=propostas", destino: "tarefas", origem: "consultar_tarefas", faixa: "HOJE" },
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

// ─── Lista de ações (23:10) — percurso de /tarefas e "precisa de atenção" ───────────────────────

/** O percurso "Começar as tarefas" da Sara: feitas riscadas, a atual em andamento, as próximas pendentes. */
export function percursoTarefasEnsaio(): ItemAcao[] {
  return [
    { id: "p1", titulo: "Responder Maria Aparecida sobre o endereço da clínica", estado: "feito", badge: "09:12", href: "/conversas?c=c-0001" },
    { id: "p2", titulo: "Confirmar presença de José Carlos na audiometria", estado: "feito", badge: "09:40", href: "/conversas?c=c-0002" },
    {
      id: "p3",
      titulo: "Ligar para Dona Neusa e explicar a regulagem",
      estado: "andamento",
      href: "/conversas?c=c-0003",
      filhos: [
        { id: "p3a", titulo: "Pegar o modelo do aparelho na ficha", estado: "feito", detalhe: "Signia Pure 312 7X, adaptado em 02/09 — a pilha é a 312." },
        { id: "p3b", titulo: "Ligar (2 tentativas)", estado: "andamento", badge: "1 de 2", detalhe: "Primeira tentativa às 10:05, sem atender. A filha atende melhor à tarde." },
        { id: "p3c", titulo: "Registrar o resultado na conversa", estado: "pendente", detalhe: "Nota interna no fio com o que foi combinado; o Jarvis lê dali." },
      ],
    },
    { id: "p4", titulo: "Mandar para Geraldo o laudo da audiometria em PDF", estado: "pendente", badge: "Ana Paula", href: "/tarefas?lead=l-0011" },
    { id: "p5", titulo: "Cobrar de Antônio o comprovante do Pix", estado: "atencao", badge: "vencida ontem", href: "/tarefas?lead=l-0004", detalhe: "Antônio disse que pagou há 26 h; o Asaas não registrou. Pedir o comprovante antes de liberar o envio." },
    { id: "p6", titulo: "Retomar contato com Terezinha e oferecer dois horários", estado: "pendente", href: "/tarefas?lead=l-0012" },
  ];
}

/** "Precisa de atenção" do dashboard — só o que está fora do prazo ou parado. */
export function atencaoEnsaio(): ItemAcao[] {
  return [
    { id: "a1", titulo: "4 conversas sem resposta nossa há mais de 2 h", estado: "atencao", badge: "conversas", href: "/conversas?filtro=sem_resposta" },
    { id: "a2", titulo: "7 tarefas vencidas — 4 da Sara, 2 da Ana Paula, 1 do Rodolfo", estado: "atencao", badge: "tarefas", href: "/tarefas?filtro=vencidas" },
    { id: "a3", titulo: "3 audiometrias de amanhã sem confirmação", estado: "andamento", badge: "2 de 5 confirmadas", href: "/tarefas?tipo=confirmar_exame" },
    { id: "a4", titulo: "Terezinha Souza e mais 2 parados em Qualificado há 5+ dias", estado: "pendente", badge: "funil", href: "/funil?etapa=qualificado" },
    { id: "a5", titulo: "Canal lite:ana-paula desconectado desde 07:50", estado: "feito", badge: "reconectado 08:14", href: "/configuracoes/canais" },
  ];
}

// ─── O Jarvis em ensaio: o roteiro do Rodolfo + o que a tela pergunta ───────────────────────────

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tem(s: string, ...termos: string[]): boolean {
  return termos.some((t) => s.includes(t));
}

/** Perguntas prontas — as do roteiro, para os links de "Pergunte". */
export const PERGUNTAS_ROTEIRO = [
  "Quantas conversas estão sem resposta?",
  "Quais tarefas estão vencidas e de quem?",
  "Como está o funil esta semana?",
  "Qual canal recebe mais mensagens?",
  "Quanto gastamos em mídia este mês?",
];

export const RESPOSTA_NAO_SEI = "Ainda não sei responder isso — pergunte sobre funil, equipe, tarefas ou marketing.";

const VER_CONVERSAS: AcaoResposta = { id: "ver-conversas", tipo: "abrir", rotulo: "Abrir a fila de conversas", href: "/conversas?filtro=sem_resposta" };

/**
 * Responde por REGRA sobre a fixture (nada de modelo). Ordem: primeiro a resposta da TELA em que a
 * pessoa está (`responderTela` — "o que eu faço agora?", "o que o Jarvis sugere aqui?"), depois as
 * cinco do roteiro do Rodolfo, que valem de qualquer lugar. Qualquer outra devolve o "não sei".
 *
 * Toda resposta traz `passos` (o trabalho que a tela mostra acontecendo) e, quando cabe, `acoes`
 * (o que dá para fazer sem sair da tela). O contexto é opcional: quem chamava com dois argumentos
 * continua chamando com dois.
 */
export function responderEnsaio(pergunta: string, agora: Date, contexto: ContextoJarvisTela | null = null): RespostaJarvis {
  const daTela = responderTela(pergunta, contexto, agora);
  if (daTela) return daTela;

  const q = normalizar(pergunta);
  const em = agora.toISOString();

  if (tem(q, "sem resposta", "conversas sem", "nao respondid", "esperando resposta")) {
    return {
      em,
      consultas: [{ nome: "consultar_conversa", resumo: "31 conversas abertas" }],
      passos: passos(
        ["abriu as conversas do seu escopo", "31 abertas, 12 com mensagem de hoje", 190],
        ["viu quem falou por último em cada uma", "4 terminam com o paciente falando", 240],
        ["mediu contra o SLA de 2 h", "as 4 passaram; a mais antiga tem 3 h", 110],
      ),
      frase: "Quatro conversas estão sem resposta nossa há mais de 2 h. A mais antiga é a de Maria Aparecida, há 3 h.",
      blocos: [
        {
          tipo: "acoes",
          itens: [
            { id: "c1", titulo: "Maria Aparecida — perguntou o endereço da clínica", estado: "atencao", badge: "3 h", href: "/conversas?c=c-0001" },
            { id: "c2", titulo: "José Carlos — quer testar o aparelho antes de comprar", estado: "atencao", badge: "2 h 40", href: "/conversas?c=c-0002" },
            { id: "c3", titulo: "Dona Neusa — dois áudios sobre o apito", estado: "atencao", badge: "2 h 10", href: "/conversas?c=c-0003" },
            { id: "c4", titulo: "Sebastiana Lima — perguntou o horário da consulta", estado: "andamento", badge: "Sara digitando", href: "/conversas?c=c-0005" },
          ],
        },
      ],
      acoes: [VER_CONVERSAS, { id: "f-sem-resposta", tipo: "filtrar", rotulo: "Filtrar esta tela pelas sem resposta", filtro: "filtro=sem_resposta" }],
    };
  }

  if (tem(q, "vencid", "atrasad", "de quem")) {
    return {
      em,
      consultas: [{ nome: "consultar_tarefas", resumo: "42 abertas · 7 vencidas" }],
      passos: passos(
        ["listou as tarefas abertas", "42 abertas em 3 responsáveis", 150],
        ["separou as que passaram do prazo", "7 vencidas; a mais antiga há 3 dias", 220],
        ["agrupou por responsável", "Sara 4 · Ana Paula 2 · Rodolfo 1", 100],
      ),
      frase: "Sete tarefas vencidas: quatro da Sara, duas da Ana Paula e uma do Rodolfo. A mais antiga venceu há 3 dias.",
      blocos: [
        {
          tipo: "numeros",
          itens: [
            { valor: "4", rotulo: "Sara Oliveira", href: "/tarefas?filtro=vencidas&responsavel=e0000000-0000-4000-8000-000000000001", destino: "tarefas" },
            { valor: "2", rotulo: "Ana Paula Ferreira", href: "/tarefas?filtro=vencidas&responsavel=e0000000-0000-4000-8000-000000000004", destino: "tarefas" },
            { valor: "1", rotulo: "Rodolfo Andrade", href: "/tarefas?filtro=vencidas&responsavel=e0000000-0000-4000-8000-000000000002", destino: "tarefas" },
          ],
        },
        {
          tipo: "acoes",
          rotulo: "As três mais antigas",
          itens: [
            { id: "v1", titulo: "Cobrar de Antônio o comprovante do Pix", estado: "atencao", badge: "3 dias · Sara", href: "/tarefas?lead=l-0004" },
            { id: "v2", titulo: "Reenviar proposta para Geraldo Nunes", estado: "atencao", badge: "2 dias · Ana Paula", href: "/tarefas?lead=l-0011" },
            { id: "v3", titulo: "Ligar para Terezinha e oferecer horários", estado: "atencao", badge: "ontem · Sara", href: "/tarefas?lead=l-0012" },
          ],
        },
      ],
      acoes: [
        { id: "ver-vencidas", tipo: "abrir", rotulo: "Abrir as vencidas", href: "/tarefas?filtro=vencidas" },
        { id: "f-vencidas", tipo: "filtrar", rotulo: "Filtrar esta tela pelas vencidas", filtro: "filtro=vencidas" },
      ],
    };
  }

  if (tem(q, "funil", "etapa", "leads esta semana", "pipeline")) {
    return {
      em,
      consultas: [{ nome: "consultar_funil", resumo: "40 leads em 10 etapas" }],
      passos: passos(
        ["contou os leads por etapa", "40 abertos em 10 etapas", 170],
        ["comparou com a semana anterior", "23 novos, 4 a mais que a semana passada", 200],
        ["mediu o tempo parado em cada etapa", "Qualificado concentra o atraso: 3 acima de 5 dias", 180],
      ),
      frase: "Entraram 23 leads esta semana, 9 estão em AGORA e o gargalo segue em Qualificado: 12 leads, 3 deles parados há mais de 5 dias.",
      blocos: [
        {
          tipo: "numeros",
          itens: [
            { valor: "23", rotulo: "novos leads na semana", href: "/funil?periodo=7d", destino: "funil" },
            { valor: "9", rotulo: "em AGORA (SLA estourado)", href: "/funil?faixa=agora", destino: "funil" },
            { valor: "12", rotulo: "em Qualificado", href: "/funil?etapa=qualificado", destino: "funil" },
            { valor: "5", rotulo: "audiometrias agendadas", href: "/funil?etapa=audiometria_agendada", destino: "funil" },
            { valor: "2", rotulo: "vendas ganhas", href: "/funil?etapa=venda_ganha", destino: "funil" },
          ],
        },
        { tipo: "linhas", itens: [{ texto: "Terezinha Souza, Geraldo Nunes e Antônio Ferreira são os três parados há mais de 5 dias", href: "/funil?etapa=qualificado&ordem=parado", destino: "funil" }] },
      ],
      acoes: [
        { id: "ver-funil", tipo: "abrir", rotulo: "Abrir o funil", href: "/funil" },
        { id: "f-qualificado", tipo: "filtrar", rotulo: "Filtrar esta tela por Qualificado", filtro: "etapa=qualificado" },
      ],
    };
  }

  if (tem(q, "canal", "numero recebe", "whatsapp recebe", "recebe mais")) {
    return {
      em,
      consultas: [{ nome: "consultar_dashboard", resumo: "3 canais · 7 dias" }],
      passos: passos(
        ["somou as mensagens recebidas por canal", "675 mensagens em 7 dias", 160],
        ["conferiu as quedas de conexão", "uma: lite:ana-paula, 24 min hoje cedo", 210],
      ),
      frase: "O WhatsApp oficial recebeu 61% das mensagens da semana; o número da Sara, 31%; o da Ana Paula, 8%.",
      blocos: [
        {
          tipo: "numeros",
          itens: [
            { valor: "412", rotulo: "WhatsApp oficial (+55 31 …)", href: "/configuracoes/canais", destino: "canais" },
            { valor: "209", rotulo: "lite:sara", href: "/configuracoes/canais", destino: "canais" },
            { valor: "54", rotulo: "lite:ana-paula", href: "/configuracoes/canais", destino: "canais" },
          ],
        },
        { tipo: "linhas", itens: [{ texto: "O número da Ana Paula ficou desconectado das 07:50 às 08:14 de hoje", href: "/configuracoes/canais/meu-numero", destino: "canais" }] },
      ],
      acoes: [{ id: "ver-canais", tipo: "abrir", rotulo: "Abrir os canais", href: "/configuracoes/canais" }],
    };
  }

  if (tem(q, "midia", "gast", "investi", "cpl", "anuncio", "ads")) {
    return {
      em,
      consultas: [{ nome: "consultar_marketing", resumo: "109 linhas de custo · 30 dias" }],
      passos: passos(
        ["somou o custo de mídia dos últimos 30 dias", "109 linhas, R$ 7.369,42", 230],
        ["cruzou com os leads que chegaram por origem", "190 leads com origem, 36 sem", 260],
        ["dividiu custo por lead em cada plataforma", "Meta R$ 36 · Google R$ 61", 120],
      ),
      frase: "R$ 7.369 em mídia nos últimos 30 dias, 84% na Meta. O CPL médio ficou em R$ 38; o Google está em R$ 61.",
      blocos: [
        {
          tipo: "numeros",
          itens: [
            { valor: "R$ 6.190", rotulo: "Meta Ads — 171 leads, CPL R$ 36", href: "/marketing?origem=meta", destino: "marketing" },
            { valor: "R$ 1.179", rotulo: "Google Ads — 19 leads, CPL R$ 61", href: "/marketing?origem=google", destino: "marketing" },
          ],
        },
        { tipo: "linhas", itens: [{ texto: "36 leads da semana ainda estão sem origem — o Tintim responde por telefone e pode recuperar", href: "/marketing?filtro=sem_origem", destino: "marketing" }] },
      ],
      acoes: [
        { id: "ver-marketing", tipo: "abrir", rotulo: "Abrir marketing", href: "/marketing" },
        { id: "f-sem-origem", tipo: "filtrar", rotulo: "Filtrar esta tela por sem origem", filtro: "filtro=sem_origem" },
      ],
    };
  }

  return { em, consultas: [], passos: [], frase: null, blocos: [{ tipo: "texto", texto: RESPOSTA_NAO_SEI }] };
}
