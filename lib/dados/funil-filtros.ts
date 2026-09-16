import type { CardLead } from "./funil";
import type { FaixaPrioridade } from "./funil-ordenacao";
import { variantesNonoDigito } from "./funil-calculos.ts";

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
  /**
   * W-D6 v3 (10/09 23:40) · os filtros que saíram do popover e foram para a BARRA:
   *  - `comTarefa`: só leads com tarefa pendente (o inverso de `semProximaAcao`; os dois juntos
   *    são um radio de três posições na barra — "Tarefas ▾");
   *  - `minhasTarefas`: só leads cuja PRÓXIMA tarefa é minha (`proxima_tarefa.responsavel_id`).
   *    É a próxima, não "qualquer tarefa minha" — o card só carrega a próxima, e é ela que a pessoa
   *    vai fazer;
   *  - `origens`: chaves de `Origem` (wa/ig/meta/ind), OR entre elas;
   *  - `cidades`: cidade DECLARADA (H5), OR, comparação sem caixa/acentos.
   */
  comTarefa: boolean;
  minhasTarefas: boolean;
  origens: string[];
  cidades: string[];
  /**
   * W-D6 v4 (11/09 00:05) · as dimensões que o Jarvis precisa saber APLICAR, e que o grupo
   * "Situação" mostra como checkbox:
   *  - `semResponsavel`: o que era carimbo no topo do board virou filtro (pedido do Diogo);
   *  - `tarefaVencida`: a próxima tarefa já passou do prazo — diferente de "sem próxima ação"
   *    (uma existe e está atrasada; a outra não existe), e é a diferença que o Kommo apagou;
   *  - `paradoDiasMin`: "sumiu há mais de 5 dias" — dias desde a ÚLTIMA MENSAGEM quando há, e
   *    desde a entrada na etapa quando não há (sem mensagem, o relógio que existe é o da etapa);
   *  - `valorMin`: "acima de 10 mil";
   *  - `audiometria`: o gate da Sara, em três estados (fez · não fez · tanto faz).
   */
  semResponsavel: boolean;
  tarefaVencida: boolean;
  paradoDiasMin: number | null;
  valorMin: number | null;
  audiometria: "fez" | "nao_fez" | null;
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
  comTarefa: false,
  minhasTarefas: false,
  origens: [],
  cidades: [],
  semResponsavel: false,
  tarefaVencida: false,
  paradoDiasMin: null,
  valorMin: null,
  audiometria: null,
};

/**
 * Há quantos dias este lead está PARADO. A última mensagem manda quando existe (é o relógio que a
 * Sara usa: "sumiu há 5 dias"); sem ela, vale a entrada na etapa. `null` = não dá para saber, e
 * card sem medida NUNCA é cortado por um filtro de tempo — seria acusar por falta de dado.
 */
export function diasParado(c: Pick<CardLead, "ultima_mensagem" | "entrou_etapa_em">, agora: number): number | null {
  const iso = c.ultima_mensagem?.em ?? c.entrou_etapa_em;
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((agora - t) / 86_400_000);
}

/** "Belo Horizonte" ≡ "belo horizonte" ≡ "Belo Horizonte " — cidade é o que a pessoa digitou. */
export function chaveCidade(c: string | null | undefined): string {
  return (c ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

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
  if (qDigitos.length < 3) return false;
  const telDigitos = tel.replace(/\D/g, "");
  if (telDigitos.includes(qDigitos)) return true;
  for (const v of variantesNonoDigito(qDigitos)) {
    if (telDigitos.includes(v)) return true;
  }
  return false;
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
  /** relógio — só é lido pelos filtros de tempo (`paradoDiasMin`, `tarefaVencida`) */
  agora: number = Date.now(),
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
    // com tarefa: o simétrico do "sem próxima ação", com a mesma honestidade — `null` passa
    if (f.comTarefa && c.tem_tarefa_pendente === false) return false;
    // minhas tarefas: a próxima é minha. Sem usuário, não casa nada (não inventar carteira).
    if (f.minhasTarefas && (meuId == null || c.proxima_tarefa?.responsavel_id !== meuId)) return false;
    if (f.origens.length > 0 && !f.origens.includes(c.origem ?? "")) return false;
    if (f.cidades.length > 0 && !f.cidades.map(chaveCidade).includes(chaveCidade(c.cidade))) return false;
    // sem responsável: o vínculo por uuid é a verdade (o texto legado do import não conta como dono)
    if (f.semResponsavel && c.dono_id != null) return false;
    // vencida: a próxima tarefa passou do prazo. `undefined` (não sabemos) passa; `null` (não tem
    // tarefa) NÃO passa — não ter tarefa é o outro filtro, e confundir os dois apagaria a diferença.
    if (f.tarefaVencida) {
      const prazo = c.proxima_tarefa?.prazo;
      if (c.proxima_tarefa === undefined) return true;
      const t = prazo ? Date.parse(prazo) : NaN;
      if (Number.isNaN(t) || t >= agora) return false;
    }
    if (f.paradoDiasMin != null) {
      const d = diasParado(c, agora);
      if (d != null && d < f.paradoDiasMin) return false;
    }
    if (f.valorMin != null && (c.valor ?? 0) < f.valorMin) return false;
    // audiometria: `undefined` (ficha não lida) passa — o card não afirma nada sobre o gate
    if (f.audiometria && c.audiometria !== undefined && c.audiometria !== f.audiometria) return false;
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
    f.comTarefa ||
    f.minhasTarefas ||
    f.origens.length > 0 ||
    f.cidades.length > 0 ||
    f.semResponsavel ||
    f.tarefaVencida ||
    f.paradoDiasMin != null ||
    f.valorMin != null ||
    f.audiometria != null ||
    contarFiltrosAtivos(f) > 0
  );
}

/**
 * W-D6 v3 · os CHIPS da linha de ativos, um por valor, cada um com o filtro que o remove. O rótulo
 * do responsável e da etapa chega resolvido por quem chama (o filtro guarda chave, a tela mostra
 * nome). A busca e o departamento NÃO viram chip: têm controle próprio sempre visível na barra.
 */
export interface ChipAtivo {
  chave: string;
  rotulo: string;
  remover: (f: FiltrosFunil) => FiltrosFunil;
}

export function chipsAtivos(
  f: FiltrosFunil,
  rotulos: { etapa: (chave: string) => string; origem: (chave: string) => string },
): ChipAtivo[] {
  const chips: ChipAtivo[] = [];
  if (f.meus) chips.push({ chave: "meus", rotulo: "Meus leads", remover: (x) => ({ ...x, meus: false }) });
  for (const r of f.responsaveis)
    chips.push({
      chave: `resp:${r}`,
      rotulo: r === SEM_RESPONSAVEL ? "Sem responsável" : r,
      remover: (x) => ({ ...x, responsaveis: x.responsaveis.filter((v) => v !== r) }),
    });
  for (const e of f.etapas)
    chips.push({ chave: `etapa:${e}`, rotulo: rotulos.etapa(e), remover: (x) => ({ ...x, etapas: x.etapas.filter((v) => v !== e) }) });
  for (const t of f.tags)
    chips.push({ chave: `tag:${t}`, rotulo: `#${t}`, remover: (x) => ({ ...x, tags: x.tags.filter((v) => v !== t) }) });
  if (f.comTarefa) chips.push({ chave: "comTarefa", rotulo: "Com tarefa", remover: (x) => ({ ...x, comTarefa: false }) });
  if (f.minhasTarefas) chips.push({ chave: "minhasTarefas", rotulo: "Minhas tarefas", remover: (x) => ({ ...x, minhasTarefas: false }) });
  if (f.semProximaAcao) chips.push({ chave: "semProximaAcao", rotulo: "Sem próxima ação", remover: (x) => ({ ...x, semProximaAcao: false }) });
  if (f.tarefaVencida) chips.push({ chave: "tarefaVencida", rotulo: "Tarefa vencida", remover: (x) => ({ ...x, tarefaVencida: false }) });
  if (f.semResponsavel) chips.push({ chave: "semResponsavel", rotulo: "Sem responsável", remover: (x) => ({ ...x, semResponsavel: false }) });
  if (f.paradoDiasMin != null)
    chips.push({ chave: "parado", rotulo: `Parado há ${f.paradoDiasMin}+ dias`, remover: (x) => ({ ...x, paradoDiasMin: null }) });
  if (f.valorMin != null)
    chips.push({ chave: "valorMin", rotulo: `Acima de R$ ${f.valorMin.toLocaleString("pt-BR")}`, remover: (x) => ({ ...x, valorMin: null }) });
  if (f.audiometria)
    chips.push({
      chave: "audiometria",
      rotulo: f.audiometria === "fez" ? "Fez audiometria" : "Sem audiometria",
      remover: (x) => ({ ...x, audiometria: null }),
    });
  if (f.soAgora) chips.push({ chave: "soAgora", rotulo: "Só os estourados", remover: (x) => ({ ...x, soAgora: false }) });
  if (f.de || f.ate)
    chips.push({
      chave: "periodo",
      rotulo: `Entrou ${f.de ? `de ${f.de.slice(8, 10)}/${f.de.slice(5, 7)}` : ""}${f.ate ? ` até ${f.ate.slice(8, 10)}/${f.ate.slice(5, 7)}` : ""}`.trim(),
      remover: (x) => ({ ...x, de: null, ate: null }),
    });
  for (const o of f.origens)
    chips.push({ chave: `origem:${o}`, rotulo: rotulos.origem(o), remover: (x) => ({ ...x, origens: x.origens.filter((v) => v !== o) }) });
  for (const c of f.cidades)
    chips.push({ chave: `cidade:${c}`, rotulo: c, remover: (x) => ({ ...x, cidades: x.cidades.filter((v) => v !== c) }) });
  return chips;
}

/** Tudo limpo, MENOS a busca e o departamento (controles próprios; "Limpar" é dos chips). */
export function limparChips(f: FiltrosFunil): FiltrosFunil {
  return { ...FILTROS_VAZIOS, busca: f.busca, departamento: f.departamento };
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

/** Facetas de origem (wa/ig/meta/ind) dos cards carregados. Mais leads primeiro. */
export function opcoesOrigem(cards: CardLead[]): OpcaoFiltro[] {
  const contagem = new Map<string, number>();
  for (const c of cards) if (c.origem) contagem.set(c.origem, (contagem.get(c.origem) ?? 0) + 1);
  return [...contagem.entries()].map(([valor, qtd]) => ({ valor, rotulo: valor, qtd })).sort((a, b) => b.qtd - a.qtd);
}

/** Facetas de cidade DECLARADA. Agrupa por `chaveCidade`, mostra a grafia mais frequente. */
export function opcoesCidade(cards: CardLead[]): OpcaoFiltro[] {
  const contagem = new Map<string, { rotulo: string; qtd: number }>();
  for (const c of cards) {
    const k = chaveCidade(c.cidade);
    if (!k) continue;
    const atual = contagem.get(k);
    if (atual) atual.qtd += 1;
    else contagem.set(k, { rotulo: (c.cidade ?? "").trim(), qtd: 1 });
  }
  return [...contagem.values()]
    .map((o) => ({ valor: o.rotulo, rotulo: o.rotulo, qtd: o.qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** Liga/desliga um valor numa dimensão multi-select (imutável — vira setState direto). */
export function alternarValor(lista: string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}
