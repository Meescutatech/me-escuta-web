import { normalizarBusca, type FiltrosTarefas } from "@/lib/dados/tarefas-visao-calculos";

/**
 * PERGUNTAR AO JARVIS EM VEZ DE ARMAR O FILTRO (W-T v2, 11/09 — "eu melhoraria MUITO os filtros").
 *
 * A Sara não pensa em dimensões; ela pensa em perguntas: *"o que está vencido da Sara?"*, *"tarefas
 * de audiometria desta semana"*, *"o que o Jarvis criou hoje"*. Sete popovers respondem a isso em
 * sete cliques; uma frase responde em uma. O campo de busca vira o campo de pergunta, e a resposta
 * **não é uma lista mágica** — são os FILTROS APLICADOS, visíveis como chips, que ela pode remover
 * um a um. Foi isso que fez a funcionalidade caber aqui: ela é explicável e reversível.
 *
 * ── A regra que evita o pior defeito deste tipo de campo ──────────────────────────────────────
 * O que ele NÃO entendeu, ele DIZ. Nada é descartado em silêncio: termo que não virou filtro cai
 * na busca por texto (e a linha avisa), e dimensão que o sistema não tem — "criou hoje" não tem
 * filtro por data de criação — aparece em `naoSei`. Um campo que promete linguagem natural e
 * engole metade da frase ensina a pessoa a não confiar nele.
 *
 * Determinístico e local: é casamento de palavra, não modelo. Quando o Jarvis real responder por
 * aqui (F9, `/jarvis/perguntar`), esta função continua sendo o degrau — a tela já sabe desenhar
 * "entendi assim", e o que muda é quem preenche.
 */

export interface PessoaBusca {
  id: string;
  nome: string;
}

export interface TipoBusca {
  chave: string;
  rotulo: string;
}

export interface LeituraDaBusca {
  /** o que aplicar por cima dos filtros atuais */
  filtros: Partial<FiltrosTarefas>;
  /** o que ele entendeu, em português, para a linha "entendi assim" */
  entendi: string[];
  /** dimensões pedidas que o sistema não tem — ditas, nunca engolidas */
  naoSei: string[];
  /** o que sobrou da frase e virou busca por texto */
  texto: string;
}

/** frases que só existem para a pergunta soar humana — não carregam recorte */
const RUIDO = new Set([
  "o", "a", "os", "as", "de", "do", "da", "dos", "das", "que", "esta", "este", "essa", "esse", "em",
  "no", "na", "nos", "nas", "para", "pra", "com", "por", "e", "ou", "me", "mostra", "mostrar",
  "quero", "ver", "quais", "qual", "tem", "esta", "estao", "estao", "ta", "tao", "tarefa", "tarefas",
  "lista", "listar", "buscar", "busca", "sao", "foi", "foram", "ainda", "todas", "todos", "um", "uma",
]);

interface Regra {
  /** casa em qualquer lugar da frase normalizada */
  termos: string[];
  aplica: Partial<FiltrosTarefas>;
  rotulo: string;
}

const REGRAS: Regra[] = [
  { termos: ["vencid", "atrasad", "passou do prazo", "fora do prazo"], aplica: { vencidas: true, status: "abertas" }, rotulo: "vencidas" },
  { termos: ["sem prazo"], aplica: { prazo: "sem_prazo" }, rotulo: "sem prazo" },
  { termos: ["amanha"], aplica: { prazo: "amanha" }, rotulo: "até amanhã" },
  { termos: ["esta semana", "nesta semana", "da semana", "na semana", "semana"], aplica: { prazo: "semana" }, rotulo: "até o fim da semana" },
  { termos: ["hoje"], aplica: { prazo: "hoje" }, rotulo: "até hoje" },
  { termos: ["concluid", "finalizad", "feita", "feitas", "fechad"], aplica: { status: "concluidas", vencidas: false }, rotulo: "concluídas" },
  { termos: ["arquivad"], aplica: { status: "arquivadas", vencidas: false }, rotulo: "arquivadas" },
  { termos: ["jarvis"], aplica: { origem: "jarvis" }, rotulo: "criadas pelo Jarvis" },
  { termos: ["minhas", "minha", "meu", "meus", "pra mim", "para mim", "comigo"], aplica: { minhas: true, responsavelId: null }, rotulo: "minhas" },
  { termos: ["do time", "da equipe", "de todo mundo", "de todos"], aplica: { minhas: false, responsavelId: null }, rotulo: "de todo mundo" },
];

/** dimensões que a pergunta pode pedir e que o sistema não tem — ditas em vez de ignoradas */
const NAO_TENHO: { termos: string[]; diz: string }[] = [
  { termos: ["criou hoje", "criadas hoje", "criada hoje", "criou ontem"], diz: "filtrar por data de criação" },
  { termos: ["prioridade", "prioritari", "urgente"], diz: "filtrar por prioridade (ela ainda não existe no banco)" },
  { termos: ["etapa", "funil", "qualificando", "negociacao"], diz: "filtrar por etapa do funil a partir daqui" },
];

export function interpretarBusca(
  frase: string,
  ctx: { pessoas: PessoaBusca[]; tipos: TipoBusca[]; leads?: string[]; meuId?: string | null },
): LeituraDaBusca {
  const n = normalizarBusca(frase);
  const filtros: Partial<FiltrosTarefas> = {};
  const entendi: string[] = [];
  const naoSei: string[] = [];
  const consumido: string[] = [];

  const marcar = (termo: string) => consumido.push(termo);

  for (const { termos, diz } of NAO_TENHO) {
    const achou = termos.find((t) => n.includes(t));
    if (achou) {
      naoSei.push(diz);
      marcar(achou);
    }
  }

  for (const regra of REGRAS) {
    // prazo só é decidido UMA vez: "hoje" numa frase que já disse "esta semana" não reduz o recorte
    if (regra.aplica.prazo && filtros.prazo) continue;
    const achou = regra.termos.find((t) => n.includes(t));
    if (!achou) continue;
    Object.assign(filtros, regra.aplica);
    entendi.push(regra.rotulo);
    marcar(achou);
  }

  // pessoa: primeiro nome é como a casa chama ("da Sara", "do Rodolfo")
  for (const p of ctx.pessoas) {
    const primeiro = normalizarBusca(p.nome.split(/[\s@]+/)[0]);
    if (primeiro.length < 3 || !n.includes(primeiro)) continue;
    if (filtros.minhas) continue; // "minhas" já disse de quem
    filtros.responsavelId = p.id;
    filtros.minhas = false;
    entendi.push(`de ${p.nome.split(/[\s@]+/)[0]}`);
    marcar(primeiro);
    break;
  }

  // tipo: casa pelo rótulo inteiro ou por qualquer palavra dele com 5+ letras ("audiometria" não
  // é rótulo de tipo, mas "exame" e "serasa" são — e é assim que ela fala)
  for (const t of ctx.tipos) {
    const rot = normalizarBusca(t.rotulo);
    const palavras = rot.split(/[^a-z0-9]+/).filter((w) => w.length >= 5);
    const achou = n.includes(rot) ? rot : palavras.find((w) => n.includes(w));
    if (!achou) continue;
    filtros.tipo = t.chave;
    entendi.push(t.rotulo);
    marcar(achou);
    break;
  }

  // lead: o nome do paciente, como ele aparece na lista
  for (const nome of ctx.leads ?? []) {
    const primeiro = normalizarBusca(nome.split(/\s+/)[0]);
    if (primeiro.length < 4 || !n.includes(primeiro)) continue;
    if (filtros.responsavelId) break; // o nome já foi entendido como pessoa da equipe
    filtros.leadNome = nome;
    entendi.push(nome);
    marcar(primeiro);
    break;
  }

  // o que sobrou vira busca por texto — nada se perde em silêncio
  let resto = n;
  for (const c of consumido) resto = resto.split(c).join(" ");
  const texto = resto
    .split(/\s+/)
    .filter((w) => w.length > 2 && !RUIDO.has(w))
    .join(" ")
    .trim();
  if (texto) filtros.busca = texto;

  return { filtros, entendi, naoSei, texto };
}

/** a linha "entendi assim — N tarefas", já pronta para a tela */
export function fraseDoEntendi(l: LeituraDaBusca, quantas: number): string {
  const partes = [...l.entendi];
  if (l.texto) partes.push(`com “${l.texto}” no texto`);
  const alvo = `${quantas} ${quantas === 1 ? "tarefa" : "tarefas"}`;
  if (partes.length === 0) return `Procurei “${l.texto}” e achei ${alvo}.`;
  return `Entendi assim: ${partes.join(" · ")} — ${alvo}.`;
}
