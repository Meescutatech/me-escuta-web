import type { CardLead } from "./funil";

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
}

export const FILTROS_VAZIOS: FiltrosFunil = {
  busca: "",
  responsaveis: [],
  etapas: [],
  tags: [],
  de: null,
  ate: null,
  meus: false,
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

export function filtrarCards(cards: CardLead[], f: FiltrosFunil, meuId: string | null = null): CardLead[] {
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

/** Há qualquer filtro (painel, busca OU meus)? — controla o "X de N leads ativos" do cabeçalho. */
export function haFiltro(f: FiltrosFunil): boolean {
  return f.busca.trim() !== "" || f.meus || contarFiltrosAtivos(f) > 0;
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
