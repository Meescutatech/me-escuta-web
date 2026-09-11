/**
 * FIXTURES DA SEGUNDA PASSADA de Configurações (W-D2, 10/09 22:30): funil (etapas + SLA +
 * motivos de perda), mensagens prontas (respostas rápidas + templates HSM), identidades
 * (de-para Kommo ↔ pessoa), relatos de suporte e auditoria (configurações publicadas).
 * Arquivo novo de propósito — regra de convivência: fixture existente não se edita.
 */

// ───────────────────────────── funil ─────────────────────────────

export interface EtapaConfig {
  chave: string;
  nome: string;
  cor: string;
  tipo: "aberto" | "ganho" | "perdido";
  /** horas até o card ficar âmbar; null = sem prazo (ganho/perdido) */
  sla_h: number | null;
  no_board: boolean;
  leads: number;
}

export const ETAPAS_CONFIG: EtapaConfig[] = [
  { chave: "novo", nome: "Novo lead", cor: "#94a3b8", tipo: "aberto", sla_h: 2, no_board: false, leads: 9 },
  { chave: "qualificando", nome: "Qualificando", cor: "#38bdf8", tipo: "aberto", sla_h: 72, no_board: false, leads: 8 },
  { chave: "avaliacao", nome: "Avaliação auditiva", cor: "#a78bfa", tipo: "aberto", sla_h: 168, no_board: false, leads: 7 },
  { chave: "proposta", nome: "Proposta enviada", cor: "#fbbf24", tipo: "aberto", sla_h: 120, no_board: false, leads: 4 },
  { chave: "negociacao", nome: "Negociação", cor: "#fb923c", tipo: "aberto", sla_h: 120, no_board: false, leads: 3 },
  { chave: "ganho", nome: "Ganho", cor: "#34d399", tipo: "ganho", sla_h: null, no_board: false, leads: 6 },
  { chave: "perdido", nome: "Perdido", cor: "#f87171", tipo: "perdido", sla_h: null, no_board: false, leads: 3 },
  { chave: "arquivado", nome: "Arquivado", cor: "#cbd5e1", tipo: "perdido", sla_h: null, no_board: true, leads: 582 },
];

export interface MotivoPerdaConfig {
  chave: string;
  rotulo: string;
  pedeDetalhe: boolean;
  usos_90d: number;
}

export const MOTIVOS_PERDA: MotivoPerdaConfig[] = [
  { chave: "preco", rotulo: "Preço", pedeDetalhe: false, usos_90d: 41 },
  { chave: "comprou_outro", rotulo: "Comprou em outro lugar", pedeDetalhe: true, usos_90d: 17 },
  { chave: "sem_retorno", rotulo: "Sem retorno", pedeDetalhe: false, usos_90d: 63 },
  { chave: "nao_precisa", rotulo: "Não precisa / não é candidato", pedeDetalhe: false, usos_90d: 12 },
  { chave: "fora_da_area", rotulo: "Fora da área de atendimento", pedeDetalhe: false, usos_90d: 8 },
  { chave: "outro", rotulo: "Outro", pedeDetalhe: true, usos_90d: 5 },
];

// ───────────────────────────── mensagens prontas ─────────────────────────────

export type AprovacaoMeta = "nao_pedida" | "em_analise" | "aprovada" | "rejeitada" | "texto_mudou";

export interface MensagemPronta {
  id: string;
  titulo: string;
  atalho: string;
  corpo: string;
  quemVe: "eu" | "departamento" | "todos";
  departamento?: string;
  aprovacao: AprovacaoMeta;
  categoria_meta?: "UTILITY" | "MARKETING";
  usos_30d: number;
  atualizado_em: string;
  autor: string;
}

const H = 3_600_000;
const D = 24 * H;

export function gerarMensagensProntas(agora: Date = new Date()): MensagemPronta[] {
  const t = agora.getTime();
  return [
    {
      id: "tpl-1",
      titulo: "Boas-vindas e primeira pergunta",
      atalho: "oi",
      corpo: "Olá, {{nome}}! Eu sou {{atendente}}, da Me Escuta. Que bom que você escreveu. O aparelho é para você ou para um familiar?",
      quemVe: "todos",
      aprovacao: "aprovada",
      categoria_meta: "UTILITY",
      usos_30d: 214,
      atualizado_em: new Date(t - 20 * D).toISOString(),
      autor: "Sara Oliveira",
    },
    {
      id: "tpl-2",
      titulo: "Lembrete de avaliação (24 h antes)",
      atalho: "lembrete",
      corpo: "Oi, {{nome}}! Lembrando da sua avaliação auditiva amanhã, às {{hora}}, com a {{fono}}. Endereço: Av. João César de Oliveira, 1275 — Eldorado, Contagem. Qualquer coisa, é só chamar.",
      quemVe: "todos",
      aprovacao: "aprovada",
      categoria_meta: "UTILITY",
      usos_30d: 96,
      atualizado_em: new Date(t - 12 * D).toISOString(),
      autor: "Sara Oliveira",
    },
    {
      id: "tpl-3",
      titulo: "Guia do teste de 7 dias",
      atalho: "teste",
      corpo: "{{nome}}, o teste funciona assim: você leva o aparelho para casa e usa por 7 dias no seu dia a dia. Se não se adaptar, devolve sem custo. Te mando o guia em PDF em seguida.",
      quemVe: "departamento",
      departamento: "pre_venda",
      aprovacao: "nao_pedida",
      usos_30d: 58,
      atualizado_em: new Date(t - 5 * D).toISOString(),
      autor: "Sara Oliveira",
    },
    {
      id: "tpl-4",
      titulo: "Retomada depois de 30 dias",
      atalho: "retomar",
      corpo: "Oi, {{nome}}, tudo bem? Faz um tempinho que a gente conversou sobre o aparelho. Ainda faz sentido para você? Se quiser, eu reservo um horário de avaliação sem compromisso.",
      quemVe: "departamento",
      departamento: "pre_venda",
      aprovacao: "texto_mudou",
      categoria_meta: "MARKETING",
      usos_30d: 23,
      atualizado_em: new Date(t - 2 * D).toISOString(),
      autor: "Rodolfo Andrade",
    },
    {
      id: "tpl-5",
      titulo: "Orientação: chiado nos primeiros dias",
      atalho: "chiado",
      corpo: "{{nome}}, chiado nos primeiros dias é normal — o molde ainda está assentando. Tenta tirar e recolocar bem no fundo, com a pilha virada para trás. Se continuar até sexta, você vem aqui que eu ajusto.",
      quemVe: "eu",
      aprovacao: "nao_pedida",
      usos_30d: 11,
      atualizado_em: new Date(t - 9 * D).toISOString(),
      autor: "Ana Paula Ferreira",
    },
    {
      id: "tpl-6",
      titulo: "Parcela vencendo em 3 dias",
      atalho: "vence3",
      corpo: "Oi, {{nome}}! Passando para lembrar que a parcela do seu aparelho vence em 3 dias ({{data}}). Aqui está o link para pagar: {{link}}. Se precisar de outra opção, me chama.",
      quemVe: "departamento",
      departamento: "cobranca",
      aprovacao: "em_analise",
      categoria_meta: "UTILITY",
      usos_30d: 0,
      atualizado_em: new Date(t - 1 * D).toISOString(),
      autor: "Rodolfo Andrade",
    },
  ];
}

// ───────────────────────────── identidades ─────────────────────────────

export interface DeParaKommo {
  idExterno: string;
  nomeNoKommo: string;
  leads: number;
  pessoaId: string | null;
  pessoaNome: string | null;
  estado: "vinculado" | "descartado" | "sem_decisao";
  vinculadoEm: string | null;
}

export function gerarDeParaKommo(agora: Date = new Date()): DeParaKommo[] {
  const t = agora.getTime();
  return [
    { idExterno: "kommo:10248863", nomeNoKommo: "Sara", leads: 2_914, pessoaId: "e0000000-0000-4000-8000-000000000001", pessoaNome: "Sara Oliveira", estado: "vinculado", vinculadoEm: new Date(t - 30 * D).toISOString() },
    { idExterno: "kommo:10412290", nomeNoKommo: "Rodolfo", leads: 1_127, pessoaId: "e0000000-0000-4000-8000-000000000002", pessoaNome: "Rodolfo Andrade", estado: "vinculado", vinculadoEm: new Date(t - 30 * D).toISOString() },
    { idExterno: "kommo:9987120", nomeNoKommo: "Robô", leads: 1_688, pessoaId: null, pessoaNome: null, estado: "descartado", vinculadoEm: new Date(t - 28 * D).toISOString() },
    { idExterno: "kommo:10633419", nomeNoKommo: "Carla (ex-SDR)", leads: 611, pessoaId: null, pessoaNome: null, estado: "sem_decisao", vinculadoEm: null },
    { idExterno: "kommo:10701822", nomeNoKommo: "Fono Juliana", leads: 134, pessoaId: null, pessoaNome: null, estado: "sem_decisao", vinculadoEm: null },
  ];
}

// ───────────────────────────── suporte ─────────────────────────────

export interface RelatoSuporte {
  id: string;
  numero: number;
  titulo: string;
  rota: string;
  autor: string;
  status: "aberto" | "resolvido";
  criado_em: string;
  resolvido_em: string | null;
  comentarios: Array<{ autor: string; texto: string; em: string; construtor?: boolean }>;
  anexo?: string;
}

export function gerarRelatos(agora: Date = new Date()): RelatoSuporte[] {
  const t = agora.getTime();
  return [
    {
      id: "rel-7",
      numero: 7,
      titulo: "A foto da audiometria fica em 'carregando' e não abre",
      rota: "/conversas",
      autor: "Sara Oliveira",
      status: "aberto",
      criado_em: new Date(t - 3 * H).toISOString(),
      resolvido_em: null,
      comentarios: [
        { autor: "Sara Oliveira", texto: "Na conversa da Maria Aparecida, a segunda foto fica girando. A primeira abre normal.", em: new Date(t - 3 * H).toISOString() },
        { autor: "Diogo Tambasco", texto: "Vi aqui — é a assinatura da URL que venceu. Vou reprocessar as mídias de ontem.", em: new Date(t - 2 * H).toISOString(), construtor: true },
      ],
      anexo: "print-conversa-maria.png",
    },
    {
      id: "rel-6",
      numero: 6,
      titulo: "Jarvis criou duas tarefas para o mesmo lead no mesmo dia",
      rota: "/tarefas",
      autor: "Sara Oliveira",
      status: "resolvido",
      criado_em: new Date(t - 4 * D).toISOString(),
      resolvido_em: new Date(t - 3 * D).toISOString(),
      comentarios: [
        { autor: "Sara Oliveira", texto: "José Carlos apareceu duas vezes na coluna HOJE, com textos parecidos.", em: new Date(t - 4 * D).toISOString() },
        { autor: "Diogo Tambasco", texto: "Regra 'uma tarefa por lead por dia' estava contando por hora. Corrigido no prompt v3 e a duplicada foi arquivada.", em: new Date(t - 3 * D).toISOString(), construtor: true },
      ],
    },
    {
      id: "rel-5",
      numero: 5,
      titulo: "Não consigo ligar meu número depois de parear",
      rota: "/configuracoes/canais/meu-numero",
      autor: "Ana Paula Ferreira",
      status: "resolvido",
      criado_em: new Date(t - 9 * D).toISOString(),
      resolvido_em: new Date(t - 8 * D).toISOString(),
      comentarios: [
        { autor: "Ana Paula Ferreira", texto: "Pareou, mas o botão Ligar ficava cinza.", em: new Date(t - 9 * D).toISOString() },
        { autor: "Diogo Tambasco", texto: "Faltava a permissão de membro ligar o próprio número (R1). Publicado; agora o botão fica laranja assim que parear.", em: new Date(t - 8 * D).toISOString(), construtor: true },
      ],
    },
  ];
}

// ───────────────────────────── auditoria ─────────────────────────────

export interface ConfigPublicada {
  nome: string;
  rotulo: string;
  secao: string;
  versao: number;
  publicado_em: string;
  por: string;
  o_que_mudou: string;
  href: string;
}

export function gerarConfigsPublicadas(agora: Date = new Date()): ConfigPublicada[] {
  const t = agora.getTime();
  return [
    { nome: "clara.prompt", rotulo: "Prompt da Clara", secao: "Inteligência › Agentes", versao: 7, publicado_em: new Date(t - 5 * D).toISOString(), por: "Rodolfo Andrade", o_que_mudou: "Uma pergunta por mensagem; transbordo após a 6ª troca sem avanço.", href: "/configuracoes/agentes?agente=clara" },
    { nome: "jarvis.prompt", rotulo: "Prompt do Jarvis", secao: "Inteligência › Agentes", versao: 3, publicado_em: new Date(t - 12 * D).toISOString(), por: "Diogo Tambasco", o_que_mudou: "Uma tarefa por lead por dia (era por hora).", href: "/configuracoes/agentes?agente=jarvis" },
    { nome: "funil_vendas", rotulo: "Etapas do funil", secao: "Operação › Funil", versao: 4, publicado_em: new Date(t - 18 * D).toISOString(), por: "Rodolfo Andrade", o_que_mudou: "'Arquivado' marcado como fora do board.", href: "/configuracoes/funil" },
    { nome: "sla_etapas", rotulo: "Prazo por etapa", secao: "Operação › Regras", versao: 1, publicado_em: new Date(t - 18 * D).toISOString(), por: "Rodolfo Andrade", o_que_mudou: "Primeira publicação (era o padrão do sistema).", href: "/configuracoes/regras" },
    { nome: "motivo_perda", rotulo: "Motivos de perda", secao: "Operação › Funil", versao: 2, publicado_em: new Date(t - 26 * D).toISOString(), por: "Sara Oliveira", o_que_mudou: "Entrou 'Fora da área de atendimento'.", href: "/configuracoes/funil" },
    { nome: "tipo_tarefa", rotulo: "Tipos de tarefa", secao: "Operação › Regras", versao: 3, publicado_em: new Date(t - 31 * D).toISOString(), por: "Diogo Tambasco", o_que_mudou: "Entrou 'logistica_expedicao'.", href: "/configuracoes/regras" },
    { nome: "departamentos", rotulo: "Departamentos", secao: "Pessoas › Departamentos", versao: 2, publicado_em: new Date(t - 40 * D).toISOString(), por: "Diogo Tambasco", o_que_mudou: "Cobrança virou filho de Pós-venda.", href: "/configuracoes/departamentos" },
    { nome: "ficha_lead", rotulo: "Ficha do lead", secao: "Operação › Funil", versao: 5, publicado_em: new Date(t - 44 * D).toISOString(), por: "Rodolfo Andrade", o_que_mudou: "Campo 'Cidade' passou a obrigatório.", href: "/configuracoes/funil" },
  ];
}
