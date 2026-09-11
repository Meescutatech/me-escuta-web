import type { CardLead } from "./funil";
import type { FaixaPrioridade } from "./funil-ordenacao";

/**
 * Filtros do board do FUNIL (paridade Kommo — GO 25/07): busca nome/telefone, responsável,
 * etapa, tags e período. Lógica PURA e client-safe — sem I/O, testável com node --test
 * (o componente não é testável no setup atual; o contrato mora aqui).
 *
 * Semântica travada na spec (SPEC-FILTROS-FUNIL.md):
 *  - AND entre dimensões, OR dentro de cada uma; dimensão vazia = tudo passa.
 *  - Período opera sobre `entrou_etapa_em` (a view não expõe criado_em do lead — proxy
 *    honesto, rotulado "Entrou na etapa" na UI), inclusivo nas duas pontas, fuso da
 *    operação (UTC-3 fixo, como o dashboard). Card sem data NÃO casa período definido.
 *  - Filtro roda sobre o recorte lido (TETO_CARDS + flag `corte`) — nunca finge completude.
 */

/** Sentinela de "sem responsável" (card sem chip exibível — dono null ou artefato de import). */
export const SEM_RESPONSAVEL = "__sem__";

const OFFSET_SP = "-03:00";

export interface FiltrosFunil {
  busca: string;
  /** nomes exibíveis (mesma derivação do chip do card) + SEM_RESPONSAVEL; [] = todos */
  responsaveis: string[];
  /** chaves de etapa; [] = todas */
  etapas: string[];
  /** OR entre as selecionadas; [] = todas */
  tags: string[];
  /** YYYY-MM-DD inclusivo (fuso da operação) — null = ponta aberta */
  de: string | null;
  ate: string | null;
  /** "meus leads" (0060): corta por dono_id === uuid do usuário logado — chip próprio, fora do painel */
  meus: boolean;
  /**
   * R20 · "sem próxima ação": lead ativo sem NENHUMA tarefa pendente. É a pergunta que expõe o
   * vazamento — no Kommo há 642 tarefas vencidas (58% de 1.091) e ninguém sabe quem está largado.
   *
   * Note a diferença de `vencida`, e ela é o ponto: tarefa vencida ao menos EXISTE e aparece em
   * vermelho para alguém. Lead sem tarefa nenhuma não aparece em lugar nenhum — some em silêncio.
   */
  semProximaAcao: boolean;
  /**
   * R23/W2 · "só os estourados": recorta para a faixa AGORA (razão ≥ 1 sobre o prazo da etapa).
   *
   * Por que ele existe: o board tem 97 cards e a Sarah tem meia manhã. Filtrar por cor é a versão
   * acionável da cor — sem isso, o vermelho informa e não ajuda a escolher.
   * Por que ele NÃO é "prazo estourado há mais de N dias": o limiar é a razão, e a razão já é
   * relativa ao prazo da etapa. Um segundo limiar aqui recriaria o problema que D55 resolveu.
   */
  soAgora: boolean;
  /**
   * W-D6 (10/09) · o segmented "Pré-venda · Pós-venda · Todos" do admin/owner. `null` = Todos.
   * É RECORTE do board, não escopo (o escopo é o seletor do header, D6-f): o admin olha o funil
   * inteiro e separa o que é aquisição do que é pós-venda com um clique, sem trocar de mundo.
   * Card com `departamento` desconhecido (`undefined`) PASSA — esconder por falta de dado é a
   * falha silenciosa que este filtro não pode cometer.
   */
  departamento: string | null;
}

export const FILTROS_VAZIOS: FiltrosFunil = {
  busca: "",
  responsaveis: [],
  etapas: [],
  tags: [],
  de: null,
  ate: null,
  meus: false,
  semProximaAcao: false,
  soAgora: false,
  departamento: null,
};

/**
 * Busca por nome OU telefone. Telefone ignora máscara: se a query tiver 3+ dígitos,
 * compara só-dígitos com só-dígitos ("99981" acha "(31) 99981-0000").
 */
export function buscaCasa(card: Pick<CardLead, "nome" | "telefone">, busca: string): boolean {
  const q = busca.trim().toLowerCase();
  if (!q) return true;
  if ((card.nome ?? "").toLowerCase().includes(q)) return true;
  const tel = (card.telefone ?? "").toLowerCase();
  if (tel.includes(q)) return true;
  const qDigitos = q.replace(/\D/g, "");
  return qDigitos.length >= 3 && tel.replace(/\D/g, "").includes(qDigitos);
}

/** Período inclusivo sobre timestamp ISO, no fuso da operação. Sem data → não casa período definido. */
export function dentroDoPeriodo(iso: string | null, de: string | null, ate: string | null): boolean {
  if (!de && !ate) return true;
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  if (de && t < Date.parse(`${de}T00:00:00.000${OFFSET_SP}`)) return false;
  if (ate && t > Date.parse(`${ate}T23:59:59.999${OFFSET_SP}`)) return false;
  return true;
}

/**
 * `faixaDe` chega de fora porque o filtro é PURO e não pode ler config nem relógio. Quem sabe
 * calcular a faixa (o board, que leu `sla_etapas`) passa a função; quem não sabe não oferece o
 * chip "só os estourados". Deixar o filtro adivinhar a faixa aqui seria repetir dentro do filtro
 * o limiar que D55 tirou do código.
 */
export function filtrarCards(
  cards: CardLead[],
  f: FiltrosFunil,
  meuId: string | null = null,
  faixaDe?: (c: CardLead) => FaixaPrioridade,
): CardLead[] {
  return cards.filter((c) => {
    // meus leads: vínculo por uuid, nunca por nome. Sem usuário logado, "meus" não casa nada
    // (honesto: não inventar carteira). Lead sem dono_id só aparece no filtro geral.
    if (f.meus && (meuId == null || c.dono_id !== meuId)) return false;
    if (!buscaCasa(c, f.busca)) return false;
    if (f.responsaveis.length > 0 && !f.responsaveis.includes(c.responsavel?.nome ?? SEM_RESPONSAVEL))
      return false;
    if (f.etapas.length > 0 && !f.etapas.includes(c.etapa)) return false;
    if (f.tags.length > 0 && !c.tags.some((t) => f.tags.includes(t))) return false;
    if (!dentroDoPeriodo(c.entrou_etapa_em, f.de, f.ate)) return false;
    // sem próxima ação: só corta quando SABEMOS que não há tarefa pendente. `null` = a leitura de
    // tarefas falhou, e aí o card PASSA — filtro que engole card por falha de leitura esconde
    // justamente o lead que o filtro existe para achar.
    if (f.semProximaAcao && c.tem_tarefa_pendente !== false) return false;
    // sem `faixaDe` o chip nem aparece na tela — e recortar sem saber calcular a faixa seria o
    // filtro afirmando uma urgência que ninguém mediu.
    if (f.soAgora && faixaDe && faixaDe(c) !== "agora") return false;
    // departamento: só corta quando o card SABE de qual é (`undefined` passa, ver o campo)
    if (f.departamento && c.departamento !== undefined && c.departamento !== f.departamento) return false;
    return true;
  });
}

/** Dimensões ativas do PAINEL (a busca fica no input próprio) — alimenta o badge do botão. */
export function contarFiltrosAtivos(f: FiltrosFunil): number {
  return (
    (f.responsaveis.length > 0 ? 1 : 0) +
    (f.etapas.length > 0 ? 1 : 0) +
    (f.tags.length > 0 ? 1 : 0) +
    (f.de || f.ate ? 1 : 0)
  );
}

/** Há qualquer filtro (painel, busca, meus OU sem-próxima-ação)? — controla o "X de N" do cabeçalho. */
export function haFiltro(f: FiltrosFunil): boolean {
  return (
    f.busca.trim() !== "" ||
    f.meus ||
    f.semProximaAcao ||
    f.soAgora ||
    f.departamento != null ||
    contarFiltrosAtivos(f) > 0
  );
}

/**
 * Quantos leads ativos estão sem próxima ação — o número do chip. `null` quando a leitura de
 * tarefas não veio: o chip mostra "—" em vez de "0", porque zero aqui é a melhor notícia possível
 * e inventá-la é o pior erro que este contador pode cometer.
 */
export function contarSemProximaAcao(cards: CardLead[]): number | null {
  if (cards.some((c) => c.tem_tarefa_pendente == null)) return null;
  return cards.filter((c) => c.tem_tarefa_pendente === false).length;
}

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
  qtd: number;
}

/**
 * Facetas de responsável derivadas dos cards carregados (não há catálogo no schema; sem FK
 * dono→usuário — migration 0009). Ordem: mais leads primeiro; "Sem responsável" por último.
 */
export function opcoesResponsavel(cards: CardLead[]): OpcaoFiltro[] {
  const contagem = new Map<string, number>();
  for (const c of cards) {
    const chave = c.responsavel?.nome ?? SEM_RESPONSAVEL;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  const semResp = contagem.get(SEM_RESPONSAVEL) ?? 0;
  contagem.delete(SEM_RESPONSAVEL);
  const opcoes = [...contagem.entries()]
    .map(([valor, qtd]) => ({ valor, rotulo: valor, qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  if (semResp > 0) opcoes.push({ valor: SEM_RESPONSAVEL, rotulo: "Sem responsável", qtd: semResp });
  return opcoes;
}

/** Facetas de tag (vocabulário = tags dos leads carregados). Mais usadas primeiro. */
export function opcoesTags(cards: CardLead[]): OpcaoFiltro[] {
  const contagem = new Map<string, number>();
  for (const c of cards) for (const t of c.tags) contagem.set(t, (contagem.get(t) ?? 0) + 1);
  return [...contagem.entries()]
    .map(([valor, qtd]) => ({ valor, rotulo: valor, qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** Liga/desliga um valor numa dimensão multi-select (imutável — vira setState direto). */
export function alternarValor(lista: string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}
