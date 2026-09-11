/**
 * Lógica PURA do funil — sem I/O, testável com node --test (as queries ficam em funil.ts,
 * que é server-only e não importa em teste).
 */

/**
 * Teto da leitura do board. O banco já passou de 600 cards (import da Trilha A) e cresce;
 * bater no teto NUNCA pode virar descarte silencioso — lerFunil sinaliza `corte` e a UI avisa.
 * Se o board real chegar perto disso, o caminho é paginação/virtualização (rodada futura).
 */
export const TETO_CARDS = 2000;

/**
 * O board exibe as etapas de TRABALHO da config vigente (funil_vendas) — a leitura de cards filtra
 * por estas chaves no banco, então etapa marcada `no_board` ('arquivado') nunca entra no board nem
 * rouba vaga do teto.
 *
 * ── R23 · por que esta função tinha um `.map` onde devia ter um `.filter` ────────────────────
 * A versão anterior era `etapas.map((e) => e.chave)` — TODAS as chaves — e tanto o comentário
 * acima dela quanto o teste que a cobria afirmavam o contrário: que 'arquivado' nunca entrava.
 * As duas afirmações eram sobre uma config que o autor tinha em mente; a config vigente em
 * produção ganhou depois uma 15ª etapa `{chave:'arquivado', tipo:'arquivado', no_board:true}` com
 * 582 dos 679 leads dentro. Medido em 17/08/2026: o board carregava 679 cards (191,7 KB) e
 * renderizava uma coluna "Arquivado" com 582 deles; respeitando `no_board` são 97 (26,9 KB).
 *
 * A lição está no teste, não aqui: comentário e fixture são declaração sobre o que se imaginou;
 * só a config real diz o que o board vira. Ver `tests/funil.test.ts`, que agora usa a config de
 * produção como régua e falharia contra o código antigo.
 */
export function chavesDoBoard(etapas: Array<{ chave: string; no_board?: boolean }>): string[] {
  return etapas.filter((e) => e.no_board !== true).map((e) => e.chave);
}

/** As etapas que o board mostra como coluna — mesma regra de `chavesDoBoard`, objeto inteiro. */
export function etapasDoBoard<T extends { no_board?: boolean }>(etapas: T[]): T[] {
  return etapas.filter((e) => e.no_board !== true);
}

/** Leitura bateu no teto? (>= porque o PostgREST nunca devolve mais que o limit). */
export function houveCorte(qtdLida: number, teto: number): boolean {
  return qtdLida >= teto;
}

/*
 * ── R23 · Trilha E — o PLANO da busca no servidor ───────────────────────────────────────────
 *
 * A busca em si é I/O e mora em `funil.ts` (server-only). O que ela vai PERGUNTAR mora aqui, puro,
 * pelo mesmo motivo que as contas do dashboard moram em `dashboard-calculos.ts`: é a única forma
 * de um teste afirmar o que a consulta faz — e, mais importante, o que ela **não** faz.
 *
 * A propriedade que interessa é uma ausência: o plano não tem filtro de etapa. É exatamente isso
 * que permite achar os 582 leads em `arquivado`, que deixaram de ser coluna do board. Ausência não
 * se vê lendo código ("não está lá" é o que qualquer bug de omissão parece); mas se o plano é um
 * objeto, o teste consegue afirmar que ele não ganhou um campo de etapa.
 */

/** Teto do resultado da busca: uma lista, não um segundo board. `+1` é o detector de "há mais". */
export const TETO_BUSCA = 50;

/**
 * Mínimo de caracteres para ir ao banco. Abaixo disso a busca casaria com meio funil e a ida é
 * desperdício — o filtro do cliente já cobre o que está na tela.
 */
export const MINIMO_BUSCA = 2;

/** Colunas do card. As MESMAS do board: os dois caminhos têm que montar o mesmo card. */
export const COLUNAS_CARD_BASE =
  "lead_id,nome,telefone,etapa,entrou_etapa_em,valor,origem,dono,dono_id,dono_nome,tags,kommo_lead_id";

/**
 * R23/W2 · as TRÊS colunas de última mensagem do contrato travado em 22/08 (a migration é da
 * frente D1). Separadas do bloco base por um motivo operacional, não estético: se a migration
 * ainda não desceu, pedir coluna inexistente ao PostgREST derruba a consulta INTEIRA — e o board
 * não ficaria "sem a linha de mensagem", ficaria VAZIO. O chamador tenta com elas e, no erro,
 * repete só com a base (mesmo degrau de `COLUNAS_TAREFA_R13` → `R8` em lead-painel.ts).
 */
export const COLUNAS_ULTIMA_MENSAGEM = "ultima_mensagem_corpo,ultima_mensagem_em,ultima_mensagem_direcao";

export const COLUNAS_CARD = `${COLUNAS_CARD_BASE},${COLUNAS_ULTIMA_MENSAGEM}`;

/**
 * As três colunas de última mensagem do contrato → o objeto que o card desenha e que a ordem
 * "sem resposta" compara.
 *
 * ⚠️ Mora aqui, no módulo PURO, e não junto da consulta, por uma razão medida: enquanto esta
 * derivação viveu dentro de `montarCard` (server-only, sem teste possível), ela simplesmente NÃO
 * EXISTIA — a `v_lead_card` tinha 17 colunas e nenhuma de mensagem, o campo saía sempre
 * `undefined`, e a ordem "Sem resposta há mais tempo" comparava `undefined` com `undefined`, caía
 * no desempate e entregava ORDEM ALFABÉTICA DE UUID. Um menu que promete uma coisa e faz outra,
 * por meses, sem um teste que pudesse acusar.
 *
 * Exige corpo E data: mensagem sem data não serve nem para a linha ("que dia foi que ele mandou
 * isso") nem para o relógio, e data sem corpo desenharia uma linha em branco. `undefined` (e não
 * um objeto meio vazio) é o que faz o card não desenhar o bloco em vez de inventar conteúdo.
 *
 * A DIREÇÃO separa "ele não respondeu" de "eu não respondi" — sem ela a linha mostra atividade e
 * esconde a dívida. Direção desconhecida cai em "nos", o lado discreto: supor que fomos nós que
 * falamos por último NÃO cria alarme falso; supor o contrário criaria.
 */
export function montarUltimaMensagem(
  r: Record<string, unknown>,
): { texto: string; em: string; de: "cliente" | "nos" } | undefined {
  const bruto = r.ultima_mensagem_corpo;
  const texto = bruto == null ? "" : String(bruto).trim();
  const em = r.ultima_mensagem_em ? String(r.ultima_mensagem_em) : null;
  if (!texto || !em) return undefined;
  const dir = r.ultima_mensagem_direcao ? String(r.ultima_mensagem_direcao).toLowerCase() : null;
  return { texto, em, de: dir === "entrada" ? "cliente" : "nos" };
}

export interface PlanoBusca {
  colunas: string;
  /** Expressão do `.or()` do PostgREST — OR entre nome e telefone. */
  or: string;
  /** Sempre TETO_BUSCA + 1: o extra é o detector de truncamento. */
  limite: number;
}

/**
 * Escapa o que o PostgREST trata como ESTRUTURA dentro de um `or=(...)`: vírgula separa condições
 * e parêntese fecha o grupo. Sem isso, "Silva, Maria" vira duas condições — a query não quebra,
 * ela passa a perguntar outra coisa, que é o modo silencioso de errar.
 */
export function termoSeguro(termo: string): string {
  return termo.replace(/[(),*\\]/g, " ").trim();
}

/**
 * O que perguntar ao banco para achar um lead por nome ou telefone. `null` = termo curto demais,
 * não vale a ida.
 *
 * Telefone é guardado só em dígitos ("5527998316220" — conferido nas 628 linhas com telefone), então
 * uma busca digitada com máscara precisa virar dígitos antes de comparar. Mesma regra de `buscaCasa`
 * (funil-filtros.ts), e as duas TÊM que concordar: a faixa de achados e o board dividem a tela.
 */
export function planoBusca(termo: string, comUltimaMensagem = true): PlanoBusca | null {
  const limpo = termoSeguro(termo);
  if (limpo.length < MINIMO_BUSCA) return null;
  const condicoes = [`nome.ilike.*${limpo}*`, `telefone.ilike.*${limpo}*`];
  const digitos = limpo.replace(/[^0-9]/g, "");
  // 3+ dígitos: "(31) 99981" acha "3199981…". Abaixo disso o dígito solto casaria quase todo
  // telefone e só faria barulho.
  if (digitos.length >= 3 && digitos !== limpo) condicoes.push(`telefone.ilike.*${digitos}*`);
  return {
    colunas: comUltimaMensagem ? COLUNAS_CARD : COLUNAS_CARD_BASE,
    or: condicoes.join(","),
    limite: TETO_BUSCA + 1,
  };
}

/** Corta no teto e diz se havia mais — a UI pede refino em vez de fingir que mostrou tudo. */
export function recortarBusca<T>(linhas: T[]): { cards: T[]; truncado: boolean } {
  return { cards: linhas.slice(0, TETO_BUSCA), truncado: linhas.length > TETO_BUSCA };
}

// ─────────────── régua do funil (assinatura visual R9 — nas 3 telas) ───────────────

export type SegmentoRegua = "ok" | "atual" | "futura" | "fraca";

/**
 * Régua do lead (painel da conversa): 1 segmento por etapa ABERTA, preenchidas até a etapa
 * atual. Etapa fora da lista (ganho/perdido/desconhecida) → tudo "futura" (não inventar
 * progresso).
 */
export function segmentosReguaLead(
  etapasAbertas: Array<{ chave: string }>,
  etapaAtual: string | null,
): SegmentoRegua[] {
  const idx = etapaAtual ? etapasAbertas.findIndex((e) => e.chave === etapaAtual) : -1;
  return etapasAbertas.map((_, i) => (idx < 0 ? "futura" : i < idx ? "ok" : i === idx ? "atual" : "futura"));
}

/** Régua agregada (dashboard): etapa com lead = "ok"; vazia = "fraca"; contagem nula = "fraca". */
export function segmentosReguaAgregada(faixas: Array<{ qtd: number | null }>): SegmentoRegua[] {
  return faixas.map((f) => ((f.qtd ?? 0) > 0 ? "ok" : "fraca"));
}

// ─────────────── W-D6 (10/09) · a PRÓXIMA TAREFA do lead, e o que ela diz no card ───────────────

/**
 * Benchmark de tarefas (10/09) §4 item 1: o Pipedrive tem `next_activity_date`, o LiderHub tem o
 * card "Próxima atividade" — e o nosso board sabia só `tem_tarefa_pendente`, um booleano que joga
 * fora o QUAL. Aqui é a regra pura de "qual tarefa é a próxima", separada da consulta pelo mesmo
 * motivo de `montarUltimaMensagem`: enquanto viveu dentro de I/O, ninguém testou nada disto.
 */
export interface ProximaTarefa {
  id: string;
  titulo: string;
  /** ISO ou null — tarefa sem prazo é "próxima" só quando não há nenhuma com prazo. */
  prazo: string | null;
  /** uuid de core.usuario (Bloco A); null nas tarefas antigas e nas sem dono. */
  responsavel_id: string | null;
  /** legado (e-mail) — o dado forte é o id. */
  responsavel: string | null;
}

/**
 * A próxima entre as PENDENTES: prazo mais cedo primeiro (vencida é o mais cedo de todos),
 * sem prazo por último; desempate por id para ser estável entre renders. `null` = nenhuma
 * pendente — que é o estado "sem próxima ação", e é ALERTA, não silêncio (item 2 do §4).
 */
export function escolherProximaTarefa<
  T extends { id: string; status: string; prazo: string | null },
>(tarefas: T[]): T | null {
  let melhor: T | null = null;
  for (const t of tarefas) {
    if (t.status !== "pendente") continue;
    if (!melhor) {
      melhor = t;
      continue;
    }
    const a = t.prazo ? Date.parse(t.prazo) : NaN;
    const b = melhor.prazo ? Date.parse(melhor.prazo) : NaN;
    const aOk = !Number.isNaN(a);
    const bOk = !Number.isNaN(b);
    if (aOk && !bOk) melhor = t;
    else if (aOk && bOk && (a < b || (a === b && t.id < melhor.id))) melhor = t;
    else if (!aOk && !bOk && t.id < melhor.id) melhor = t;
  }
  return melhor;
}

export type EstadoPrazo = "vencida" | "hoje" | "futura" | "sem_prazo";

/**
 * Vermelho é FALHA, âmbar é URGÊNCIA, neutro é meta (LiderHub `highlight-activity-card.tsx`).
 * "Hoje" é o dia civil no fuso da operação (UTC-3, como o dashboard) — uma tarefa às 18h de hoje
 * ainda é "hoje" às 17h59, e vira "vencida" só depois de passar.
 */
const FUSO_OPERACAO_MS = -3 * 3_600_000;

function diaOperacao(ms: number): number {
  return Math.floor((ms + FUSO_OPERACAO_MS) / 86_400_000);
}

export function classificarPrazo(prazoIso: string | null | undefined, agora: number): EstadoPrazo {
  if (!prazoIso) return "sem_prazo";
  const t = Date.parse(prazoIso);
  if (Number.isNaN(t)) return "sem_prazo";
  if (t < agora) return "vencida";
  return diaOperacao(t) === diaOperacao(agora) ? "hoje" : "futura";
}

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * O prazo em UMA palavra + hora quando a hora muda a decisão ("hoje 14h", "amanhã 9h"). Para
 * mais de uma semana a hora é ruído e sai. Vencida diz há quanto tempo ("há 2d"), porque
 * "vencida em 08/09" obriga a fazer a conta que o card existe para poupar.
 */
export function textoPrazoCurto(prazoIso: string | null | undefined, agora: number): string {
  if (!prazoIso) return "sem prazo";
  const t = Date.parse(prazoIso);
  if (Number.isNaN(t)) return "sem prazo";
  const d = new Date(t);
  const hora = d.getMinutes() === 0 ? `${d.getHours()}h` : `${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}`;
  const diffDias = diaOperacao(t) - diaOperacao(agora);
  if (t < agora) {
    const h = Math.floor((agora - t) / 3_600_000);
    if (h < 1) return "venceu agora";
    if (h < 24) return `há ${h}h`;
    return `há ${Math.floor(h / 24)}d`;
  }
  if (diffDias === 0) return `hoje ${hora}`;
  if (diffDias === 1) return `amanhã ${hora}`;
  if (diffDias < 7) return `${DIAS_CURTOS[d.getDay()]} ${hora}`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * O que o cabeçalho da coluna diz além do nome: quantos, quanto vale e quantos estouraram o
 * prazo da etapa (faixa AGORA). `alemDoPrazo` conta sobre a faixa já calculada pelo board —
 * nunca recalcula a prioridade aqui (D55: uma conta, um lugar).
 */
export function resumoColuna<T extends { valor: number | null; lead_id: string }>(
  cards: T[],
  faixaDe: (c: T) => string,
): { qtd: number; soma: number; alemDoPrazo: number } {
  let soma = 0;
  let alemDoPrazo = 0;
  for (const c of cards) {
    soma += c.valor ?? 0;
    if (faixaDe(c) === "agora") alemDoPrazo++;
  }
  return { qtd: cards.length, soma, alemDoPrazo };
}

/** "R$ 42 mil" / "R$ 980" — a soma da coluna cabe em três palavras ou não cabe no cabeçalho. */
export function moedaCurta(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1_000) return `R$ ${Math.round(v / 1_000).toLocaleString("pt-BR")} mil`;
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}
