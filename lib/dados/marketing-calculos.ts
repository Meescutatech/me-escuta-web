/**
 * Marketing — a logica PURA da tela (sem I/O), testavel com `node --test`.
 *
 * A tela responde a UMA pergunta do Fernando: de onde vem o lead, quanto custou e ate onde
 * chegou. Tudo aqui e composicao de linhas cruas de `core.captacao`, `core.custo_midia` e
 * `core.estado_lead`; quem le o banco entrega as linhas, quem desenha recebe a visao pronta.
 *
 * Regra que atravessa o arquivo: zero medido e `0`; leitura ausente e `null` (vira "—").
 * Gasto nunca e `0` quando ninguem ingeriu custo — e `null`, e a tela diz por que.
 */

// ─────────────────────────────── 1. linhas cruas ───────────────────────────────

/** Uma linha de `core.captacao`. Um toque, nao um lead: o mesmo lead pode ter varios. */
export interface ToqueCru {
  lead_id: string;
  fonte: string;
  plataforma: string | null;
  campanha_id: string | null;
  campanha_nome: string | null;
  anuncio_id: string | null;
  anuncio_nome: string | null;
  /** `{source, medium, campaign, content, term, cidade, cidade_procedencia}`. */
  utm: Record<string, string | null> | null;
  /** `{gclid, fbclid, ctwa_clid}` - chave ausente e ausente, nunca string vazia. */
  clids: Record<string, string | null> | null;
  /** `resolvida` | `falhou` | `nao_aplicavel`. */
  hierarquia_estado: string;
  /** Quando a fonte registrou. Pode ser nulo. */
  capturado_em: string | null;
  /** Quando o ledger recebeu. Nunca nulo. */
  criado_em: string;
}

/** Uma linha de `core.custo_midia`. Grao = dia x plataforma x campanha. */
export interface CustoCru {
  dia: string; // "YYYY-MM-DD"
  plataforma: string;
  campanha_id: string;
  campanha_nome: string | null;
  /** `numeric(12,2)` chega como string no PostgREST - normalizado por `dinheiro()`. */
  custo: number | string;
  impressoes: number | null;
  cliques: number | null;
  ingerido_em: string;
}

/** Uma fonte do vocabulario `canal_captacao` v2 (config, nunca literal em codigo). */
export interface FonteVocabulario {
  chave: string;
  rotulo: string;
  ativo: boolean;
  /** `null` e um VALOR: `landing`/`tintim` recebem pago E organico pela mesma chave. */
  pago_organico: "pago" | "organico" | null;
  plataforma: "meta" | "google" | "outro" | null;
}

/** A etapa ATUAL de um lead (`core.estado_lead`). */
export interface EtapaLeadCru {
  lead_id: string;
  etapa: string;
}

/** Uma etapa do `funil_vendas` vigente — so o que o funil por origem precisa. */
export interface EtapaConfig {
  chave: string;
  nome: string;
  ordem: number;
  tipo: "aberto" | "ganho" | "perdido" | "arquivado";
}

// ─────────────────────────────── 2. formatos ───────────────────────────────

export function dinheiro(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** `numerador/denominador`, ou `null` quando o denominador e zero: 0/0 nao mede nada. */
export function taxa(numerador: number | null, denominador: number | null): number | null {
  if (numerador == null || denominador == null) return null;
  if (denominador === 0) return null;
  return numerador / denominador;
}

export function pct(t: number | null): string {
  if (t == null) return "—";
  return `${(t * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
}

export function brl(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function inteiro(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("pt-BR");
}

// ─────────────────────────────── 3. datas ───────────────────────────────

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

/** "YYYY-MM-DD" de um instante no fuso da operacao (UTC-3 fixo). */
export function diaSP(iso: string): string {
  return new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** "seg 20/07" a partir de "2026-07-20". */
export function rotuloDia(ymd: string): string {
  const [ano, mes, dia] = ymd.split("-").map(Number);
  const semana = DIAS_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()];
  return `${semana} ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

/** "20/07" a partir de "2026-07-20". */
export function ddmm(ymd: string): string {
  const [, mes, dia] = ymd.split("-");
  return `${dia}/${mes}`;
}

export function somarDias(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function hojeSP(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** Todos os dias de `[ini, fim)` - inclusive os vazios, que a serie precisa mostrar. */
export function diasDoPeriodo(ini: string, fim: string): string[] {
  const dias: string[] = [];
  const d = new Date(`${ini}T12:00:00Z`);
  const limite = new Date(`${fim}T12:00:00Z`);
  while (d < limite && dias.length < 400) {
    dias.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dias;
}

// ─────────────────────────────── 4. periodo ───────────────────────────────

export interface Periodo {
  /** "YYYY-MM-DD" inclusivo. */
  ini: string;
  /** "YYYY-MM-DD" EXCLUSIVO - `>= ini and < fim`. */
  fim: string;
  rotulo: string;
  /** Chave do preset quando o periodo veio de um; `null` para intervalo livre. */
  preset: "7d" | "30d" | "90d" | null;
}

const RE_YMD = /^\d{4}-\d{2}-\d{2}$/;

export const PRESETS = [
  { chave: "7d", rotulo: "7 dias", dias: 7 },
  { chave: "30d", rotulo: "30 dias", dias: 30 },
  { chave: "90d", rotulo: "90 dias", dias: 90 },
] as const;

/** O periodo pedido pela URL. `?de=&ate=` manda; senao `?p=30d`; senao 30 dias. */
export function periodoDaUrl(
  params: { de?: string; ate?: string; p?: string } = {},
  agora: Date = new Date(),
): Periodo {
  const hoje = hojeSP(agora);
  if (params.de && params.ate && RE_YMD.test(params.de) && RE_YMD.test(params.ate) && params.de <= params.ate) {
    return {
      ini: params.de,
      fim: somarDias(params.ate, 1),
      rotulo: `${ddmm(params.de)} a ${ddmm(params.ate)}`,
      preset: null,
    };
  }
  const preset = PRESETS.find((x) => x.chave === params.p) ?? PRESETS[1];
  const ini = somarDias(hoje, -(preset.dias - 1));
  return { ini, fim: somarDias(hoje, 1), rotulo: `${ddmm(ini)} a ${ddmm(hoje)}`, preset: preset.chave };
}

// ─────────────────────────────── 5. classificacao do toque ───────────────────────────────

export type Balde = "pago" | "organico" | "nao_classificado";
export type Plataforma = "meta" | "google" | "outro" | "sem_plataforma";

export const ROTULO_BALDE: Record<Balde, string> = {
  pago: "Pago",
  organico: "Organico",
  nao_classificado: "Nao classificado",
};

export const ROTULO_PLATAFORMA: Record<Plataforma, string> = {
  meta: "Meta",
  google: "Google",
  outro: "Outra plataforma",
  sem_plataforma: "Sem plataforma",
};

export function indexarVocabulario(fontes: FonteVocabulario[]): Map<string, FonteVocabulario> {
  return new Map(fontes.map((f) => [f.chave, f]));
}

/** Os identificadores de clique que so existem quando houve midia PAGA. */
const CLIDS_PAGOS = ["gclid", "fbclid", "ctwa_clid"] as const;

/**
 * O toque carrega evidencia de clique pago? Trata vazio e espaco como ausencia: a coluna `clids`
 * promete "chave ausente e ausente, nunca string vazia", mas a promessa e do ESCRITOR, e a tela
 * nao pode depender de promessa de terceiro para nao mentir.
 */
function temClickPago(t: ToqueCru): boolean {
  const c = t.clids;
  if (!c) return false;
  return CLIDS_PAGOS.some((k) => (c[k] ?? "").trim() !== "");
}

/**
 * Pago/organico vem da CONFIG (`canal_captacao`) — e, quando a config diz `null`, do TOQUE.
 *
 * ⭐ `null` na config NAO e ausencia de decisao. A propria config declara isso:
 *   "nulo_significa": "a FONTE nao determina este eixo; quem determina e o toque (gclid/fbclid)"
 * `landing` e `tintim` recebem trafego pago E organico pela MESMA chave de fonte, entao so o
 * toque desempata. O codigo lia apenas a primeira metade da regra, e por isso lead do Google via
 * Tintim — COM `gclid` gravado — caia em "nao classificado". Medido em producao em 08/09/2026.
 *
 * 🔴 Ausencia de click id continua `nao_classificado`, e isso e DECISAO, nao preguica: nao ter
 * `gclid` nao prova organico, prova que nao sabemos. Promover a "organico" faria a tela AFIRMAR
 * uma origem que ninguem mediu — o defeito que este modulo existe para nao repetir.
 */
export function baldeDoToque(t: ToqueCru, vocab: Map<string, FonteVocabulario>): Balde {
  const daFonte = vocab.get(t.fonte)?.pago_organico;
  if (daFonte) return daFonte;
  return temClickPago(t) ? "pago" : "nao_classificado";
}

/** A plataforma vem da coluna da captacao, com a config como rede. */
export function plataformaDoToque(t: ToqueCru, vocab: Map<string, FonteVocabulario>): Plataforma {
  const p = t.plataforma ?? vocab.get(t.fonte)?.plataforma ?? null;
  if (p === "meta" || p === "google" || p === "outro") return p;
  return "sem_plataforma";
}

/** Primeiro toque de cada lead no periodo — a ORIGEM do lead e o toque mais antigo. */
export function primeiroToquePorLead(toques: ToqueCru[]): Map<string, ToqueCru> {
  const mapa = new Map<string, ToqueCru>();
  for (const t of toques) {
    const atual = mapa.get(t.lead_id);
    const instante = t.capturado_em ?? t.criado_em;
    if (!atual || instante < (atual.capturado_em ?? atual.criado_em)) mapa.set(t.lead_id, t);
  }
  return mapa;
}

// ─────────────────────────────── 6. a arvore de origem ───────────────────────────────

export type NivelOrigem = "balde" | "plataforma" | "campanha" | "anuncio";

export const SEM_CAMPANHA = "__sem_campanha__";

export interface NoOrigem {
  nivel: NivelOrigem;
  chave: string;
  rotulo: string;
  /** Leads distintos cuja origem (primeiro toque) cai neste no. */
  leads: number;
  /** Fracao do total de leads do periodo. */
  fracao: number | null;
  /** Gasto casado a este no; `null` quando nao ha custo ingerido para ele. */
  gasto: number | null;
  /** Custo por lead: `gasto / leads`; `null` sem gasto ou sem lead. */
  cpl: number | null;
  /** Cidades da segmentacao vistas neste no (so em campanha/anuncio). */
  cidades: string[];
  /** Balde e plataforma a que o no pertence (para pintar a marca). */
  balde: Balde;
  plataforma: Plataforma | null;
  filhos: NoOrigem[];
}

interface Acc {
  no: NoOrigem;
  leads: Set<string>;
  cidades: Set<string>;
  filhos: Map<string, Acc>;
}

function novoAcc(nivel: NivelOrigem, chave: string, rotulo: string, balde: Balde, plataforma: Plataforma | null): Acc {
  return {
    no: { nivel, chave, rotulo, leads: 0, fracao: null, gasto: null, cpl: null, cidades: [], balde, plataforma, filhos: [] },
    leads: new Set(),
    cidades: new Set(),
    filhos: new Map(),
  };
}

function filho(pai: Acc, nivel: NivelOrigem, chave: string, rotulo: string, balde: Balde, plataforma: Plataforma | null): Acc {
  let f = pai.filhos.get(chave);
  if (!f) {
    f = novoAcc(nivel, chave, rotulo, balde, plataforma);
    pai.filhos.set(chave, f);
  }
  return f;
}

const ORDEM_BALDE: Balde[] = ["pago", "organico", "nao_classificado"];
const ORDEM_PLATAFORMA: Plataforma[] = ["meta", "google", "outro", "sem_plataforma"];

/**
 * Gasto agregado por `plataforma + campanha_id` (as DUAS metades da chave: um id do Meta nao
 * casa com um do Google). Separador `\u0000` escrito como escape — nenhum id o contem.
 */
export function gastoPorCampanha(custos: CustoCru[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const c of custos) {
    if (!c.plataforma || !c.campanha_id) continue;
    const k = `${c.plataforma}\u0000${c.campanha_id}`;
    mapa.set(k, (mapa.get(k) ?? 0) + dinheiro(c.custo));
  }
  return mapa;
}

/**
 * A hierarquia: balde -> plataforma -> campanha -> anuncio. Cada lead conta UMA vez, no no
 * do seu primeiro toque. Gasto entra no no de campanha e sobe agregado; CPL so onde ha gasto.
 */
export function arvoreOrigem(
  toques: ToqueCru[],
  custos: CustoCru[],
  vocab: Map<string, FonteVocabulario>,
): NoOrigem[] {
  const raiz = novoAcc("balde", "__raiz__", "", "pago", null);
  const origens = primeiroToquePorLead(toques);

  for (const t of origens.values()) {
    const balde = baldeDoToque(t, vocab);
    const nBalde = filho(raiz, "balde", balde, ROTULO_BALDE[balde], balde, null);
    nBalde.leads.add(t.lead_id);

    // Organico nao tem plataforma nem campanha: a arvore para no balde, com a FONTE como filho.
    if (balde === "organico") {
      const fonte = filho(nBalde, "plataforma", t.fonte, vocab.get(t.fonte)?.rotulo ?? t.fonte, balde, null);
      fonte.leads.add(t.lead_id);
      continue;
    }

    const plat = plataformaDoToque(t, vocab);
    const nPlat = filho(nBalde, "plataforma", plat, ROTULO_PLATAFORMA[plat], balde, plat);
    nPlat.leads.add(t.lead_id);

    // Cidade vem de `utm.cidade`, que hoje NENHUM projetor escreve (0201: "NAO escreve cidade").
    // Com dado real a arvore vem sem cidade ate a borda gravar isso; so a fixture de ensaio a mostra.
    const cidade = t.utm?.cidade ?? null;
    const campChave = t.campanha_id ?? SEM_CAMPANHA;
    const nCamp = filho(nPlat, "campanha", campChave, t.campanha_nome ?? t.campanha_id ?? "Sem campanha", balde, plat);
    nCamp.leads.add(t.lead_id);
    if (cidade) nCamp.cidades.add(cidade);

    if (t.anuncio_id) {
      const nAn = filho(nCamp, "anuncio", t.anuncio_id, t.anuncio_nome ?? t.anuncio_id, balde, plat);
      nAn.leads.add(t.lead_id);
      if (cidade) nAn.cidades.add(cidade);
    }
  }

  // Campanhas com gasto e sem lead tem de EXISTIR: e o dinheiro que nao trouxe ninguem.
  const gastos = gastoPorCampanha(custos);
  const nomes = new Map<string, string>();
  for (const c of custos) if (c.campanha_nome) nomes.set(`${c.plataforma}\u0000${c.campanha_id}`, c.campanha_nome);
  for (const [k, g] of gastos) {
    const [plat, campId] = k.split("\u0000");
    const p: Plataforma = plat === "meta" || plat === "google" ? plat : "outro";
    const nBalde = filho(raiz, "balde", "pago", ROTULO_BALDE.pago, "pago", null);
    const nPlat = filho(nBalde, "plataforma", p, ROTULO_PLATAFORMA[p], "pago", p);
    const nCamp = filho(nPlat, "campanha", campId, nomes.get(k) ?? campId, "pago", p);
    nCamp.no.gasto = g;
  }

  const total = origens.size;
  const ordemDe = (a: Acc) =>
    a.no.nivel === "balde"
      ? ORDEM_BALDE.indexOf(a.no.chave as Balde)
      : a.no.nivel === "plataforma" && a.no.plataforma
        ? ORDEM_PLATAFORMA.indexOf(a.no.plataforma)
        : -1;

  const materializar = (a: Acc): NoOrigem => {
    const filhos = [...a.filhos.values()].map(materializar);
    // Gasto sobe: o no e a soma dos filhos quando ele mesmo nao tem gasto proprio.
    const gastoFilhos = filhos.reduce<number | null>((s, f) => (f.gasto == null ? s : (s ?? 0) + f.gasto), null);
    const gasto = a.no.gasto ?? gastoFilhos;
    const leads = a.leads.size;
    filhos.sort((x, y) => {
      const ox = ordemDe(a.filhos.get(x.chave)!);
      const oy = ordemDe(a.filhos.get(y.chave)!);
      if (ox !== oy && ox >= 0 && oy >= 0) return ox - oy;
      return y.leads - x.leads || (y.gasto ?? -1) - (x.gasto ?? -1) || x.rotulo.localeCompare(y.rotulo);
    });
    return {
      ...a.no,
      leads,
      fracao: taxa(leads, total),
      gasto,
      cpl: gasto != null && leads > 0 ? gasto / leads : null,
      cidades: [...a.cidades].sort(),
      filhos,
    };
  };

  return materializar(raiz).filhos;
}

/** Percorre a arvore e devolve os nos de um nivel (util para tabela e testes). */
export function nosDoNivel(arvore: NoOrigem[], nivel: NivelOrigem): NoOrigem[] {
  const saida: NoOrigem[] = [];
  const andar = (n: NoOrigem) => {
    if (n.nivel === nivel) saida.push(n);
    n.filhos.forEach(andar);
  };
  arvore.forEach(andar);
  return saida;
}

// ─────────────────────────────── 7. leads por dia ───────────────────────────────

export interface PontoSerie {
  dia: string;
  rotulo: string;
  /** Leads (primeiro toque) por plataforma paga, e organico. */
  meta: number;
  google: number;
  organico: number;
  /** Outra plataforma paga + nao classificado. */
  outros: number;
  total: number;
}

export function serieLeadsPorDia(
  toques: ToqueCru[],
  vocab: Map<string, FonteVocabulario>,
  ini: string,
  fim: string,
): PontoSerie[] {
  const porDia = new Map<string, PontoSerie>();
  for (const dia of diasDoPeriodo(ini, fim)) {
    porDia.set(dia, { dia, rotulo: rotuloDia(dia), meta: 0, google: 0, organico: 0, outros: 0, total: 0 });
  }
  for (const t of primeiroToquePorLead(toques).values()) {
    if (!t.capturado_em) continue;
    const p = porDia.get(diaSP(t.capturado_em));
    if (!p) continue;
    const balde = baldeDoToque(t, vocab);
    if (balde === "organico") p.organico += 1;
    else if (balde === "pago") {
      const plat = plataformaDoToque(t, vocab);
      if (plat === "meta") p.meta += 1;
      else if (plat === "google") p.google += 1;
      else p.outros += 1;
    } else p.outros += 1;
    p.total += 1;
  }
  return [...porDia.values()];
}

// ─────────────────────────────── 8. funil por origem ───────────────────────────────

/**
 * Os tres marcos do Fernando. Candidatos por marco, resolvidos contra o `funil_vendas`
 * VIGENTE — a chave que existir na config e a que vale; nenhuma e inventada.
 */
export const CANDIDATOS_MARCO = {
  qualificado: ["qualificado", "qualificando"],
  // Consulta e consulta: audiometria so entra se o funil vigente nao tiver etapa de consulta
  // (o funil de producao tem `consulta_agendada` e `consulta_realizada`).
  consulta: ["consulta_realizada", "consulta_agendada", "consulta", "avaliacao", "audiometria_realizada"],
  venda: ["ganho", "venda", "vendido"],
} as const;

export type Marco = keyof typeof CANDIDATOS_MARCO;
export const MARCOS: Marco[] = ["qualificado", "consulta", "venda"];
export const ROTULO_MARCO: Record<Marco, string> = { qualificado: "Qualificado", consulta: "Consulta", venda: "Venda" };

export interface MarcosResolvidos {
  /** `ordem` minima da etapa que conta como o marco; `null` = o funil vigente nao tem essa etapa. */
  ordem: Record<Marco, number | null>;
  chave: Record<Marco, string | null>;
  /** Nome da etapa resolvida, para o cabecalho da tela nunca mentir sobre o que conta. */
  nome: Record<Marco, string | null>;
}

export function resolverMarcos(etapas: EtapaConfig[]): MarcosResolvidos {
  const ordem: Record<Marco, number | null> = { qualificado: null, consulta: null, venda: null };
  const chave: Record<Marco, string | null> = { qualificado: null, consulta: null, venda: null };
  const nome: Record<Marco, string | null> = { qualificado: null, consulta: null, venda: null };
  for (const m of MARCOS) {
    for (const cand of CANDIDATOS_MARCO[m]) {
      const e = etapas.find((x) => x.chave === cand);
      if (e) {
        ordem[m] = e.ordem;
        chave[m] = e.chave;
        nome[m] = e.nome;
        break;
      }
    }
    // Venda tambem e qualquer etapa de tipo `ganho`, se nenhum candidato bateu.
    if (m === "venda" && ordem[m] == null) {
      const g = etapas.find((x) => x.tipo === "ganho");
      if (g) {
        ordem[m] = g.ordem;
        chave[m] = g.chave;
        nome[m] = g.nome;
      }
    }
  }
  return { ordem, chave, nome };
}

export interface LinhaFunilOrigem {
  chave: string;
  rotulo: string;
  balde: Balde;
  plataforma: Plataforma | null;
  leads: number;
  /** Leads cuja etapa atual esta no marco ou alem (snapshot: e "chegou ate", nao "esta em"). */
  marcos: Record<Marco, number | null>;
  taxas: Record<Marco, number | null>;
  perdidos: number;
}

/**
 * Por origem (plataforma paga, ou organico), quantos leads chegaram a cada marco.
 * Le a etapa ATUAL: um lead em `proposta` ja passou por `qualificado`, entao conta la.
 * Perdido nao conta em marco nenhum — nao se sabe onde parou; fica em coluna propria.
 */
export function funilPorOrigem(
  toques: ToqueCru[],
  etapaPorLead: Map<string, string> | null,
  etapas: EtapaConfig[],
  vocab: Map<string, FonteVocabulario>,
): LinhaFunilOrigem[] {
  const marcos = resolverMarcos(etapas);
  const etapaDe = new Map(etapas.map((e) => [e.chave, e]));
  // Mapa nulo = nao SABEMOS a etapa de ninguem. Marco fica `null` (vira "—"), nunca 0 — zero aqui
  // afirmaria "ninguem qualificou", que e o contrario de "nao consegui ler".
  const indisponivel = etapaPorLead == null;
  const linhas = new Map<string, LinhaFunilOrigem>();

  const garantir = (chave: string, rotulo: string, balde: Balde, plataforma: Plataforma | null) => {
    let l = linhas.get(chave);
    if (!l) {
      l = {
        chave,
        rotulo,
        balde,
        plataforma,
        leads: 0,
        marcos: {
          qualificado: indisponivel || marcos.ordem.qualificado == null ? null : 0,
          consulta: indisponivel || marcos.ordem.consulta == null ? null : 0,
          venda: indisponivel || marcos.ordem.venda == null ? null : 0,
        },
        taxas: { qualificado: null, consulta: null, venda: null },
        perdidos: 0,
      };
      linhas.set(chave, l);
    }
    return l;
  };

  for (const t of primeiroToquePorLead(toques).values()) {
    const balde = baldeDoToque(t, vocab);
    const plat = balde === "pago" ? plataformaDoToque(t, vocab) : null;
    const chave = plat ? `pago:${plat}` : balde;
    const rotulo = plat ? ROTULO_PLATAFORMA[plat] : ROTULO_BALDE[balde];
    const l = garantir(chave, rotulo, balde, plat);
    l.leads += 1;

    const etapaChave = etapaPorLead?.get(t.lead_id);
    const etapa = etapaChave ? etapaDe.get(etapaChave) : undefined;
    if (!etapa) continue;
    if (etapa.tipo === "perdido") {
      l.perdidos += 1;
      continue;
    }
    // Arquivado tem ordem 9000 (0072): nao e "chegou ate o fim", e "saiu do funil". Nao conta marco.
    if (etapa.tipo === "arquivado") continue;
    for (const m of MARCOS) {
      const o = marcos.ordem[m];
      if (o == null) continue;
      const chegou = m === "venda" ? etapa.tipo === "ganho" : etapa.ordem >= o;
      if (chegou) l.marcos[m] = (l.marcos[m] ?? 0) + 1;
    }
  }

  const ordem = (l: LinhaFunilOrigem) =>
    l.plataforma ? ORDEM_PLATAFORMA.indexOf(l.plataforma) : 10 + ORDEM_BALDE.indexOf(l.balde);
  return [...linhas.values()]
    .map((l) => ({
      ...l,
      taxas: {
        qualificado: taxa(l.marcos.qualificado, l.leads),
        consulta: taxa(l.marcos.consulta, l.leads),
        venda: taxa(l.marcos.venda, l.leads),
      },
    }))
    .sort((a, b) => ordem(a) - ordem(b));
}

// ─────────────────────────────── 9. campanhas e custo ───────────────────────────────

export interface LinhaCampanha {
  plataforma: Plataforma;
  campanhaId: string;
  rotulo: string;
  leads: number;
  gasto: number | null;
  cpl: number | null;
  cidades: string[];
}

/** A tabela plana de campanhas, a partir da arvore — uma fonte so para os dois desenhos. */
export function tabelaCampanhas(arvore: NoOrigem[]): LinhaCampanha[] {
  return nosDoNivel(arvore, "campanha")
    .filter((n) => n.chave !== SEM_CAMPANHA)
    .map((n) => ({
      plataforma: n.plataforma ?? "sem_plataforma",
      campanhaId: n.chave,
      rotulo: n.rotulo,
      leads: n.leads,
      gasto: n.gasto,
      cpl: n.cpl,
      cidades: n.cidades,
    }))
    .sort((a, b) => (b.gasto ?? -1) - (a.gasto ?? -1) || b.leads - a.leads);
}

// ─────────────────────────────── 10. estados ───────────────────────────────

export type EstadoPeriodo = "com_dado" | "antes_da_serie" | "sem_dado_no_periodo" | "serie_nao_iniciada";

export function estadoDoPeriodo(toquesNoPeriodo: number, inicioSerie: string | null, fim: string): EstadoPeriodo {
  if (toquesNoPeriodo > 0) return "com_dado";
  if (inicioSerie == null) return "serie_nao_iniciada";
  if (diaSP(inicioSerie) >= fim) return "antes_da_serie";
  return "sem_dado_no_periodo";
}

export type EstadoCusto = "ingerido" | "sem_linhas_no_periodo" | "sem_ingestao";

export function estadoDoCusto(linhasNoPeriodo: number, linhasNoTotal: number): EstadoCusto {
  if (linhasNoTotal === 0) return "sem_ingestao";
  if (linhasNoPeriodo === 0) return "sem_linhas_no_periodo";
  return "ingerido";
}

// ─────────────────────────────── 11. a visao ───────────────────────────────

export interface VisaoMarketing {
  periodo: Periodo;
  estado: EstadoPeriodo;
  estadoCusto: EstadoCusto;
  /** true = a leitura bateu no teto; os numeros sao de uma amostra. */
  parcial: boolean;
  /** true = alguma leitura falhou; o que falhou vira "—", nunca zero. */
  leituraFalhou: boolean;
  /** true = a tela esta mostrando a fixture de ensaio, nao o banco. */
  ensaio: boolean;
  resumo: {
    leads: number;
    fracaoPaga: number | null;
    gasto: number | null;
    cpl: number | null;
  };
  arvore: NoOrigem[];
  serie: PontoSerie[];
  funil: LinhaFunilOrigem[];
  campanhas: LinhaCampanha[];
  marcos: MarcosResolvidos;
  vocabularioDisponivel: boolean;
  flagAtiva: boolean | null;
  geradoEm: string;
}

export interface EntradaVisao {
  periodo: Periodo;
  toques: ToqueCru[];
  custos: CustoCru[];
  /** `null` = a leitura das etapas FALHOU. Vazio = leu e nao havia. Nao sao a mesma coisa. */
  etapasLeads: EtapaLeadCru[] | null;
  etapas: EtapaConfig[];
  parcial: boolean;
  leituraFalhou: boolean;
  ensaio?: boolean;
  inicioSerie: string | null;
  custoLinhasTotal: number;
  vocabulario: FonteVocabulario[] | null;
  flagAtiva: boolean | null;
  agora: Date;
}

export function montarVisao(e: EntradaVisao): VisaoMarketing {
  const vocab = indexarVocabulario(e.vocabulario ?? []);
  const estadoCusto = estadoDoCusto(e.custos.length, e.custoLinhasTotal);
  const houveIngestao = estadoCusto !== "sem_ingestao";

  const arvore = arvoreOrigem(e.toques, e.custos, vocab);
  const leads = primeiroToquePorLead(e.toques).size;
  const pagos = arvore.find((n) => n.chave === "pago")?.leads ?? 0;
  const gastoTotal = e.custos.reduce((s, c) => s + dinheiro(c.custo), 0);
  const gasto = houveIngestao ? gastoTotal : null;
  const etapaPorLead = e.etapasLeads == null ? null : new Map(e.etapasLeads.map((x) => [x.lead_id, x.etapa]));

  return {
    periodo: e.periodo,
    estado: estadoDoPeriodo(e.toques.length, e.inicioSerie, e.periodo.fim),
    estadoCusto,
    parcial: e.parcial,
    leituraFalhou: e.leituraFalhou,
    ensaio: e.ensaio === true,
    resumo: {
      leads,
      fracaoPaga: taxa(pagos, leads),
      gasto,
      // CPL geral divide pelos leads PAGOS: organico nao custou midia.
      cpl: gasto != null && pagos > 0 ? gasto / pagos : null,
    },
    arvore,
    serie: serieLeadsPorDia(e.toques, vocab, e.periodo.ini, e.periodo.fim),
    funil: funilPorOrigem(e.toques, etapaPorLead, e.etapas, vocab),
    campanhas: tabelaCampanhas(arvore),
    marcos: resolverMarcos(e.etapas),
    vocabularioDisponivel: e.vocabulario != null,
    flagAtiva: e.flagAtiva,
    geradoEm: e.agora.toISOString(),
  };
}
