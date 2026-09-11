import type { AvisoJarvis, ContextoJarvisTela } from "@/lib/jarvis/contexto";
import type { PassoJarvis, RespostaJarvis } from "@/lib/jarvis/resposta-tipos";

/**
 * O JARVIS POR TELA, EM ENSAIO (W-JX, 11/09/2026) — "pergunto no dashboard, ele me responde no
 * dashboard".
 *
 * Três coisas por tela, e as três alimentam o overlay ⌘J:
 *   `SUGESTOES_POR_TELA` — as perguntas que fazem sentido AQUI (aparecem no overlay vazio);
 *   `avisoDaTela`        — o que ele tem a dizer sobre ESTA tela, que é o que faz o dock piscar;
 *   `responderTela`      — a resposta específica da tela, com PASSOS (o trabalho aparecendo) e
 *                          AÇÕES (o que dá para fazer sem sair daqui).
 *
 * Fora do ensaio nada disto roda: quem responde é o proxy SSE do runtime (F9), e o aviso virá de
 * `core.sugestao_ia` — está no STATUS o que falta de banco.
 */

export const SUGESTOES_POR_TELA: Record<string, string[]> = {
  "/": ["Quantas conversas estão sem resposta?", "O que eu faço agora?", "Como está o funil esta semana?", "Quanto gastamos em mídia este mês?"],
  "/funil": ["Quais leads estão parados?", "Como está o funil esta semana?", "Quem está há mais tempo em Qualificado?"],
  "/conversas": ["O que o Jarvis sugere aqui?", "Quantas conversas estão sem resposta?", "O que ficou pendente com este paciente?"],
  "/tarefas": ["O que eu faço agora?", "Quais tarefas estão vencidas e de quem?", "Quais tarefas vencem hoje?"],
  "/marketing": ["Quanto gastamos em mídia este mês?", "Qual canal recebe mais mensagens?", "Quantos leads chegaram esta semana, por origem?"],
};

/** A tela mais específica que casa com a rota. */
function chaveDaRota(rota: string): string {
  if (rota === "/") return "/";
  const chaves = Object.keys(SUGESTOES_POR_TELA).filter((k) => k !== "/" && rota.startsWith(k));
  return chaves.sort((a, b) => b.length - a.length)[0] ?? rota;
}

export function sugestoesEnsaioDaTela(rota: string): string[] | null {
  return SUGESTOES_POR_TELA[chaveDaRota(rota)] ?? null;
}

/**
 * O que o Jarvis tem a dizer sobre a tela — em ensaio, enquanto as telas não registram o próprio
 * aviso por `useContextoJarvis({ aviso })`. É o que o dock mostra e o que o clique já pergunta.
 */
export function avisoEnsaioDaTela(rota: string): AvisoJarvis | null {
  switch (chaveDaRota(rota)) {
    case "/":
      // No dashboard os números JÁ estão na tela — repeti-los na pílula é ruído. O que o painel
      // não responde é a pergunta da Sara: por onde começar. É isso que ele oferece aqui.
      return {
        onde: "no dashboard",
        quantidade: null,
        texto: "por onde começar",
        previa: "Comece por Maria Aparecida: ela espera o endereço da clínica há 3 h e a audiometria é sexta.",
        pergunta: "O que eu faço agora?",
      };
    case "/conversas":
      return {
        onde: "nas conversas",
        quantidade: 4,
        texto: "sem resposta há mais de 2 h",
        previa: "Maria Aparecida (3 h), José Carlos (2 h 40), Dona Neusa (2 h 10) e Sebastiana.",
        pergunta: "Quantas conversas estão sem resposta?",
      };
    case "/tarefas":
      return {
        onde: "em tarefas",
        quantidade: 7,
        texto: "tarefas vencidas",
        previa: "Quatro são da Sara; a mais antiga venceu há 3 dias — o Pix do Antônio.",
        pergunta: "Quais tarefas estão vencidas e de quem?",
      };
    case "/funil":
      return {
        onde: "no funil",
        quantidade: 3,
        texto: "leads parados há 5+ dias",
        previa: "Terezinha, Geraldo e Antônio, todos travados em Qualificado.",
        pergunta: "Quais leads estão parados?",
      };
    case "/marketing":
      return {
        onde: "em marketing",
        quantidade: 36,
        texto: "leads sem origem",
        previa: "R$ 7.369 em mídia nos últimos 30 dias e 36 leads que ninguém sabe de onde vieram.",
        pergunta: "Quanto gastamos em mídia este mês?",
      };
    default:
      return null;
  }
}

/** Atalho para escrever passo sem repetir `estado`/`id`. */
export function passos(...linhas: Array<[texto: string, detalhe?: string, ms?: number]>): PassoJarvis[] {
  return linhas.map(([texto, detalhe, ms], i) => ({ id: `p${i + 1}`, texto, estado: "feito", detalhe: detalhe ?? null, ms: ms ?? null }));
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const tem = (s: string, ...t: string[]) => t.some((x) => s.includes(x));

/**
 * As respostas que só existem DENTRO de uma tela — porque dependem de onde a pessoa está ou do
 * item que ela tem aberto. Devolve `null` quando a pergunta é geral: aí responde o roteiro.
 */
export function responderTela(pergunta: string, contexto: ContextoJarvisTela | null, agora: Date): RespostaJarvis | null {
  if (!contexto) return null;
  const q = normalizar(pergunta);
  const em = agora.toISOString();
  const rota = chaveDaRota(contexto.rota);
  const nome = contexto.item?.rotulo ?? null;

  // "O que eu faço agora?" — a pergunta da Sara, e a razão do Jarvis existir
  if (tem(q, "faco agora", "faco primeiro", "o que fazer agora", "por onde comeco", "prioridade")) {
    return {
      em,
      consultas: [
        { nome: "consultar_tarefas", resumo: "42 abertas · 7 vencidas" },
        { nome: "consultar_conversa", resumo: "31 abertas · 4 sem resposta" },
      ],
      passos: passos(
        ["olhou suas tarefas abertas", "42 abertas, 7 vencidas — 4 são suas", 180],
        ["cruzou com as conversas sem resposta", "4 sem resposta nossa há mais de 2 h", 260],
        ["ordenou por quem espera há mais tempo", "Maria Aparecida lidera: 3 h esperando o endereço", 120],
      ),
      frase: "Comece por Maria Aparecida: ela espera o endereço da clínica há 3 h e a audiometria é sexta. Depois José Carlos, que perguntou se dá para testar o aparelho.",
      blocos: [
        {
          tipo: "acoes",
          rotulo: "Nesta ordem",
          itens: [
            { id: "f1", titulo: "Responder Maria Aparecida com o endereço da clínica", estado: "atencao", badge: "3 h esperando", href: "/conversas?c=c-0001" },
            { id: "f2", titulo: "Propor dois horários de teste para José Carlos", estado: "atencao", badge: "2 h 40", href: "/conversas?c=c-0002" },
            { id: "f3", titulo: "Ligar para Dona Neusa e explicar a regulagem", estado: "andamento", badge: "1 de 2 tentativas", href: "/conversas?c=c-0003" },
            { id: "f4", titulo: "Cobrar de Antônio o comprovante do Pix", estado: "atencao", badge: "vencida há 3 dias", href: "/tarefas?lead=l-0004" },
          ],
        },
      ],
      acoes: [
        { id: "a1", tipo: "abrir", rotulo: "Abrir a conversa da Maria", href: "/conversas?c=c-0001" },
        { id: "a2", tipo: "filtrar", rotulo: "Filtrar esta tela pelas vencidas", filtro: "filtro=vencidas" },
      ],
    };
  }

  // Dentro de uma conversa: "o que o Jarvis sugere aqui?" / "resuma esta conversa"
  if (rota === "/conversas" && tem(q, "sugere aqui", "sugere nesta", "resuma esta conversa", "resumo desta conversa", "ficou pendente", "o que falta aqui")) {
    const quem = nome ?? "este paciente";
    return {
      em,
      consultas: [{ nome: "consultar_conversa", resumo: `${quem} · 11 mensagens` }],
      passos: passos(
        [`leu as 11 mensagens com ${quem}`, "a última nossa foi há 3 h; a dela, há 12 min", 210],
        ["conferiu a ficha do lead", "audiometria marcada para sexta, 9h, clínica Savassi", 140],
        ["procurou tarefa aberta para este lead", "nenhuma — por isso a proposta abaixo", 90],
      ),
      frase: `${quem} perguntou o endereço da clínica e ninguém respondeu. A audiometria é sexta às 9h e a clínica pede confirmação 24 h antes.`,
      blocos: [
        { tipo: "linhas", itens: [{ texto: "“Moça, qual o endereço mesmo? Meu filho vai me levar” — há 3 h", href: "/conversas?c=c-0001", destino: "ver no fio" }] },
        {
          tipo: "acoes",
          rotulo: "O que está aberto",
          itens: [
            { id: "x1", titulo: "Responder o endereço e confirmar sexta às 9h", estado: "atencao", badge: "agora" },
            { id: "x2", titulo: "Registrar a confirmação na ficha", estado: "pendente", badge: "depois da resposta" },
          ],
        },
      ],
      acoes: [
        { id: "b1", tipo: "criar_tarefa", rotulo: "Criar tarefa para confirmar a audiometria", detalhe: `Ligar para ${quem} e confirmar a audiometria de sexta` },
        { id: "b2", tipo: "abrir", rotulo: "Abrir a ficha do lead", href: "/funil?lead=l-0001" },
      ],
    };
  }

  // No funil: "quais leads estão parados?"
  if (rota === "/funil" && tem(q, "parad", "travad", "mais tempo", "sem mexer")) {
    return {
      em,
      consultas: [{ nome: "consultar_funil", resumo: "40 leads em 10 etapas" }],
      passos: passos(
        ["listou os leads abertos do funil", "40 leads, 12 deles em Qualificado", 160],
        ["mediu o tempo desde a última mensagem", "3 passaram de 5 dias — o SLA da etapa é 24 h", 230],
      ),
      frase: "Três leads estão parados há mais de 5 dias, todos em Qualificado. Terezinha é a mais antiga: 6 dias sem mensagem nova.",
      blocos: [
        {
          tipo: "acoes",
          itens: [
            { id: "q1", titulo: "Terezinha Souza — “Vou ver com minha filha e te falo”", estado: "atencao", badge: "6 dias", href: "/funil?lead=l-0012" },
            { id: "q2", titulo: "Geraldo Nunes — pediu o laudo para o convênio", estado: "atencao", badge: "5 dias", href: "/funil?lead=l-0011" },
            { id: "q3", titulo: "Antônio Ferreira — disse que pagou, Asaas não registrou", estado: "atencao", badge: "5 dias", href: "/funil?lead=l-0004" },
          ],
        },
      ],
      acoes: [
        { id: "c1", tipo: "filtrar", rotulo: "Filtrar esta tela por Qualificado", filtro: "etapa=qualificado&ordem=parado" },
        { id: "c2", tipo: "criar_tarefa", rotulo: "Criar tarefa de retomada para os três", detalhe: "Retomar contato e oferecer dois horários de audiometria" },
      ],
    };
  }

  // Nas tarefas: "quais vencem hoje?"
  if (rota === "/tarefas" && tem(q, "vencem hoje", "hoje", "para hoje")) {
    return {
      em,
      consultas: [{ nome: "consultar_tarefas", resumo: "42 abertas · 5 vencem hoje" }],
      passos: passos(
        ["filtrou as tarefas com prazo de hoje", "5 tarefas, 3 suas", 170],
        ["conferiu quais já têm resposta no fio", "2 podem ser fechadas agora", 200],
      ),
      frase: "Cinco tarefas vencem hoje, três são suas. Duas já têm resposta do paciente no fio — dá para fechar as duas agora.",
      blocos: [
        {
          tipo: "acoes",
          itens: [
            { id: "h1", titulo: "Confirmar audiometria de sexta com Maria Aparecida", estado: "andamento", badge: "resposta no fio", href: "/conversas?c=c-0001" },
            { id: "h2", titulo: "Mandar o laudo em PDF para Geraldo Nunes", estado: "pendente", badge: "Ana Paula", href: "/tarefas?lead=l-0011" },
            { id: "h3", titulo: "Reenviar horário da consulta para Sebastiana", estado: "feito", badge: "feita 09:12" },
          ],
        },
      ],
      acoes: [{ id: "d1", tipo: "filtrar", rotulo: "Filtrar esta tela pelas de hoje", filtro: "prazo=hoje" }],
    };
  }

  return null;
}
