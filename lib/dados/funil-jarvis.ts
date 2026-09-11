import { FILTROS_VAZIOS, chaveCidade, type FiltrosFunil } from "./funil-filtros";
import type { EtapaFunil } from "./funil-etapas";

/*
 * W-D6 v4 (11/09 00:05) · A BUSCA QUE FALA COM O JARVIS.
 *
 * Diogo: "o Jarvis deve estar presente em todo o sistema". Aqui ele está na busca do funil — e o
 * desenho tem uma regra que decide tudo: **o Jarvis devolve FILTROS, não uma lista mágica.**
 * Perguntar "quem comprou aparelho e sumiu há mais de 5 dias" acende chips removíveis (etapa:
 * Ganho · parado há 5+ dias) e uma linha dizendo o que ele entendeu. A pessoa vê a interpretação,
 * corrige um chip, e a conta continua sendo a MESMA do board (`filtrarCards`). Uma lista opaca
 * seria o oposto da Constituição §1.2: o agente propõe, o humano confere.
 *
 * Este módulo é PURO — sem rede, sem React, sem relógio implícito. É o contrato que um teste pode
 * afirmar, e é onde a versão com LLM vai encaixar: quando houver chamada de verdade, ela devolve
 * este mesmo `LeituraJarvis` e a tela não muda. Em ensaio (e como degrau permanente, para quando a
 * chamada falhar) a leitura é por palavras-chave.
 *
 * O que ele NUNCA faz: inventar filtro que não entendeu. Frase sem nada reconhecido volta
 * `entendeu: false` com o que ele sabe procurar — e a busca por texto (nome/telefone) continua
 * valendo, porque é o caso mais comum e não precisa de interpretação nenhuma.
 */

export interface TermoLido {
  /** o que o Jarvis entendeu, em palavras da pessoa ("cidade: Belo Horizonte") */
  rotulo: string;
  /** o trecho da frase que gerou isto — a prova de que ele não inventou */
  trecho: string;
}

export interface LeituraJarvis {
  /** true quando ao menos UM filtro foi reconhecido */
  entendeu: boolean;
  /** os filtros a aplicar (já combinados com o estado atual pelo chamador) */
  filtros: Partial<FiltrosFunil>;
  termos: TermoLido[];
  /** frase curta do arco: "entendi assim" + o que ele leu */
  explicacao: string;
}

/** Frases de exemplo que FUNCIONAM — as sugestões ao focar o campo saem daqui. */
export const EXEMPLOS_JARVIS: string[] = [
  "quem comprou aparelho e sumiu há mais de 5 dias",
  "leads de BH sem tarefa",
  "tarefa vencida do meu nome",
  "veio de anúncio e ainda não fez audiometria",
  "acima de 10 mil parado há 3 dias",
  "leads sem responsável",
];

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Apelidos de cidade que a operação usa em voz alta. A lista de cidades REAIS vem do board. */
const APELIDOS_CIDADE: Record<string, string> = {
  bh: "belo horizonte",
  "beagá": "belo horizonte",
  "beaga": "belo horizonte",
};

/** Palavras que apontam para uma etapa, além do nome dela. */
const SINONIMOS_ETAPA: Record<string, string[]> = {
  ganho: ["comprou", "compraram", "fechou", "fecharam", "ganhou", "vendido", "venda fechada", "cliente"],
  perdido: ["perdeu", "perdemos", "desistiu", "desistiram"],
  proposta: ["proposta", "orcamento", "orçamento"],
  negociacao: ["negociacao", "negociando", "negociação"],
  avaliacao: ["avaliacao", "avaliação", "exame", "consulta"],
  qualificando: ["qualificando", "qualificacao", "qualificação"],
  novo: ["novo", "novos", "acabou de chegar", "chegaram hoje"],
};

const ORIGENS: Array<{ chave: string; termos: string[]; rotulo: string }> = [
  { chave: "meta", termos: ["anuncio", "anúncio", "meta", "facebook", "ads", "trafego", "tráfego"], rotulo: "Meta Ads" },
  { chave: "ind", termos: ["indicacao", "indicação", "indicado", "indicou"], rotulo: "Indicação" },
  { chave: "wa", termos: ["whatsapp", "whats", "zap"], rotulo: "WhatsApp" },
  { chave: "ig", termos: ["instagram", "insta"], rotulo: "Instagram" },
];

/** "10 mil" → 10000 · "8.900" → 8900 · "12k" → 12000. `null` quando não há número de dinheiro. */
function lerValor(t: string): { valor: number; trecho: string } | null {
  const m = t.match(/(?:acima de|mais de|a partir de|maior que)\s*(?:r\$\s*)?([\d.,]+)\s*(mil|k)?/);
  if (!m) return null;
  const bruto = Number(m[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(bruto)) return null;
  const valor = m[2] ? bruto * 1000 : bruto;
  // "acima de 5 dias" não é dinheiro: exige um piso plausível de valor de aparelho
  if (valor < 500) return null;
  return { valor, trecho: m[0].trim() };
}

/** "há mais de 5 dias" / "5 dias parado" / "sumiu há 3 dias" → 5 | 3. */
function lerDiasParado(t: string): { dias: number; trecho: string } | null {
  const m =
    t.match(/(?:sumiu|parado|parada|sem falar|sem resposta|nao responde|não responde)[^.]{0,24}?(\d+)\s*dias?/) ??
    t.match(/(?:ha|faz)\s*(?:mais de\s*)?(\d+)\s*dias?/) ??
    t.match(/(\d+)\s*dias?\s*(?:parado|sem resposta|sem falar)/);
  if (!m) return null;
  const dias = Number(m[1]);
  return Number.isFinite(dias) && dias > 0 ? { dias, trecho: m[0].trim() } : null;
}

/**
 * Lê a frase e devolve os filtros. `cidadesConhecidas` e `etapas` vêm do board — o Jarvis só
 * oferece o que existe no funil de verdade, nunca um vocabulário inventado.
 */
export function interpretarBusca(
  frase: string,
  contexto: { etapas: EtapaFunil[]; cidadesConhecidas: string[]; temUsuario: boolean },
): LeituraJarvis {
  const t = normalizar(frase).trim();
  const filtros: Partial<FiltrosFunil> = {};
  const termos: TermoLido[] = [];

  if (t.length < 3) {
    return { entendeu: false, filtros: {}, termos: [], explicacao: "" };
  }

  // ── cidade: apelidos primeiro, depois as cidades que o board conhece
  const cidades: string[] = [];
  for (const [apelido, cheio] of Object.entries(APELIDOS_CIDADE)) {
    if (new RegExp(`\\b${apelido}\\b`).test(t)) {
      const achada = contexto.cidadesConhecidas.find((c) => chaveCidade(c) === chaveCidade(cheio));
      if (achada && !cidades.includes(achada)) {
        cidades.push(achada);
        termos.push({ rotulo: `cidade: ${achada}`, trecho: apelido });
      }
    }
  }
  for (const c of contexto.cidadesConhecidas) {
    const k = chaveCidade(c);
    if (k && t.includes(k) && !cidades.includes(c)) {
      cidades.push(c);
      termos.push({ rotulo: `cidade: ${c}`, trecho: k });
    }
  }
  if (cidades.length > 0) filtros.cidades = cidades;

  // ── etapa: nome da config + sinônimos da fala
  const etapasLidas: string[] = [];
  for (const e of contexto.etapas) {
    const nome = normalizar(e.nome);
    const sinonimos = SINONIMOS_ETAPA[e.chave] ?? [];
    const casou =
      (nome.length > 3 && t.includes(nome)) ||
      sinonimos.some((s) => new RegExp(`\\b${normalizar(s)}`).test(t));
    if (casou && !etapasLidas.includes(e.chave)) {
      etapasLidas.push(e.chave);
      termos.push({ rotulo: `etapa: ${e.nome}`, trecho: e.nome.toLowerCase() });
    }
  }
  if (etapasLidas.length > 0) filtros.etapas = etapasLidas;

  // ── situação
  if (/\bsem tarefa|sem proxima acao|sem próxima ação|nenhuma tarefa|largado|abandonad/.test(t)) {
    filtros.semProximaAcao = true;
    filtros.comTarefa = false;
    termos.push({ rotulo: "sem próxima ação", trecho: "sem tarefa" });
  } else if (/\bcom tarefa|tem tarefa/.test(t)) {
    filtros.comTarefa = true;
    termos.push({ rotulo: "com tarefa pendente", trecho: "com tarefa" });
  }
  if (/vencid|atrasad|venceu/.test(t)) {
    filtros.tarefaVencida = true;
    termos.push({ rotulo: "tarefa vencida", trecho: "vencida" });
  }
  if (/\bsem (dono|responsavel|responsável)|ninguem cuida|ninguém cuida|orfao|órfão/.test(t)) {
    filtros.semResponsavel = true;
    termos.push({ rotulo: "sem responsável", trecho: "sem responsável" });
  }
  if (contexto.temUsuario && /\b(meu|meus|minha|minhas|comigo|do meu nome|pra mim|para mim)\b/.test(t)) {
    if (/tarefa/.test(t)) {
      filtros.minhasTarefas = true;
      termos.push({ rotulo: "minhas tarefas", trecho: "minhas" });
    } else {
      filtros.meus = true;
      termos.push({ rotulo: "meus leads", trecho: "meus" });
    }
  }
  if (/estourad|passou do prazo|fora do prazo|urgente|agora\b/.test(t)) {
    filtros.soAgora = true;
    termos.push({ rotulo: "além do prazo da etapa", trecho: "estourado" });
  }

  // ── audiometria (o gate) e "já usou aparelho" (tag real da operação)
  if (/audiometria|exame de audicao|exame de audição/.test(t)) {
    const negado = /(nao|não|sem|ainda nao|ainda não)\s*(fez|fizeram|tem|feita)?[^.]{0,12}audiometria|audiometria[^.]{0,12}(nao|não)\s*feita|sem audiometria/.test(t);
    filtros.audiometria = negado ? "nao_fez" : "fez";
    termos.push({ rotulo: negado ? "sem audiometria" : "fez audiometria", trecho: "audiometria" });
  }
  if (/ja usou aparelho|já usou aparelho|usa aparelho|usou aparelho/.test(t)) {
    filtros.tags = ["já usou aparelho"];
    termos.push({ rotulo: "tag: já usou aparelho", trecho: "usou aparelho" });
  }

  // ── origem
  //
  // ⚠️ POR LIMITE DE PALAVRA, e não `includes`. Medido em 11/09: "leads de BH sem tarefa na
  // proposta" acendia `origem: Meta Ads` — porque "le-ADS" contém "ads". Substring em vocabulário
  // curto é o modo de falha clássico deste tipo de leitor, e ele é pior que não entender: a tela
  // AFIRMA um recorte que a pessoa não pediu, com um chip que parece legítimo.
  for (const o of ORIGENS) {
    if (o.termos.some((x) => new RegExp(`\\b${normalizar(x)}\\b`).test(t))) {
      filtros.origens = [...(filtros.origens ?? []), o.chave];
      termos.push({ rotulo: `origem: ${o.rotulo}`, trecho: o.termos[0] });
      break; // uma origem por frase — "veio de anúncio ou indicação" é outra conversa
    }
  }

  // ── tempo e dinheiro
  const parado = lerDiasParado(t);
  if (parado) {
    filtros.paradoDiasMin = parado.dias;
    termos.push({ rotulo: `parado há ${parado.dias}+ dias`, trecho: parado.trecho });
  }
  const valor = lerValor(t);
  if (valor) {
    filtros.valorMin = valor.valor;
    termos.push({ rotulo: `acima de R$ ${valor.valor.toLocaleString("pt-BR")}`, trecho: valor.trecho });
  }

  const entendeu = termos.length > 0;
  return {
    entendeu,
    filtros,
    termos,
    explicacao: entendeu ? termos.map((x) => x.rotulo).join(" · ") : "",
  };
}

/**
 * Aplica a leitura sobre os filtros vigentes. A busca por texto é ZERADA quando o Jarvis entendeu:
 * a frase virou filtro, e deixá-la também como `ilike` no nome faria a tela devolver zero com
 * todos os chips certos na cara — o modo de falha mais confuso possível.
 */
export function aplicarLeitura(atual: FiltrosFunil, leitura: LeituraJarvis): FiltrosFunil {
  if (!leitura.entendeu) return atual;
  return { ...FILTROS_VAZIOS, departamento: atual.departamento, busca: "", ...leitura.filtros };
}

/** O que o Jarvis sabe procurar — a frase honesta de quando ele não entende. */
export const NAO_ENTENDI =
  "Não entendi essa. Tente por etapa, cidade, tempo parado, tarefa (vencida/sem), origem, valor ou audiometria.";
