import type { ConversaResumo, Mensagem, PaginaConversas } from "@/lib/dados/conversas";
import type { CardLead, DadosFunil, EtapaFunil, Origem } from "@/lib/dados/funil";
import { ETAPAS_PADRAO } from "@/lib/dados/funil-etapas";
import { SLA_PADRAO_DECLARADO } from "@/lib/dados/funil-ordenacao";
import type { PainelLead } from "@/lib/dados/lead-painel";
import type { Escopo } from "@/lib/departamentos/escopo";
import { PESSOAS, type PessoaEnsaio } from "../modo";
import { gerarCanaisEnsaio, type CanalEnsaio } from "./canais";

/**
 * CONVERSAS + LEADS de ensaio.
 *
 * Quarenta leads no funil e quinze conversas — todas com o VOCABULÁRIO da leitura real
 * (`ConversaResumo`, `Mensagem`, `CardLead`): o Inbox e o Quadro desenham exatamente o que
 * desenhariam com banco, só a origem muda.
 *
 * A PRIMEIRA conversa (Maria Aparecida) é a vitrine: tem todos os tipos de bolha que o WhatsApp
 * entrega — texto, foto, áudio com player, vídeo, documento, figurinha, botões, reação colada,
 * resposta citada, localização, contato e uma mensagem programada ainda não enviada. As outras
 * catorze cobrem os ESTADOS: não lida, Clara conduzindo, Sara conduzindo, canal Lite da Sara,
 * canal da fono (Clínico), falha de entrega, ganho, perdido.
 *
 * A visibilidade segue a R4 do contrato D91, aplicada aqui em memória (`conversasVisiveisPara`):
 * admin/owner tudo; membro lotada vê o próprio canal + os departamentos em que está + sem área;
 * a fono NÃO vê Pré-venda e a Sara NÃO vê Clínico.
 */

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

const ETAPAS_ENSAIO: EtapaFunil[] = ETAPAS_PADRAO;

export function etapasEnsaio(): EtapaFunil[] {
  return ETAPAS_ENSAIO;
}

function nomeEtapa(chave: string): string {
  return ETAPAS_ENSAIO.find((e) => e.chave === chave)?.nome ?? chave;
}

// ───────────────────────────── leads ─────────────────────────────

interface MoldeLead {
  nome: string;
  telefone: string;
  etapa: string;
  origem: Origem | null;
  valor: number | null;
  /** horas atrás em que entrou na etapa */
  naEtapaH: number;
  dono: "sara" | "fono" | null;
  tags?: string[];
  idade?: number;
}

const MOLDES_LEADS: MoldeLead[] = [
  { nome: "Maria Aparecida Souza", telefone: "+5531998811234", etapa: "qualificando", origem: "meta", valor: 8900, naEtapaH: 26, dono: "sara", tags: ["familiar decide"], idade: 74 },
  { nome: "José Carlos Menezes", telefone: "+5531997722345", etapa: "avaliacao", origem: "wa", valor: 12400, naEtapaH: 70, dono: "sara", tags: ["já usou aparelho"], idade: 68 },
  { nome: "Antônia Ribeiro Prado", telefone: "+5531996633456", etapa: "novo", origem: "meta", valor: null, naEtapaH: 1.5, dono: null, idade: 71 },
  { nome: "Waldemar Costa Filho", telefone: "+5531995544567", etapa: "avaliacao", origem: "ind", valor: 9800, naEtapaH: 48, dono: "sara", idade: 79 },
  { nome: "Neusa Maria Braga", telefone: "+5531994455678", etapa: "proposta", origem: "wa", valor: 15200, naEtapaH: 96, dono: "sara", tags: ["parcelado"], idade: 66 },
  { nome: "Geraldo Nunes", telefone: "+5531993366789", etapa: "ganho", origem: "ind", valor: 11800, naEtapaH: 240, dono: "fono", tags: ["adaptação"], idade: 82 },
  { nome: "Irene Salgado", telefone: "+5531992277890", etapa: "novo", origem: "meta", valor: null, naEtapaH: 4, dono: null, idade: 63 },
  { nome: "Sebastião Lima", telefone: "+5531991188901", etapa: "negociacao", origem: "wa", valor: 18600, naEtapaH: 30, dono: "sara", tags: ["2 aparelhos"], idade: 77 },
  { nome: "Camila Andrade (mãe: Lourdes)", telefone: "+5531990099012", etapa: "qualificando", origem: "ig", valor: 8900, naEtapaH: 12, dono: "sara", tags: ["familiar decide"], idade: 45 },
  { nome: "Francisco Xavier", telefone: "+5531989900123", etapa: "novo", origem: "meta", valor: null, naEtapaH: 0.3, dono: null },
  { nome: "Terezinha Alves", telefone: "+5531988811234", etapa: "ganho", origem: "wa", valor: 9400, naEtapaH: 400, dono: "fono", tags: ["retorno 30d"], idade: 70 },
  { nome: "Osvaldo Pereira", telefone: "+5531987722345", etapa: "ganho", origem: "ind", valor: 13900, naEtapaH: 120, dono: "sara", idade: 73 },
  { nome: "Marlene Duarte", telefone: "+5531986633456", etapa: "perdido", origem: "meta", valor: 8900, naEtapaH: 200, dono: "sara", tags: ["preço"], idade: 69 },
  { nome: "Benedito Rocha", telefone: "+5531985544567", etapa: "qualificando", origem: "meta", valor: null, naEtapaH: 50, dono: null, idade: 80 },
  { nome: "Conceição Barbosa", telefone: "+5531984455678", etapa: "avaliacao", origem: "wa", valor: 10200, naEtapaH: 20, dono: "sara", idade: 65 },
  // — leads sem conversa aberta no inbox (só no funil) —
  { nome: "Ademir Santana", telefone: "+5531983366789", etapa: "novo", origem: "meta", valor: null, naEtapaH: 9, dono: null },
  { nome: "Zilda Carvalho", telefone: "+5531982277890", etapa: "novo", origem: "meta", valor: null, naEtapaH: 14, dono: null, idade: 72 },
  { nome: "Raimundo Teixeira", telefone: "+5531981188901", etapa: "novo", origem: "wa", valor: null, naEtapaH: 22, dono: null },
  { nome: "Aparecida Gomes", telefone: "+5531980099012", etapa: "novo", origem: "ig", valor: null, naEtapaH: 33, dono: null, idade: 67 },
  { nome: "Elza Moreira", telefone: "+5531979900123", etapa: "qualificando", origem: "meta", valor: 8900, naEtapaH: 60, dono: "sara", idade: 75 },
  { nome: "Nelson Batista", telefone: "+5531978811234", etapa: "qualificando", origem: "ind", valor: 12400, naEtapaH: 88, dono: "sara", tags: ["já usou aparelho"], idade: 81 },
  { nome: "Dalva Rezende", telefone: "+5531977722345", etapa: "qualificando", origem: "meta", valor: null, naEtapaH: 110, dono: null, idade: 64 },
  { nome: "Arlindo Fonseca", telefone: "+5531976633456", etapa: "qualificando", origem: "wa", valor: 9800, naEtapaH: 7, dono: "sara" },
  { nome: "Cleusa Martins", telefone: "+5531975544567", etapa: "avaliacao", origem: "meta", valor: 11800, naEtapaH: 15, dono: "sara", idade: 70 },
  { nome: "Jorge Nascimento", telefone: "+5531974455678", etapa: "avaliacao", origem: "ind", valor: 14200, naEtapaH: 150, dono: "sara", tags: ["2 aparelhos"], idade: 76 },
  { nome: "Ivone Castro", telefone: "+5531973366789", etapa: "avaliacao", origem: "wa", valor: 8900, naEtapaH: 3, dono: "fono", idade: 62 },
  { nome: "Lázaro Cardoso", telefone: "+5531972277890", etapa: "proposta", origem: "meta", valor: 16800, naEtapaH: 40, dono: "sara", tags: ["parcelado"], idade: 78 },
  { nome: "Wilma Siqueira", telefone: "+5531971188901", etapa: "proposta", origem: "ind", valor: 9400, naEtapaH: 130, dono: "sara", idade: 69 },
  { nome: "Expedito Araújo", telefone: "+5531970099012", etapa: "proposta", origem: "wa", valor: 21000, naEtapaH: 18, dono: "sara", tags: ["2 aparelhos", "recarregável"], idade: 71 },
  { nome: "Iolanda Freitas", telefone: "+5531969900123", etapa: "negociacao", origem: "meta", valor: 12400, naEtapaH: 55, dono: "sara", idade: 66 },
  { nome: "Manoel Dias", telefone: "+5531968811234", etapa: "negociacao", origem: "ind", valor: 15200, naEtapaH: 8, dono: "sara", tags: ["crédito"], idade: 83 },
  { nome: "Rosângela Pinto", telefone: "+5531967722345", etapa: "ganho", origem: "wa", valor: 11800, naEtapaH: 500, dono: "fono", idade: 60 },
  { nome: "Otávio Brandão", telefone: "+5531966633456", etapa: "ganho", origem: "meta", valor: 18600, naEtapaH: 300, dono: "sara", idade: 74 },
  { nome: "Luzia Campos", telefone: "+5531965544567", etapa: "ganho", origem: "ind", valor: 9800, naEtapaH: 720, dono: "fono", tags: ["retorno 30d"], idade: 77 },
  { nome: "Djalma Ribeiro", telefone: "+5531964455678", etapa: "perdido", origem: "meta", valor: null, naEtapaH: 360, dono: null, tags: ["sem retorno"] },
  { nome: "Marli Guimarães", telefone: "+5531963366789", etapa: "perdido", origem: "wa", valor: 8900, naEtapaH: 250, dono: "sara", tags: ["comprou em outro lugar"], idade: 68 },
  { nome: "Hélio Vasconcelos", telefone: "+5531962277890", etapa: "novo", origem: "meta", valor: null, naEtapaH: 2, dono: null },
  { nome: "Noêmia Lacerda", telefone: "+5531961188901", etapa: "qualificando", origem: "ig", valor: null, naEtapaH: 200, dono: null, idade: 73 },
  { nome: "Valdir Peixoto", telefone: "+5531960099012", etapa: "avaliacao", origem: "meta", valor: 10200, naEtapaH: 75, dono: "sara", idade: 79 },
  { nome: "Cecília Tavares", telefone: "+5531959900123", etapa: "novo", origem: "ind", valor: null, naEtapaH: 5, dono: null, idade: 61 },
];

function idLead(i: number): string {
  return `1ead0000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
}

function dono(chave: "sara" | "fono" | null): { id: string; nome: string; tipo: "sara" | "fono" } | null {
  if (!chave) return null;
  const p = PESSOAS.find((x) => x.chave === chave)!;
  return { id: p.id, nome: p.nome.split(" ")[0] + (chave === "fono" ? " Paula" : ""), tipo: chave };
}

export function gerarLeadsEnsaio(agora: Date = new Date()): CardLead[] {
  const t = agora.getTime();
  return MOLDES_LEADS.map((m, i) => {
    const d = dono(m.dono);
    const conversa = CONVERSAS_MOLDE.find((c) => c.lead === i);
    const ultima = conversa ? ultimaMensagemDe(conversa, agora) : null;
    return {
      lead_id: idLead(i),
      nome: m.nome,
      idade: m.idade ?? null,
      telefone: m.telefone,
      etapa: m.etapa,
      entrou_etapa_em: new Date(t - m.naEtapaH * H).toISOString(),
      valor: m.valor,
      origem: m.origem,
      responsavel: d ? { tipo: d.tipo, nome: d.nome } : null,
      dono_id: d?.id ?? null,
      dono_nome: d?.nome ?? null,
      tags: m.tags ?? [],
      proposta: null,
      kommo_lead_id: String(10240000 + i * 37),
      tem_tarefa_pendente: i % 3 === 0,
      ultima_mensagem: ultima,
      compromisso_em: m.etapa === "avaliacao" && i % 2 === 0 ? new Date(t + (i + 1) * 6 * H).toISOString() : null,
    };
  });
}

export function gerarFunilEnsaio(agora: Date = new Date()): DadosFunil {
  return {
    etapas: ETAPAS_ENSAIO.filter((e) => !e.no_board),
    todasEtapas: ETAPAS_ENSAIO,
    cards: gerarLeadsEnsaio(agora),
    corte: false,
    sla: SLA_PADRAO_DECLARADO,
  };
}

// ───────────────────────────── conversas ─────────────────────────────

type Falante = "cliente" | "clara" | "sara" | "fono";

interface MoldeMsg {
  de: Falante;
  /** minutos atrás (relativo a `agora`) */
  ha: number;
  tipo?: string;
  corpo?: string | null;
  extra?: Partial<Mensagem>;
}

interface MoldeConversa {
  id: string;
  lead: number;
  canal: "waba:1067455192551392" | "lite:sara" | "lite:ana-paula";
  area: "pre_venda" | "clinico" | null;
  mode: "IA" | "HUMANO";
  msgs: MoldeMsg[];
}

const FOTO_AUDIOMETRIA = "/ensaio/foto-audiometria.svg";
const FOTO_APARELHO = "/ensaio/foto-aparelho.svg";
const FIGURINHA = "/ensaio/figurinha.svg";
const VIDEO_POSTER = "/ensaio/video-poster.svg";
const AUDIO = "/ensaio/voz-1.wav";

const CONVERSAS_MOLDE: MoldeConversa[] = [
  {
    id: "c0nv0000-0000-4000-8000-000000000001",
    lead: 0,
    canal: "waba:1067455192551392",
    area: "pre_venda",
    mode: "HUMANO",
    msgs: [
      { de: "cliente", ha: 26 * 60, corpo: "Boa tarde, vi o anúncio de vocês. É para minha mãe, ela tem 74 anos e está escutando muito mal a televisão" },
      { de: "clara", ha: 26 * 60 - 1, corpo: "Boa tarde! Que bom que você escreveu. Eu sou a Clara, da Me Escuta. Sua mãe já fez algum exame de audição, a audiometria?" },
      { de: "cliente", ha: 26 * 60 - 4, corpo: "Fez sim, mês passado no posto. Tenho a foto aqui" },
      { de: "cliente", ha: 26 * 60 - 3, tipo: "imagem", corpo: "audiometria da mamãe", extra: { midia_caminho: "ensaio/foto-audiometria.svg", midia_mime: "image/svg+xml", midia_url: FOTO_AUDIOMETRIA } },
      { de: "clara", ha: 26 * 60 - 2, corpo: "Recebi, obrigada! Vou passar para a nossa fonoaudióloga olhar. Vocês moram em qual cidade?", extra: { reacoes: [{ emoji: "👍", de: "cliente" }] } },
      {
        de: "clara",
        ha: 26 * 60 - 1,
        tipo: "interactive",
        corpo: "Para eu te ajudar melhor: o aparelho é para você ou para outra pessoa?",
        extra: { interativo: { pergunta: "O aparelho é para quem?", opcoes: ["É para mim", "Para um familiar", "Só pesquisando"], escolhida: null } },
      },
      {
        de: "cliente",
        ha: 25 * 60 + 50,
        tipo: "interactive",
        corpo: "Para um familiar",
        extra: { interativo: { pergunta: null, opcoes: [], escolhida: "Para um familiar" } },
      },
      { de: "cliente", ha: 25 * 60 + 49, corpo: "Contagem, perto do Eldorado" },
      { de: "clara", ha: 25 * 60 + 48, corpo: "Perfeito, atendemos Contagem. A Sara, da nossa equipe, continua a conversa com você daqui a pouco para ver os próximos passos. Pode ser?" },
      { de: "cliente", ha: 25 * 60 + 40, tipo: "audio", corpo: "Pode sim, só que de manhã eu trabalho, melhor à tarde", extra: { midia_caminho: "ensaio/voz-1.wav", midia_mime: "audio/wav", midia_url: AUDIO, duracao_s: 9 } },
      { de: "sara", ha: 22 * 60, corpo: "Oi, aqui é a Sara! Vi a audiometria da sua mãe. Pela perda que aparece ali, ela é sim uma boa candidata a aparelho. Me conta: ela já usou aparelho alguma vez?", extra: { citada: { id: null, autor: "Maria Aparecida", corpo: "Fez sim, mês passado no posto. Tenho a foto aqui" } } },
      { de: "cliente", ha: 21 * 60 + 30, corpo: "Nunca usou. Ela tem medo de ficar apitando igual o da vizinha kkk" },
      { de: "sara", ha: 21 * 60 + 20, tipo: "video", corpo: "Olha esse vídeo curtinho de 40 segundos, é a dona Lourdes contando como foi a adaptação dela — o apito era exatamente o medo dela também", extra: { midia_caminho: "ensaio/video-poster.svg", midia_mime: "video/mp4", midia_url: VIDEO_POSTER, duracao_s: 41 } },
      { de: "cliente", ha: 20 * 60, tipo: "sticker", corpo: null, extra: { midia_caminho: "ensaio/figurinha.svg", midia_mime: "image/webp", midia_url: FIGURINHA } },
      { de: "cliente", ha: 20 * 60 - 1, corpo: "Adorei! Vou mostrar pra ela hoje à noite" },
      { de: "sara", ha: 19 * 60, tipo: "document", corpo: "Aqui está o guia que a gente manda para a família, explica o teste de 7 dias em casa", extra: { documento: { nome: "Guia-do-teste-em-casa.pdf", tamanho: "1,2 MB", mime: "application/pdf" } } },
      { de: "sara", ha: 19 * 60 - 1, tipo: "location", corpo: null, extra: { localizacao: { nome: "Me Escuta · Clínica Contagem", endereco: "Av. João César de Oliveira, 1275 — Eldorado, Contagem", lat: -19.9385, lng: -44.0288 } } },
      { de: "sara", ha: 19 * 60 - 2, tipo: "contacts", corpo: null, extra: { contato: { nome: "Ana Paula · fonoaudióloga", telefone: "+5531997310094" } } },
      { de: "cliente", ha: 3 * 60, corpo: "Sara, conversei com ela. Ela topou fazer o teste! Que dia dá pra ir aí?", extra: { reacoes: [{ emoji: "🎉", de: "nos" }] } },
      { de: "cliente", ha: 3 * 60 - 1, tipo: "imagem", corpo: "ela até pediu pra ver o modelo que a vizinha usa", extra: { midia_caminho: "ensaio/foto-aparelho.svg", midia_mime: "image/svg+xml", midia_url: FOTO_APARELHO } },
      { de: "sara", ha: 2 * 60 + 55, corpo: "Que notícia boa! Tenho quinta às 14h ou sexta às 10h com a Ana Paula. Qual fica melhor para vocês?", extra: { status_entrega: "lido" } },
      { de: "cliente", ha: 2 * 60 + 40, corpo: "Quinta às 14h" },
      { de: "sara", ha: 2 * 60 + 38, corpo: "Marcado: quinta, 14h, com a Ana Paula. Vou mandar o endereço de novo na quarta para vocês não esquecerem 😊", extra: { status_entrega: "entregue", reacoes: [{ emoji: "❤️", de: "cliente" }] } },
      { de: "sara", ha: -1, corpo: "Oi Maria! Lembrando da audiometria da sua mãe amanhã às 14h com a Ana Paula. O endereço é Av. João César de Oliveira, 1275 — Eldorado. Qualquer coisa me chama!", extra: { programada_para: "AMANHA_09H" } },
    ],
  },
  {
    id: "c0nv0000-0000-4000-8000-000000000002",
    lead: 1,
    canal: "waba:1067455192551392",
    area: "pre_venda",
    mode: "HUMANO",
    msgs: [
      { de: "cliente", ha: 3 * D / MIN, corpo: "Já usei aparelho da Caixa há uns 5 anos mas parou de funcionar. Vocês fazem conserto ou só vendem?" },
      { de: "clara", ha: 3 * D / MIN - 1, corpo: "Bom dia, José Carlos! A gente vende e faz manutenção dos nossos. Aparelho de outra marca a gente avalia. Você tem uma audiometria recente?" },
      { de: "cliente", ha: 3 * D / MIN - 30, tipo: "document", corpo: "esse é do ano passado", extra: { documento: { nome: "Audiometria-Jose-Carlos-2025.pdf", tamanho: "640 KB", mime: "application/pdf" } } },
      { de: "sara", ha: 2 * D / MIN, corpo: "José Carlos, é a Sara. Olhei seu exame com a fono: dá para aproveitar bem. Fiz uma simulação de parcelas pela Caixa, você chegou a olhar?" },
      { de: "cliente", ha: 4 * 60, tipo: "audio", corpo: "Vi sim Sara, só que a minha filha que resolve isso, vou falar com ela no fim de semana", extra: { midia_caminho: "ensaio/voz-1.wav", midia_mime: "audio/wav", midia_url: AUDIO, duracao_s: 14 } },
    ],
  },
  {
    id: "c0nv0000-0000-4000-8000-000000000003",
    lead: 2,
    canal: "waba:1067455192551392",
    area: "pre_venda",
    mode: "IA",
    msgs: [
      { de: "cliente", ha: 95, corpo: "Olá, quero saber o valor do aparelho auditivo" },
      { de: "clara", ha: 94, corpo: "Olá, Antônia! Eu sou a Clara, da Me Escuta. O valor depende do grau da perda e do modelo — por isso a gente começa pela avaliação. É para você mesma?" },
      { de: "cliente", ha: 80, corpo: "É pra mim. Tenho 71 anos" },
      { de: "clara", ha: 79, corpo: "Certo! Você já fez audiometria nos últimos 12 meses?" },
      { de: "cliente", ha: 14, corpo: "Não fiz não. Precisa?" },
      { de: "cliente", ha: 13, corpo: "e se eu não me adaptar com o aparelho?" },
    ],
  },
  {
    id: "c0nv0000-0000-4000-8000-000000000004",
    lead: 3,
    canal: "lite:sara",
    area: "pre_venda",
    mode: "HUMANO",
    msgs: [
      { de: "sara", ha: 2 * D / MIN, corpo: "Seu Waldemar, é a Sara da Me Escuta — o Geraldo, seu vizinho, me passou seu número. Ele disse que o senhor quer fazer o teste também?" },
      { de: "cliente", ha: 2 * D / MIN - 40, corpo: "Sim minha filha, o Geraldo ficou muito satisfeito. Onde que é a clínica?" },
      { de: "sara", ha: 2 * D / MIN - 35, tipo: "location", corpo: null, extra: { localizacao: { nome: "Me Escuta · Clínica Contagem", endereco: "Av. João César de Oliveira, 1275 — Eldorado, Contagem", lat: -19.9385, lng: -44.0288 } } },
      { de: "cliente", ha: 30 * 60, corpo: "Meu neto vai me levar. Amanhã de tarde pode ser?" },
      { de: "sara", ha: 30 * 60 - 5, corpo: "Pode! Amanhã 15h30 está livre. Confirmo?", extra: { status_entrega: "lido" } },
      { de: "cliente", ha: 29 * 60, corpo: "Confirma" },
    ],
  },
  {
    id: "c0nv0000-0000-4000-8000-000000000005",
    lead: 4,
    canal: "waba:1067455192551392",
    area: "pre_venda",
    mode: "HUMANO",
    msgs: [
      { de: "sara", ha: 4 * D / MIN, tipo: "document", corpo: "Neusa, segue a proposta com as duas opções que a gente conversou", extra: { documento: { nome: "Proposta-Neusa-Braga.pdf", tamanho: "312 KB", mime: "application/pdf" } } },
      { de: "cliente", ha: 4 * D / MIN - 120, corpo: "Recebi. A de 12x cabe no meu orçamento, mas queria ver se dá pra começar mês que vem" },
      { de: "sara", ha: 3 * D / MIN, corpo: "Dá sim! Posso deixar a primeira parcela para 10 de outubro. Te mando o contrato assim que você confirmar." },
      { de: "cliente", ha: 3 * D / MIN - 10, tipo: "sticker", corpo: null, extra: { midia_caminho: "ensaio/figurinha.svg", midia_mime: "image/webp", midia_url: FIGURINHA } },
      { de: "cliente", ha: 3 * D / MIN - 9, corpo: "Confirmo!! Obrigada Sara" },
    ],
  },
  {
    id: "c0nv0000-0000-4000-8000-000000000006",
    lead: 5,
    canal: "lite:ana-paula",
    area: "clinico",
    mode: "HUMANO",
    msgs: [
      { de: "cliente", ha: 5 * 60, corpo: "Dra Ana Paula, o aparelho do lado direito tá dando uma chiadinha quando eu mastigo" },
      { de: "fono", ha: 4 * 60 + 50, tipo: "audio", corpo: "Seu Geraldo, isso é normal nos primeiros dias — o molde ainda está assentando. Tenta tirar e recolocar bem no fundo. Se continuar até sexta, o senhor vem aqui que eu ajusto", extra: { midia_caminho: "ensaio/voz-1.wav", midia_mime: "audio/wav", midia_url: AUDIO, duracao_s: 22 } },
      { de: "cliente", ha: 4 * 60 + 30, tipo: "imagem", corpo: "é assim que tá encaixado", extra: { midia_caminho: "ensaio/foto-aparelho.svg", midia_mime: "image/svg+xml", midia_url: FOTO_APARELHO } },
      { de: "fono", ha: 3 * 60, corpo: "Está um pouco para fora. Empurra até sentir que encaixou, com a pilha virada para trás. Me manda outra foto depois?", extra: { citada: { id: null, autor: "Geraldo Nunes", corpo: "é assim que tá encaixado" }, status_entrega: "lido" } },
    ],
  },
  {
    id: "c0nv0000-0000-4000-8000-000000000007",
    lead: 6,
    canal: "waba:1067455192551392",
    area: "pre_venda",
    mode: "IA",
    msgs: [
      { de: "cliente", ha: 4 * 60, corpo: "Vocês atendem em Betim?" },
      { de: "clara", ha: 4 * 60 - 1, corpo: "Olá, Irene! Atendemos sim — a avaliação é na nossa clínica em Contagem, a 20 minutos de Betim. É para você?" },
      { de: "cliente", ha: 45, corpo: "É pra mim" },
      { de: "cliente", ha: 44, corpo: "quanto custa a avaliação" },
      { de: "cliente", ha: 43, corpo: "?" },
    ],
  },
  {
    id: "c0nv0000-0000-4000-8000-000000000008",
    lead: 7,
    canal: "waba:1067455192551392",
    area: "pre_venda",
    mode: "HUMANO",
    msgs: [
      { de: "sara", ha: 30 * 60, corpo: "Seu Sebastião, consegui a condição que o senhor pediu: os dois aparelhos em 18x, sem entrada. Segura essa condição até sexta." },
      { de: "cliente", ha: 29 * 60, corpo: "Sara você é demais", extra: { reacoes: [{ emoji: "😄", de: "nos" }] } },
      { de: "cliente", ha: 29 * 60 - 1, corpo: "Vou passar aí quinta com minha esposa pra assinar" },
      { de: "sara", ha: 29 * 60 - 5, corpo: "Combinado! Quinta a partir das 9h. Vou deixar tudo pronto.", extra: { status_entrega: "lido", reacoes: [{ emoji: "👍", de: "cliente" }] } },
    ],
  },
  {
    id: "c0nv0000-0000-4000-8000-000000000009",
    lead: 8,
    canal: "lite:sara",
    area: "pre_venda",
    mode: "HUMANO",
    msgs: [
      { de: "cliente", ha: 12 * 60, corpo: "Oi Sara, é a Camila, filha da dona Lourdes. Minha mãe falou que vocês têm um teste de 7 dias?" },
      { de: "sara", ha: 12 * 60 - 8, corpo: "Oi Camila! Tem sim: ela leva o aparelho para casa e usa uma semana. Se não adaptar, devolve sem custo. Ela já fez audiometria?" },
      { de: "cliente", ha: 11 * 60, corpo: "Fez em julho. Posso mandar por aqui?" },
      { de: "sara", ha: 11 * 60 - 2, corpo: "Pode, manda a foto que a fono já olha." },
    ],
  },
  {
    id: "c0nv0000-0000-4000-8000-000000000010",
    lead: 9,
    canal: "waba:1067455192551392",
    area: "pre_venda",
    mode: "IA",
    msgs: [{ de: "cliente", ha: 18, corpo: "Oi, vim pelo Facebook. Quero informação sobre aparelho auditivo" }],
  },
  {
    id: "c0nv0000-0000-4000-8000-000000000011",
    lead: 10,
    canal: "lite:ana-paula",
    area: "clinico",
    mode: "HUMANO",
    msgs: [
      { de: "fono", ha: 3 * D / MIN, corpo: "Dona Terezinha, passou 30 dias da adaptação! Como está a audição com o aparelho? Alguma situação em que ainda fica difícil?" },
      { de: "cliente", ha: 3 * D / MIN - 200, corpo: "Tá ótimo doutora! Só no restaurante que fica muito barulho" },
      { de: "fono", ha: 2 * D / MIN, corpo: "Isso a gente resolve com um programa de ambiente barulhento. Passa aqui na semana que vem que eu ajusto, leva 15 minutos. Terça 10h?" },
      { de: "cliente", ha: 2 * D / MIN - 60, corpo: "Terça tá bom" },
      { de: "fono", ha: 2 * D / MIN - 58, corpo: "Anotado 👍", extra: { status_entrega: "lido" } },
    ],
  },
  {
    id: "c0nv0000-0000-4000-8000-000000000012",
    lead: 11,
    canal: "waba:1067455192551392",
    area: "pre_venda",
    mode: "HUMANO",
    msgs: [
      { de: "cliente", ha: 5 * D / MIN, corpo: "Sara, queria agradecer. Minha esposa chorou quando ouviu o neto falando pela primeira vez direito. Deus abençoe vocês" },
      { de: "sara", ha: 5 * D / MIN - 20, corpo: "Seu Osvaldo, que mensagem linda. É por isso que a gente faz o que faz. Qualquer coisa que precisar, é só chamar 🧡", extra: { status_entrega: "lido", reacoes: [{ emoji: "🙏", de: "cliente" }] } },
    ],
  },
  {
    id: "c0nv0000-0000-4000-8000-000000000013",
    lead: 12,
    canal: "waba:1067455192551392",
    area: "pre_venda",
    mode: "HUMANO",
    msgs: [
      { de: "sara", ha: 9 * D / MIN, corpo: "Marlene, conseguiu ver a proposta? Fico à disposição para tirar dúvida." },
      { de: "cliente", ha: 8 * D / MIN, corpo: "Vi sim. Achei caro, vou ficar com o do posto mesmo. Obrigada" },
      { de: "sara", ha: 8 * D / MIN - 30, corpo: "Entendo, Marlene. Se mudar de ideia ou quiser comparar, estou aqui. Boa sorte com o aparelho!", extra: { status_entrega: "lido" } },
    ],
  },
  {
    id: "c0nv0000-0000-4000-8000-000000000014",
    lead: 13,
    canal: "waba:1067455192551392",
    area: "pre_venda",
    mode: "IA",
    msgs: [
      { de: "cliente", ha: 2 * D / MIN + 100, corpo: "Bom dia" },
      { de: "clara", ha: 2 * D / MIN + 99, corpo: "Bom dia, Benedito! Eu sou a Clara, da Me Escuta. Como posso ajudar?" },
      { de: "cliente", ha: 2 * D / MIN + 60, corpo: "quero o aparelho" },
      { de: "clara", ha: 2 * D / MIN + 59, corpo: "Vamos lá! Você já fez audiometria nos últimos 12 meses?", extra: { status_entrega: "falhou", erro_codigo: "131047" } },
    ],
  },
  {
    id: "c0nv0000-0000-4000-8000-000000000015",
    lead: 14,
    canal: "lite:sara",
    area: "pre_venda",
    mode: "HUMANO",
    msgs: [
      { de: "cliente", ha: 20 * 60, corpo: "Sara, a avaliação é amanhã né? Que horas mesmo?" },
      { de: "sara", ha: 20 * 60 - 3, corpo: "Isso, dona Conceição! Amanhã às 9h com a Ana Paula. Chega uns 10 minutinhos antes 😊", extra: { status_entrega: "lido" } },
      { de: "cliente", ha: 20 * 60 - 1, corpo: "Combinado" },
      { de: "sara", ha: -1, corpo: "Bom dia, dona Conceição! Hoje é o dia da sua avaliação, às 9h. Até já!", extra: { programada_para: "AMANHA_07H30" } },
    ],
  },
];

function autorDe(f: Falante): { direcao: "entrada" | "saida"; autor?: "clara" | "sara"; autor_nome?: string } {
  if (f === "cliente") return { direcao: "entrada" };
  if (f === "clara") return { direcao: "saida", autor: "clara" };
  if (f === "fono") return { direcao: "saida", autor: "sara", autor_nome: "Ana Paula" };
  return { direcao: "saida", autor: "sara", autor_nome: "Sara" };
}

function instanteProgramado(marca: string, agora: Date): string {
  const d = new Date(agora);
  d.setDate(d.getDate() + 1);
  if (marca === "AMANHA_07H30") d.setHours(7, 30, 0, 0);
  else d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

function mensagensDe(c: MoldeConversa, agora: Date): Mensagem[] {
  const t = agora.getTime();
  return c.msgs.map((m, i) => {
    const a = autorDe(m.de);
    const programada = m.extra?.programada_para ? instanteProgramado(m.extra.programada_para, agora) : null;
    const criado = programada ?? new Date(t - m.ha * MIN).toISOString();
    const base: Mensagem = {
      id: `${c.id.slice(0, 24)}${String(i + 1).padStart(12, "0")}`,
      direcao: a.direcao,
      autor: a.autor,
      autor_nome: a.autor_nome ?? null,
      tipo_conteudo: m.tipo ?? "texto",
      corpo: m.corpo ?? null,
      criado_em: criado,
      status_entrega: a.direcao === "saida" ? (m.extra?.status_entrega ?? (programada ? "na_fila" : "entregue")) : undefined,
      ...m.extra,
      programada_para: programada,
    };
    return base;
  });
}

function ultimaMensagemDe(c: MoldeConversa, agora: Date): CardLead["ultima_mensagem"] {
  const msgs = mensagensDe(c, agora).filter((m) => !m.programada_para);
  const u = msgs[msgs.length - 1];
  if (!u) return null;
  const texto = u.corpo ?? (u.tipo_conteudo === "sticker" ? "Figurinha" : u.tipo_conteudo === "location" ? "Localização" : u.tipo_conteudo === "contacts" ? "Contato" : "Mídia");
  return { texto, em: u.criado_em, de: u.direcao === "entrada" ? "cliente" : "nos" };
}

function previaDe(m: Mensagem): string {
  if (m.corpo) return m.corpo;
  const t = m.tipo_conteudo;
  if (t === "sticker") return "Figurinha";
  if (t === "location") return "📍 Localização";
  if (t === "contacts") return "Contato";
  if (t === "imagem" || t === "image") return "📷 Foto";
  if (t === "audio") return "🎤 Áudio";
  if (t === "video") return "🎬 Vídeo";
  if (t === "document") return "📄 Documento";
  return "Mensagem";
}

function resumoDe(c: MoldeConversa, agora: Date, leads: CardLead[], canais: CanalEnsaio[]): ConversaResumo {
  const lead = leads[c.lead];
  const canal = canais.find((k) => k.canal_id === c.canal)!;
  const msgs = mensagensDe(c, agora).filter((m) => !m.programada_para);
  const ultima = msgs[msgs.length - 1];
  const ultimaEntrada = [...msgs].reverse().find((m) => m.direcao === "entrada");
  // não-lidas = entradas depois da última saída
  let naoLidas = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].direcao === "saida") break;
    naoLidas++;
  }
  const humano = c.mode === "HUMANO";
  return {
    id: c.id,
    telefone: lead.telefone,
    nome: lead.nome,
    mode: c.mode,
    dono_atual: humano ? (c.canal === "lite:ana-paula" ? "anapaula@meescuta.com" : "sara@meescuta.com") : null,
    status: "aberta",
    atualizado_em: ultima?.criado_em ?? null,
    ultima_entrada_em: ultimaEntrada?.criado_em ?? null,
    ultima_msg_em: ultima?.criado_em ?? null,
    lead_id: lead.lead_id,
    etapa: lead.etapa,
    etapa_nome: nomeEtapa(lead.etapa),
    entrou_etapa_em: lead.entrou_etapa_em,
    valor: lead.valor,
    origem: lead.origem,
    tags: lead.tags,
    kommo_lead_id: lead.kommo_lead_id ?? null,
    idade: lead.idade,
    previa: ultima ? previaDe(ultima) : null,
    previa_saida: ultima?.direcao === "saida",
    nao_lida: naoLidas > 0,
    nao_lidas_qtd: naoLidas,
    area: c.area,
    phone_number_id: canal.canal_id,
    numero_apelido: canal.apelido,
    numero_e164: canal.numero_e164,
    finalidade: canal.finalidade,
  };
}

export interface EnsaioConversas {
  conversas: ConversaResumo[];
  mensagens: Map<string, Mensagem[]>;
}

export function gerarConversasEnsaio(agora: Date = new Date()): EnsaioConversas {
  const leads = gerarLeadsEnsaio(agora);
  const canais = gerarCanaisEnsaio(agora);
  const conversas = CONVERSAS_MOLDE.map((c) => resumoDe(c, agora, leads, canais)).sort((a, b) =>
    String(b.ultima_entrada_em ?? "").localeCompare(String(a.ultima_entrada_em ?? "")),
  );
  const mensagens = new Map<string, Mensagem[]>();
  for (const c of CONVERSAS_MOLDE) mensagens.set(c.id, mensagensDe(c, agora));
  return { conversas, mensagens };
}

/**
 * R4 do contrato D91, em memória. `escopo` é o departamento ativo do header (D6-g: inclui as
 * conversas sem área).
 */
export function conversasVisiveisPara(
  pessoa: PessoaEnsaio,
  conversas: ConversaResumo[],
  escopo: Escopo | null,
  canais: CanalEnsaio[],
): ConversaResumo[] {
  const porPapel = (c: ConversaResumo): boolean => {
    if (pessoa.papel === "owner" || pessoa.papel === "admin") return true;
    if (pessoa.papel === "marketing") return false;
    const meusCanais = new Set(canais.filter((k) => k.responsavel_id === pessoa.id).map((k) => k.canal_id));
    if (pessoa.departamentos.length === 0) return c.area !== "clinico";
    const lotada = new Set(pessoa.departamentos.map((d) => d.departamento));
    return (
      (c.phone_number_id != null && meusCanais.has(c.phone_number_id)) ||
      (c.area != null && lotada.has(c.area)) ||
      c.area == null
    );
  };
  const porEscopo = (c: ConversaResumo): boolean => {
    if (!escopo) return true;
    return c.area == null || escopo.areas.includes(c.area);
  };
  return conversas.filter((c) => porPapel(c) && porEscopo(c));
}

export function paginaEnsaio(conversas: ConversaResumo[]): PaginaConversas {
  return { conversas, total: conversas.length, corte: false, proximoCursor: null, origemLegivel: true };
}

/** Painel do lead (ficha / tarefas / anotações / histórico) — mínimo verossímil. */
export function painelLeadEnsaio(lead: CardLead, agora: Date = new Date()): PainelLead {
  const t = agora.getTime();
  const sara = PESSOAS.find((p) => p.chave === "sara")!;
  return {
    ficha: {
      grupos: [
        {
          chave: "contato",
          nome: "Contato",
          campos: [
            { slug: "cidade", nome: "Cidade", tipo: "texto", opcoes: [], editavel: true },
            { slug: "para_quem", nome: "Aparelho para", tipo: "selecao", opcoes: ["Para mim", "Familiar"], editavel: true },
            { slug: "audiometria_em", nome: "Audiometria em", tipo: "data", opcoes: [], editavel: true },
            { slug: "ja_usou", nome: "Já usou aparelho", tipo: "booleano", opcoes: [], editavel: true },
          ],
        },
      ],
      valores: {
        cidade: "Contagem",
        para_quem: lead.tags?.includes("familiar decide") ? "Familiar" : "Para mim",
        audiometria_em: "2026-08-14",
        ja_usou: lead.tags?.includes("já usou aparelho") ?? false,
      },
    },
    tarefas: lead.tem_tarefa_pendente
      ? [
          {
            id: `t0000000-0000-4000-8000-${lead.lead_id.slice(-12)}`,
            titulo: "Confirmar audiometria de quinta",
            responsavel: sara.email,
            responsavel_id: sara.id,
            descricao: null,
            tipo: "confirmar_consulta",
            prazo: new Date(t + 20 * H).toISOString(),
            status: "pendente",
            resultado: null,
            criado_em: new Date(t - 2 * H).toISOString(),
            concluida_em: null,
            por_que: "Ela confirmou quinta às 14h, e a clínica pede confirmação 24 h antes.",
            fazer: "Mandar o lembrete e confirmar presença",
            trecho: "Quinta às 14h",
            origem: "jarvis_conversa",
          },
        ]
      : [],
    anotacoes: [
      {
        id: `a0000000-0000-4000-8000-${lead.lead_id.slice(-12)}`,
        autor: sara.email,
        autor_id: sara.id,
        tipo: "nota",
        texto: "Filha decide. Prefere contato à tarde.",
        criado_em: new Date(t - 20 * H).toISOString(),
      },
    ],
    mencoes: [],
    historico: {
      eventos: [
        {
          id: `h0000000-0000-4000-8000-${lead.lead_id.slice(-12)}`,
          posicao_global: 2,
          tipo: "etapa_alterada",
          ator: "agente:clara",
          origem: "clara",
          criado_em: lead.entrou_etapa_em ?? new Date(t - 26 * H).toISOString(),
          etapa_de: "novo",
          etapa_para: lead.etapa,
          etapa_inicial: null,
        } as PainelLead["historico"]["eventos"] extends (infer E)[] | null ? E : never,
        {
          id: `h0000000-0000-4000-8000-${lead.lead_id.slice(-11)}0`,
          posicao_global: 1,
          tipo: "lead_criado",
          ator: "sistema:captacao",
          origem: "meta_leadads",
          criado_em: new Date(t - 27 * H).toISOString(),
          etapa_de: null,
          etapa_para: null,
          etapa_inicial: "novo",
        } as PainelLead["historico"]["eventos"] extends (infer E)[] | null ? E : never,
      ],
      donoLegado: null,
    },
  };
}
