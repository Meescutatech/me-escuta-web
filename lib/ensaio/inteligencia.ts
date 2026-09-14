import { gerarAgentesEnsaio, type AgenteEnsaio, type Autonomia } from "./fixtures/agentes";
import { gerarCanaisEnsaio, type CanalEnsaio } from "./fixtures/canais";
import { PESSOAS } from "./modo";
import { fotosEnsaio } from "./fotos";
import type { LinhaAutonomia } from "@/components/jarvis/regua-autonomia";
import type { ExecucaoTrace } from "@/components/ui/trace-agente";

/**
 * INTELIGÊNCIA (ensaio) — o que as telas de Mapa, Agentes e a tela de cada agente mostram.
 *
 * O domínio é o real, medido em 10/09/2026: quatro agentes em `core.agente` (Jarvis e Levindo
 * existem; Clara e Priscila estão desligadas), as cinco ferramentas de leitura do Jarvis em
 * produção (`consultar_funil`, `consultar_conversa`, `consultar_tarefas`, `consultar_dashboard`,
 * `consultar_marketing`) mais a ÚNICA escrita dele — o worker que cria tarefa (`tarefa_criada`,
 * origem `jarvis_conversa`). "Agenda" aparece como o que ainda não existe, dito assim.
 *
 * O prompt, as capacidades e a autonomia vêm de `fixtures/agentes.ts` — esta camada não reescreve
 * o agente, só acrescenta o que a tela nova precisa: ferramentas, execuções, quem valida e onde
 * ele aparece. A régua recebe o vocabulário do banco (`auto | propor | proibido` + teto), e o que
 * a Constituição tranca (Art. III — crédito, conduta clínica, preço e negociação) vem travado.
 */

export type ChaveAgente = AgenteEnsaio["chave"];

export interface FerramentaAgente {
  chave: string;
  /** o nome que uma pessoa usa: "Criar tarefa", não `criar_tarefa` */
  rotulo: string;
  /** o que ela faz, em uma linha */
  descricao: string;
  acesso: "leitura" | "escrita";
  /** quantas vezes foi usada em 7 dias; `null` = ainda não rodou */
  usos7d: number | null;
  /** existe no papel, não no código */
  futura?: boolean;
}

export interface ValidadorAgente {
  id: string;
  nome: string;
  papel: string;
  foto?: string;
}

export interface DestinoAgente {
  rotulo: string;
  onde: string;
  href: string;
}

export interface AgenteInteligencia extends AgenteEnsaio {
  /** o que ele é, numa frase que cabe num card */
  frase: string;
  /** de onde vem o glifo dele (components/inteligencia/glifos.tsx) */
  glifo: ChaveAgente;
  /** o tom da capa — só identidade; estado é sempre cor semântica */
  tom: 1 | 2 | 3 | 4 | 5;
  /** por que não está ligado, quando não está */
  situacao: "ligado" | "desligado" | "esperando_credencial";
  ferramentas: FerramentaAgente[];
  validadores: ValidadorAgente[];
  aparece: DestinoAgente[];
  /** execuções 7 d · aceitas pela equipe · tempo médio */
  numeros: Array<{ rotulo: string; valor: string }>;
  execucoes: ExecucaoTrace[];
  autonomia: LinhaAutonomia[];
  /**
   * `core.agente.config_jsonb.responsavel_padrao` — para quem a tarefa vai quando não há dono
   * claro. `undefined` no ensaio (não há banco) e `null` quando ninguém foi escolhido.
   */
  responsavel_padrao?: string | null;
}

const FOTOS = fotosEnsaio();
const pessoa = (chave: string) => PESSOAS.find((p) => p.chave === chave)!;

const SARA: ValidadorAgente = {
  id: pessoa("sara").id,
  nome: "Sara Oliveira",
  papel: "Gestora de Pré-venda",
  foto: FOTOS[pessoa("sara").id],
};
const ANA: ValidadorAgente = {
  id: pessoa("fono").id,
  nome: "Ana Paula Ferreira",
  papel: "Fonoaudióloga",
  foto: FOTOS[pessoa("fono").id],
};
/** O COO não entra no ensaio como login — entra como quem assina crédito e cobrança. */
const COO: ValidadorAgente = {
  id: "coo",
  nome: "Diogo Vidigal",
  papel: "COO",
  foto: "https://i.pravatar.cc/64?img=68",
};

const FUNDAMENTO_III =
  "Constituição, Art. III: crédito, conduta clínica e preço ou negociação nunca são automáticos. Muda por emenda, não por configuração.";
const FUNDAMENTO_TETO =
  "O teto declara o que é permitido configurar. Subir acima dele não é uma escolha da tela — é uma mudança de política.";

/** capacidade da fixture → linha da régua do W-J (vocabulário do banco) */
function paraRegua(a: AgenteEnsaio): LinhaAutonomia[] {
  const nivel = (n: Autonomia): LinhaAutonomia["nivel"] => (n === "desligado" ? "proibido" : n);
  return a.capacidades.map((c) => ({
    chave: c.chave,
    rotulo: c.rotulo,
    descricao: c.descricao,
    nivel: nivel(c.autonomia),
    teto: c.travada || c.autonomia !== "auto" ? "propor" : "auto",
    fundamento: c.travada ? FUNDAMENTO_III : FUNDAMENTO_TETO,
    travada: c.travada,
    alteradaPor: c.travada ? null : a.ativo ? "Diogo Tambasco · 04/09" : null,
  }));
}

// ---------------------------------------------------------------------------
// Execuções — o que o trace mostra
// ---------------------------------------------------------------------------

/**
 * Três passadas do Jarvis. A primeira é a que ele faz o dia inteiro; a segunda mostra o que
 * acontece quando uma ferramenta não responde (e que ele tenta de novo em vez de desistir); a
 * terceira mostra o desfecho que ninguém desenha e que é o mais comum: não havia o que propor.
 */
function execucoesJarvis(): ExecucaoTrace[] {
  return [
    {
      id: "exec_7c41f2",
      modelo: "claude-opus-4",
      quando: "hoje às 09:12",
      duracaoMs: 10_400,
      estado: "feito",
      desfecho: "Propôs para a Sara: ligar para Antônia hoje até as 18h — ela pediu retorno ontem e ninguém voltou.",
      passos: [
        { id: "r", tipo: "agente", nome: "Jarvis olhou a operação", inicioMs: 0, duracaoMs: 10_400, estado: "feito", resultado: "1 tarefa" },
        { id: "p1", paiId: "r", tipo: "modelo", nome: "escolheu o que olhar", inicioMs: 120, duracaoMs: 1_200, estado: "feito", resultado: "1.240 tk" },
        { id: "f1", paiId: "r", tipo: "ferramenta", nome: "consultou o funil", inicioMs: 1_500, duracaoMs: 840, estado: "feito", resultado: "142 leads" },
        { id: "f2", paiId: "r", tipo: "ferramenta", nome: "leu a conversa da Antônia", inicioMs: 2_400, duracaoMs: 1_500, estado: "feito", resultado: "18 mensagens" },
        { id: "f3", paiId: "r", tipo: "ferramenta", nome: "consultou as tarefas da Sara", inicioMs: 3_950, duracaoMs: 650, estado: "feito", resultado: "9 abertas" },
        { id: "p2", paiId: "r", tipo: "modelo", nome: "escreveu o porquê e o fazer", inicioMs: 4_700, duracaoMs: 3_500, estado: "feito", resultado: "2.480 tk" },
        { id: "e1", paiId: "r", tipo: "escrita", nome: "propôs tarefa para a Sara", inicioMs: 8_300, duracaoMs: 2_100, estado: "feito", resultado: "tarefa #4812" },
      ],
    },
    {
      id: "exec_9b03a1",
      modelo: "claude-opus-4",
      quando: "hoje às 08:40",
      duracaoMs: 7_600,
      estado: "feito",
      desfecho: "O funil não respondeu na primeira tentativa. Ele tentou de novo e seguiu — a tarefa saiu 2,1 s mais tarde.",
      passos: [
        { id: "r", tipo: "agente", nome: "Jarvis olhou a operação", inicioMs: 0, duracaoMs: 7_600, estado: "feito", resultado: "1 tarefa" },
        { id: "p1", paiId: "r", tipo: "modelo", nome: "escolheu o que olhar", inicioMs: 100, duracaoMs: 800, estado: "feito", resultado: "980 tk" },
        { id: "f1", paiId: "r", tipo: "ferramenta", nome: "consultou o funil", inicioMs: 1_000, duracaoMs: 2_100, estado: "erro", resultado: "tempo esgotado" },
        { id: "f2", paiId: "r", tipo: "ferramenta", nome: "consultou o funil", inicioMs: 3_200, duracaoMs: 800, estado: "feito", resultado: "142 leads", tentativas: 2 },
        { id: "f3", paiId: "r", tipo: "ferramenta", nome: "leu a conversa do José Carlos", inicioMs: 4_100, duracaoMs: 1_100, estado: "feito", resultado: "31 mensagens", cache: true },
        { id: "e1", paiId: "r", tipo: "escrita", nome: "propôs tarefa para a Sara", inicioMs: 5_300, duracaoMs: 2_300, estado: "feito", resultado: "tarefa #4809" },
      ],
    },
    {
      id: "exec_5d88e0",
      modelo: "claude-opus-4",
      quando: "hoje às 08:10",
      duracaoMs: 4_200,
      estado: "feito",
      desfecho: "Nada mudou desde a passada anterior. Nenhuma tarefa criada — e isso também é resultado.",
      passos: [
        { id: "r", tipo: "agente", nome: "Jarvis olhou a operação", inicioMs: 0, duracaoMs: 4_200, estado: "feito", resultado: "nada a fazer" },
        { id: "p1", paiId: "r", tipo: "modelo", nome: "escolheu o que olhar", inicioMs: 90, duracaoMs: 700, estado: "feito", resultado: "910 tk" },
        { id: "f1", paiId: "r", tipo: "ferramenta", nome: "consultou as tarefas", inicioMs: 850, duracaoMs: 620, estado: "feito", resultado: "42 abertas" },
        { id: "f2", paiId: "r", tipo: "ferramenta", nome: "consultou o painel", inicioMs: 1_520, duracaoMs: 380, estado: "feito", resultado: "ontem", cache: true },
        { id: "p2", paiId: "r", tipo: "modelo", nome: "concluiu que não havia o que propor", inicioMs: 1_960, duracaoMs: 2_240, estado: "feito", resultado: "1.630 tk" },
      ],
    },
  ];
}

function execucoesClara(): ExecucaoTrace[] {
  return [
    {
      id: "exec_c41e07",
      modelo: "claude-sonnet-4",
      quando: "hoje às 09:31",
      duracaoMs: 3_900,
      estado: "feito",
      desfecho: "Respondeu a Maria Aparecida em 2,4 s e moveu o lead para Interessado.",
      passos: [
        { id: "r", tipo: "agente", nome: "Clara atendeu uma mensagem nova", inicioMs: 0, duracaoMs: 3_900, estado: "feito", resultado: "1 resposta" },
        { id: "f1", paiId: "r", tipo: "ferramenta", nome: "leu a conversa", inicioMs: 60, duracaoMs: 320, estado: "feito", resultado: "4 mensagens" },
        { id: "p1", paiId: "r", tipo: "modelo", nome: "escolheu a próxima pergunta", inicioMs: 420, duracaoMs: 1_400, estado: "feito", resultado: "820 tk" },
        { id: "e1", paiId: "r", tipo: "escrita", nome: "respondeu pelo número oficial", inicioMs: 1_880, duracaoMs: 560, estado: "feito", resultado: "enviada" },
        { id: "e2", paiId: "r", tipo: "escrita", nome: "moveu para Interessado", inicioMs: 2_500, duracaoMs: 1_400, estado: "feito", resultado: "etapa 2" },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------

const FERRAMENTAS: Record<ChaveAgente, FerramentaAgente[]> = {
  jarvis: [
    { chave: "criar_tarefa", rotulo: "Criar tarefa", descricao: "Tarefa com POR QUE AGORA e FAZER, para o dono do lead.", acesso: "escrita", usos7d: 412 },
    { chave: "consultar_funil", rotulo: "Consultar o funil", descricao: "Leads por etapa, dono, valor e há quanto tempo parados.", acesso: "leitura", usos7d: 318 },
    { chave: "consultar_conversa", rotulo: "Ler uma conversa", descricao: "As mensagens do lead, quem falou e quando.", acesso: "leitura", usos7d: 274 },
    { chave: "consultar_tarefas", rotulo: "Consultar tarefas", descricao: "O que está aberto, o que venceu e de quem é.", acesso: "leitura", usos7d: 196 },
    { chave: "consultar_dashboard", rotulo: "Ver o painel", descricao: "Entrada, conversão e tempo de resposta no período.", acesso: "leitura", usos7d: 61 },
    { chave: "consultar_marketing", rotulo: "Ver captação", descricao: "Origem dos leads, custo por campanha e CPL.", acesso: "leitura", usos7d: 24 },
    { chave: "agenda", rotulo: "Agenda", descricao: "Ver horário livre e propor audiometria. Ainda não construída.", acesso: "escrita", usos7d: null, futura: true },
  ],
  clara: [
    { chave: "responder", rotulo: "Responder o cliente", descricao: "Uma pergunta por mensagem, pelo número da conversa.", acesso: "escrita", usos7d: 1_842 },
    { chave: "consultar_conversa", rotulo: "Ler a conversa", descricao: "O que já foi dito, para não repetir pergunta.", acesso: "leitura", usos7d: 2_960 },
    { chave: "mover_etapa", rotulo: "Mover etapa", descricao: "Entrada → Interessado → Qualificado, conforme as respostas.", acesso: "escrita", usos7d: 206 },
    { chave: "transbordar", rotulo: "Passar para a Sara", descricao: "Troca a conversa para humano e avisa o cliente.", acesso: "escrita", usos7d: 31 },
    { chave: "consultar_funil", rotulo: "Consultar o funil", descricao: "Em que etapa o lead está e quem é o dono.", acesso: "leitura", usos7d: 1_104 },
    { chave: "agendar", rotulo: "Agendar audiometria", descricao: "Propor horário na clínica parceira. Ainda não construída.", acesso: "escrita", usos7d: null, futura: true },
  ],
  levindo: [
    { chave: "consultar_bureau", rotulo: "Consultar o Serasa", descricao: "Bureau do CPF no dia da proposta.", acesso: "leitura", usos7d: null },
    { chave: "ler_ficha", rotulo: "Ler a ficha do lead", descricao: "Renda declarada, histórico e o que a conversa já disse.", acesso: "leitura", usos7d: null },
    { chave: "calcular_score", rotulo: "Calcular o score", descricao: "Política Comercial v3: bureau 40, comportamental 40, clínico 10, estrutura 10.", acesso: "leitura", usos7d: null },
    { chave: "propor_condicao", rotulo: "Propor condição", descricao: "Faixa A–E e as condições autorizadas, para a pessoa decidir.", acesso: "escrita", usos7d: null },
  ],
  priscila: [
    { chave: "ler_cobrancas", rotulo: "Ler as cobranças", descricao: "Quem está em atraso, há quantos dias e de quanto.", acesso: "leitura", usos7d: null },
    { chave: "enviar_lembrete", rotulo: "Enviar lembrete", descricao: "Três dias antes e no dia do vencimento.", acesso: "escrita", usos7d: null },
    { chave: "cobrar_atraso", rotulo: "Cobrar atraso", descricao: "Régua de 5, 15 e 30 dias, uma mensagem por contato.", acesso: "escrita", usos7d: null },
    { chave: "avisar_gestora", rotulo: "Avisar a gestora", descricao: "Para a régua e escala quando o cliente diz que não pode.", acesso: "escrita", usos7d: null },
  ],
};

const EXTRA: Record<
  ChaveAgente,
  Pick<AgenteInteligencia, "frase" | "tom" | "situacao" | "validadores" | "aparece" | "numeros"> & {
    execucoes: ExecucaoTrace[];
  }
> = {
  jarvis: {
    frase: "Lê a operação inteira e diz o que a equipe faz agora.",
    tom: 3,
    situacao: "ligado",
    validadores: [SARA, ANA],
    aparece: [
      { rotulo: "Conversas", onde: "propõe a tarefa dentro do fio", href: "/conversas" },
      { rotulo: "Tarefas", onde: "a nota de proposta no topo da fila", href: "/tarefas" },
      { rotulo: "Painel", onde: "o bloco “Jarvis diz”", href: "/" },
      { rotulo: "Perguntar", onde: "a tela de pergunta livre", href: "/jarvis" },
    ],
    numeros: [
      { rotulo: "execuções · 7 d", valor: "1.284" },
      { rotulo: "aceitas pela equipe", valor: "71%" },
      { rotulo: "tempo médio", valor: "8,4 s" },
    ],
    execucoes: execucoesJarvis(),
  },
  clara: {
    frase: "Atende quem chega e faz as seis perguntas antes da Sara entrar.",
    tom: 2,
    situacao: "ligado",
    validadores: [SARA],
    aparece: [
      { rotulo: "Conversas", onde: "responde e passa o bastão", href: "/conversas" },
      { rotulo: "Funil", onde: "move o lead de etapa", href: "/funil" },
    ],
    numeros: [
      { rotulo: "execuções · 7 d", valor: "2.960" },
      { rotulo: "chegaram na Sara", valor: "31" },
      { rotulo: "1ª resposta", valor: "38 s" },
    ],
    execucoes: execucoesClara(),
  },
  levindo: {
    frase: "Dá a faixa de crédito e as condições — quem decide é gente.",
    tom: 4,
    situacao: "esperando_credencial",
    validadores: [COO],
    aparece: [
      { rotulo: "Funil", onde: "na ficha do lead em proposta", href: "/funil" },
      { rotulo: "Tarefas", onde: "a análise entra como tarefa do COO", href: "/tarefas" },
    ],
    numeros: [
      { rotulo: "execuções · 7 d", valor: "—" },
      { rotulo: "aceitas pela equipe", valor: "—" },
      { rotulo: "tempo médio", valor: "—" },
    ],
    execucoes: [],
  },
  priscila: {
    frase: "Fala com quem tem parcela em atraso, sem ameaça e sem pressa.",
    tom: 1,
    situacao: "desligado",
    validadores: [COO],
    aparece: [{ rotulo: "Conversas", onde: "as mensagens da régua saem no fio", href: "/conversas" }],
    numeros: [
      { rotulo: "execuções · 7 d", valor: "—" },
      { rotulo: "aceitas pela equipe", valor: "—" },
      { rotulo: "tempo médio", valor: "—" },
    ],
    execucoes: [],
  },
};

/** A lista completa, na ordem em que faz sentido ler: quem está no ar primeiro. */
export function agentesInteligencia(agora: Date = new Date()): AgenteInteligencia[] {
  const base = gerarAgentesEnsaio(agora);
  const ordem: ChaveAgente[] = ["jarvis", "clara", "levindo", "priscila"];
  return ordem.map((chave) => {
    const a = base.find((x) => x.chave === chave)!;
    const e = EXTRA[chave];
    return {
      ...a,
      ...e,
      glifo: chave,
      ferramentas: FERRAMENTAS[chave],
      autonomia: paraRegua(a),
    };
  });
}

export function agenteInteligencia(chave: string, agora: Date = new Date()): AgenteInteligencia | null {
  return agentesInteligencia(agora).find((a) => a.chave === chave) ?? null;
}

// ---------------------------------------------------------------------------
// O mapa
// ---------------------------------------------------------------------------

export interface MapaInteligencia {
  nos: Array<{
    id: string;
    grupo: "numero" | "agente" | "validador" | "saida";
    x: number;
    y: number;
    titulo: string;
    subtitulo?: string;
    rodape?: string;
    estado: "ativo" | "inativo" | "neutro";
    /** para o nó de agente: qual glifo desenhar */
    glifo?: ChaveAgente;
    /** para o nó de validador: a foto */
    foto?: string;
    /** o agente que este nó abre */
    agente?: ChaveAgente;
  }>;
  ligacoes: Array<{ de: string; para: string; direta?: boolean }>;
  colunas: Array<{ rotulo: string; x: number }>;
  largura: number;
  altura: number;
  contagem: { numeros: number; agentes: number; ligados: number; conexoes: number };
}

const COL = [24, 300, 580, 860];
const LARGURA = COL[3] + 200 + 24;
const ALTURA = 462;

export function mapaInteligenciaEnsaio(agora: Date = new Date()): MapaInteligencia {
  const canais: CanalEnsaio[] = gerarCanaisEnsaio(agora).filter((c) => c.finalidade === "producao");
  const agentes = agentesInteligencia(agora);

  const nos: MapaInteligencia["nos"] = [
    ...canais.slice(0, 3).map((c, i) => ({
      id: c.canal_id,
      grupo: "numero" as const,
      x: COL[0],
      y: 58 + i * 120,
      titulo: c.apelido,
      subtitulo: c.numero_e164,
      rodape: `${c.conversas_7d} conversas · 7 d`,
      estado: (c.ativo ? "neutro" : "inativo") as "neutro" | "inativo",
    })),
    ...agentes.map((a, i) => ({
      id: `agente:${a.chave}`,
      grupo: "agente" as const,
      x: COL[1],
      y: 40 + i * 106,
      titulo: a.nome,
      subtitulo: a.papel,
      rodape: a.ativo ? a.numeros[0].valor + " execuções · 7 d" : situacaoTexto(a.situacao),
      estado: (a.ativo ? "ativo" : "inativo") as "ativo" | "inativo",
      glifo: a.chave,
      agente: a.chave,
    })),
    { id: "val:sara", grupo: "validador", x: COL[2], y: 94, titulo: SARA.nome, subtitulo: SARA.papel, estado: "neutro", foto: SARA.foto },
    { id: "val:coo", grupo: "validador", x: COL[2], y: 300, titulo: COO.nome, subtitulo: COO.papel, estado: "neutro", foto: COO.foto },
    { id: "saida:tarefa", grupo: "saida", x: COL[3], y: 40, titulo: "Tarefas", subtitulo: "tarefa_criada", rodape: "412 · 7 d", estado: "neutro" },
    { id: "saida:mensagem", grupo: "saida", x: COL[3], y: 148, titulo: "Mensagens", subtitulo: "mensagem_enviada", rodape: "1.842 · 7 d", estado: "neutro" },
    { id: "saida:proposta", grupo: "saida", x: COL[3], y: 300, titulo: "Propostas", subtitulo: "sugestao_ia", rodape: "esperando os dois", estado: "inativo" },
  ];

  const ligacoes: MapaInteligencia["ligacoes"] = [
    { de: "waba:1067455192551392", para: "agente:clara" },
    { de: "waba:1067455192551392", para: "agente:jarvis" },
    { de: "lite:sara", para: "agente:jarvis" },
    { de: "lite:ana-paula", para: "agente:jarvis" },
    { de: "agente:clara", para: "saida:mensagem", direta: true },
    { de: "agente:clara", para: "val:sara" },
    { de: "agente:jarvis", para: "saida:tarefa", direta: true },
    { de: "agente:jarvis", para: "val:sara" },
    { de: "agente:levindo", para: "val:coo" },
    { de: "agente:priscila", para: "val:coo" },
    { de: "val:sara", para: "saida:tarefa" },
    { de: "val:sara", para: "saida:mensagem" },
    { de: "val:coo", para: "saida:proposta" },
  ];

  return {
    nos,
    ligacoes,
    colunas: [
      { rotulo: "Números", x: COL[0] },
      { rotulo: "Agentes", x: COL[1] },
      { rotulo: "Quem valida", x: COL[2] },
      { rotulo: "O que sai", x: COL[3] },
    ],
    largura: LARGURA,
    altura: ALTURA,
    contagem: {
      numeros: canais.length,
      agentes: agentes.length,
      ligados: agentes.filter((a) => a.ativo).length,
      conexoes: ligacoes.length,
    },
  };
}

export function situacaoTexto(s: AgenteInteligencia["situacao"]): string {
  if (s === "ligado") return "Ativo";
  if (s === "esperando_credencial") return "Esperando credencial";
  return "Desligado";
}
