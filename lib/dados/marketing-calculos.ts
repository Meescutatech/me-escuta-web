/**
 * T7 - O CEREBRO DA TELA DO FERNANDO: logica PURA, sem I/O, testavel com `node --test`.
 * (RF-10 / RF-11 / RF-13 da SPEC-MODULO-MARKETING)
 *
 * =========================================================================================
 * POR QUE ESTE ARQUIVO EXISTE, EM VEZ DE A TELA CHAMAR `core.casamento_midia`
 * =========================================================================================
 * O RF-10 proibe, com todas as letras, a tela reusar a consulta do RF-9 ou a do proprio RF-10.
 * O motivo nao e estilo: o teste de aceite compara *tela x comando*, e se os dois lados forem
 * a mesma funcao SQL o teste compara a consulta CONSIGO MESMA e vira tautologia - um verde que
 * nao pode ficar vermelho, que e o defeito C-1 da spec entrando pela porta dos fundos.
 *
 * Entao os dois caminhos sao de naturezas diferentes de proposito:
 *   - ORACULO -> agrega no Postgres, com `full outer join` e `filter (where ...)`;
 *   - TELA    -> le as linhas cruas e agrega AQUI, em TypeScript, com Map e laco.
 * Divergiram? Um dos dois esta errado, e e isso que o teste tem de poder dizer.
 *
 * =========================================================================================
 * A REGRA QUE ATRAVESSA O ARQUIVO INTEIRO: ZERO NAO E UMA COISA SO
 * =========================================================================================
 * Quatro zeros diferentes aparecem nesta tela, e soma-los num balde so e o erro que esta
 * rodada ja pegou quatro vezes em lugares distintos:
 *   1. `0` medido       - houve leitura, o periodo nao teve captacao. E noticia sobre o marketing.
 *   2. `null` -> "—"    - a leitura falhou agora. Recarregar pode resolver.
 *   3. `sem_ingestao`   - a tabela inteira esta vazia: ninguem nunca ingeriu. E INCIDENTE.
 *   4. `antes_da_serie` - o periodo e anterior ao primeiro dado que existe. Nao houve porque
 *                         ainda nao havia sistema, nao porque o marketing nao trouxe ninguem.
 * Nenhuma funcao daqui devolve `0` onde a resposta honesta e uma das outras tres.
 */

// =========================================================================================
// 1. AS LINHAS CRUAS - o formato exato que sai do PostgREST, sem traducao no meio
// =========================================================================================

/** Uma linha de `core.captacao`. Um toque, nao um lead: o mesmo lead pode ter varios. */
export interface ToqueCru {
  lead_id: string;
  fonte: string;
  plataforma: string | null;
  campanha_id: string | null;
  campanha_nome: string | null;
  anuncio_id: string | null;
  anuncio_nome: string | null;
  /** `{source, medium, campaign, content, term, cidade, cidade_procedencia}` - RF-7/D22. */
  utm: Record<string, string | null> | null;
  /** `{gclid, fbclid, ctwa_clid}` - chave AUSENTE e ausente, nunca string vazia. */
  clids: Record<string, string | null> | null;
  /** `resolvida` | `falhou` | `nao_aplicavel` - sem isto, `campanha_id is null` soma 3 causas. */
  hierarquia_estado: string;
  /** Quando a FONTE registrou. Pode ser nulo (RF-5) - e nulo tem balde proprio. */
  capturado_em: string | null;
  /** Quando o ledger recebeu. Nunca nulo. */
  criado_em: string;
}

/** Uma linha de `core.custo_midia`. Grao = dia x plataforma x campanha (sem conjunto, C-2). */
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
  /**
   * `null` e um VALOR, nao um buraco: `landing` e `tintim` recebem pago E organico pela mesma
   * chave, entao classifica-las seria inventar. Vira o balde "nao classificado" na tela.
   */
  pago_organico: "pago" | "organico" | null;
  plataforma: "meta" | "google" | "outro" | null;
}

/** `numeric` do Postgres chega como string; `0` so quando o valor e mesmo zero. */
export function dinheiro(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// =========================================================================================
// 2. TAXA - a funcao de uma linha que impede a tela de mentir
// =========================================================================================

/**
 * Fracao `numerador/denominador`, ou `null` quando o denominador e ZERO.
 *
 * Parece detalhe e e o RF-11 inteiro: dividir por zero e exibir "0%" AFIRMA uma cobertura que
 * nao foi medida. E o que o dashboard do LiderHub faz com `withClidRate: null` - e e o que
 * teria mostrado os 97,2% sem identificador no dia seguinte, em vez de 36 dias depois.
 */
export function taxa(numerador: number | null, denominador: number | null): number | null {
  if (numerador == null || denominador == null) return null;
  if (denominador === 0) return null;
  return numerador / denominador;
}

/** "12%" | "—" quando a taxa nao foi medida. Uma casa so: e leitura de 3 segundos. */
export function pct(t: number | null): string {
  if (t == null) return "—";
  return `${(t * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** "R$ 1.234,50" | "—" para ausente. Nunca "R$ 0,00" onde o certo e "—". */
export function brl(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// =========================================================================================
// 3. RESUMO - as perguntas (a) e (b) do Fernando
// =========================================================================================

export interface Fatia {
  chave: string;
  rotulo: string;
  toques: number;
  /** Leads DISTINTOS. Um lead que tocou 3 vezes conta 3 em `toques` e 1 aqui. */
  leads: number;
}

/** Indice `chave da fonte -> classificacao`, a partir da config v2. */
export function indexarVocabulario(fontes: FonteVocabulario[]): Map<string, FonteVocabulario> {
  return new Map(fontes.map((f) => [f.chave, f]));
}

function acumular(
  mapa: Map<string, { toques: number; leads: Set<string> }>,
  chave: string,
  leadId: string,
) {
  let e = mapa.get(chave);
  if (!e) {
    e = { toques: 0, leads: new Set() };
    mapa.set(chave, e);
  }
  e.toques += 1;
  e.leads.add(leadId);
}

function materializar(
  mapa: Map<string, { toques: number; leads: Set<string> }>,
  rotulos: Record<string, string>,
): Fatia[] {
  return [...mapa.entries()]
    .map(([chave, v]) => ({
      chave,
      rotulo: rotulos[chave] ?? chave,
      toques: v.toques,
      leads: v.leads.size,
    }))
    .sort((a, b) => b.toques - a.toques || a.chave.localeCompare(b.chave));
}

/**
 * (a) PAGO x ORGANICO - tres baldes, nao dois.
 *
 * O terceiro ("nao classificado") nao e preguica: a config v2 grava `pago_organico: null` para
 * `landing`, `tintim` e `outro` porque a MESMA chave de fonte recebe trafego pago e organico.
 * Joga-los em "organico" inflaria o organico com dinheiro gasto; joga-los em "pago" faria o
 * contrario. O balde nomeado e a unica leitura que nao afirma o que ninguem mediu.
 */
export function porPagoOrganico(toques: ToqueCru[], vocab: Map<string, FonteVocabulario>): Fatia[] {
  const mapa = new Map<string, { toques: number; leads: Set<string> }>();
  for (const t of toques) {
    const v = vocab.get(t.fonte);
    acumular(mapa, v?.pago_organico ?? "nao_classificado", t.lead_id);
  }
  return materializar(mapa, {
    pago: "Pago",
    organico: "Organico",
    nao_classificado: "Nao classificado",
  });
}

/**
 * (b) META x GOOGLE - a plataforma vem da COLUNA da captacao, com a config como rede.
 *
 * A coluna nasce nula (a 0200 nao a deriva de `fonte`: derivar seria adivinhar). Quem a
 * preenche e a borda. Enquanto ela vier nula, a classificacao da config responde - e quando
 * nem ela souber, o toque cai em "sem plataforma", que e metade da chave de casamento
 * faltando e por isso um DIAGNOSTICO, nao uma sobra de arredondamento.
 */
export function porPlataforma(toques: ToqueCru[], vocab: Map<string, FonteVocabulario>): Fatia[] {
  const mapa = new Map<string, { toques: number; leads: Set<string> }>();
  for (const t of toques) {
    const p = t.plataforma ?? vocab.get(t.fonte)?.plataforma ?? null;
    acumular(mapa, p ?? "sem_plataforma", t.lead_id);
  }
  return materializar(mapa, {
    meta: "Meta",
    google: "Google",
    outro: "Outra plataforma",
    sem_plataforma: "Sem plataforma",
  });
}

/** (c) CAMPANHA / (d) ANUNCIO / (e) CIDADE - o mesmo recorte, chaves diferentes. */
export function porChave(
  toques: ToqueCru[],
  extrair: (t: ToqueCru) => { chave: string | null; rotulo: string | null },
  rotuloAusente: string,
): Fatia[] {
  const mapa = new Map<string, { toques: number; leads: Set<string> }>();
  const rotulos: Record<string, string> = { __ausente__: rotuloAusente };
  for (const t of toques) {
    const { chave, rotulo } = extrair(t);
    const k = chave ?? "__ausente__";
    if (chave && rotulo) rotulos[k] = rotulo;
    else if (chave && !rotulos[k]) rotulos[k] = chave;
    acumular(mapa, k, t.lead_id);
  }
  return materializar(mapa, rotulos);
}

export const extrairCampanha = (t: ToqueCru) => ({ chave: t.campanha_id, rotulo: t.campanha_nome });
export const extrairAnuncio = (t: ToqueCru) => ({ chave: t.anuncio_id, rotulo: t.anuncio_nome });

/**
 * (e) CIDADE - vem da SEGMENTACAO da campanha (D22), NAO de onde a pessoa esta.
 * O rotulo na tela tem de dizer isso; o dado aqui so entrega a chave.
 */
export const extrairCidade = (t: ToqueCru) => {
  const c = t.utm?.cidade ?? null;
  return { chave: c, rotulo: c };
};

// =========================================================================================
// 4. SERIE TEMPORAL - e a diferenca entre "nao houve" e "foi zero"
// =========================================================================================

export interface PontoSerie {
  /** "YYYY-MM-DD" no fuso da operacao. */
  dia: string;
  rotulo: string;
  toques: number;
  /** Gasto do dia, quando ha custo ingerido; `null` quando nao ha ingestao nenhuma. */
  gasto: number | null;
}

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

/** "YYYY-MM-DD" de um instante no fuso da operacao (UTC-3 fixo - o Brasil nao tem verao). */
export function diaSP(iso: string): string {
  return new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** "seg 20/07" a partir de "2026-07-20". */
export function rotuloDia(ymd: string): string {
  const [ano, mes, dia] = ymd.split("-").map(Number);
  const semana = DIAS_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()];
  return `${semana} ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
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

/**
 * A serie do periodo. `gasto` e `null` - nao `0` - quando NAO HA custo ingerido em lugar
 * nenhum: uma linha de gasto colada no chao e indistinguivel de "nao gastamos nada", e as
 * duas coisas sao opostas. Com ingestao viva, um dia sem gasto e `0` de verdade.
 */
export function serieTemporal(
  toques: ToqueCru[],
  custos: CustoCru[],
  ini: string,
  fim: string,
  houveIngestaoDeCusto: boolean,
): PontoSerie[] {
  const porDia = new Map<string, number>();
  for (const t of toques) {
    if (!t.capturado_em) continue; // sem data nao pertence a dia nenhum - tem balde proprio
    const d = diaSP(t.capturado_em);
    porDia.set(d, (porDia.get(d) ?? 0) + 1);
  }
  const gastoPorDia = new Map<string, number>();
  for (const c of custos) gastoPorDia.set(c.dia, (gastoPorDia.get(c.dia) ?? 0) + dinheiro(c.custo));

  return diasDoPeriodo(ini, fim).map((dia) => ({
    dia,
    rotulo: rotuloDia(dia),
    toques: porDia.get(dia) ?? 0,
    gasto: houveIngestaoDeCusto ? gastoPorDia.get(dia) ?? 0 : null,
  }));
}

// =========================================================================================
// 5. OS CINCO BALDES (RF-9, pelo caminho da TELA) - e (f), quanto custou cada uma
// =========================================================================================

export interface Baldes {
  gastoCasado: number;
  gastoSemLead: number;
  leadsCasados: number;
  leadsSemCusto: number;
  leadsSemCampanhaPorFalha: number;
  leadsSemCampanhaOk: number;
  /** Contado FORA do recorte: toque sem data nao pertence a periodo nenhum (C-1d). */
  leadsSemData: number;
  /** Metade da chave faltando - sem balde proprio, ficaria escondido em `leadsSemCusto`. */
  leadsSemPlataforma: number;
  gastoTotal: number;
  leadsTotal: number;
  /** Guardas de regressao: pegam quem trocar o casamento por um `inner join` depois. */
  reconciliaDinheiro: boolean;
  reconciliaLeads: boolean;
}

/**
 * A chave de casamento e `plataforma + campanha_id` - as DUAS metades.
 *
 * Sem `plataforma`, um id de campanha do Meta casaria com um do Google, que sao espacos de
 * identificador diferentes. Custo-por-lead cruzado e PIOR que nao-casado: sai plausivel, erra,
 * e nao cai em balde nenhum onde alguem pudesse ve-lo.
 *
 * Toque com `plataforma` nula NUNCA casa - e o que o `l.plataforma = c.plataforma` do SQL faz
 * com nulo, e o TS tem de reproduzir isso, nao "melhorar".
 */
function chaveCasamento(plataforma: string | null, campanhaId: string | null): string | null {
  if (!plataforma || !campanhaId) return null;
  return `${plataforma} ${campanhaId}`;
}

export function calcularBaldes(toques: ToqueCru[], custos: CustoCru[], leadsSemData: number): Baldes {
  // AGREGA ANTES DE CASAR. E isto que impede 30 dias da mesma campanha de multiplicarem o
  // gasto: aqui o grao deixa de ser dia x plataforma x campanha e vira plataforma x campanha.
  const gastoPorChave = new Map<string, number>();
  for (const c of custos) {
    const k = chaveCasamento(c.plataforma, c.campanha_id);
    if (!k) continue;
    gastoPorChave.set(k, (gastoPorChave.get(k) ?? 0) + dinheiro(c.custo));
  }

  const toquesPorChave = new Map<string, number>();
  let leadsSemCampanhaPorFalha = 0;
  let leadsSemCampanhaOk = 0;
  let leadsSemPlataforma = 0;
  let semCampanhaContraditorio = 0;

  for (const t of toques) {
    if (t.campanha_id == null) {
      if (t.hierarquia_estado === "falhou") leadsSemCampanhaPorFalha += 1;
      else if (t.hierarquia_estado === "nao_aplicavel") leadsSemCampanhaOk += 1;
      // `resolvida` sem campanha e a contradicao que a T1 proibe por CHECK. Se aparecer, ela
      // NAO se dissolve num dos outros dois: fica contada a parte e derruba `reconciliaLeads`,
      // que e o que torna a igualdade um teste vivo em vez de decoracao.
      else semCampanhaContraditorio += 1;
      continue;
    }
    if (t.plataforma == null) {
      // Tem campanha e nao tem plataforma: a chave esta pela metade, entao ele nao e casavel.
      leadsSemPlataforma += 1;
      continue;
    }
    const k = chaveCasamento(t.plataforma, t.campanha_id)!;
    toquesPorChave.set(k, (toquesPorChave.get(k) ?? 0) + 1);
  }

  let gastoCasado = 0;
  let gastoSemLead = 0;
  for (const [k, g] of gastoPorChave) {
    if (toquesPorChave.has(k)) gastoCasado += g;
    else gastoSemLead += g;
  }

  let leadsCasados = 0;
  let leadsSemCusto = 0;
  for (const [k, n] of toquesPorChave) {
    if (gastoPorChave.has(k)) leadsCasados += n;
    else leadsSemCusto += n;
  }
  // O toque com campanha e sem plataforma nao entrou em `toquesPorChave` (nao e casavel).
  // Ele existe e tem de aparecer: soma-se ao lado nao-casado, senao some do total e a
  // igualdade dos leads ficaria verde escondendo gente.
  leadsSemCusto += leadsSemPlataforma;

  // TOTAIS POR FORA DO CASAMENTO - e isto que da a igualdade um caminho de calculo diferente
  // do que ela confere. Somar as particoes contra elas mesmas seria tautologia outra vez.
  const gastoTotal = custos.reduce((s, c) => s + dinheiro(c.custo), 0);
  const leadsTotal = toques.length;

  return {
    gastoCasado,
    gastoSemLead,
    leadsCasados,
    leadsSemCusto,
    leadsSemCampanhaPorFalha,
    leadsSemCampanhaOk,
    leadsSemData,
    leadsSemPlataforma,
    gastoTotal,
    leadsTotal,
    // Centavo: `numeric(12,2)` somado em float pode errar na 15a casa, e uma guarda que fica
    // vermelha por isso treina todo mundo a ignora-la.
    reconciliaDinheiro: Math.abs(gastoCasado + gastoSemLead - gastoTotal) < 0.005,
    reconciliaLeads:
      leadsCasados +
        leadsSemCusto +
        leadsSemCampanhaPorFalha +
        leadsSemCampanhaOk +
        semCampanhaContraditorio ===
      leadsTotal,
  };
}

/** (f) QUANTO CUSTOU CADA UMA - custo por campanha, com custo por lead quando da para dividir. */
export interface LinhaCampanha {
  plataforma: string | null;
  campanhaId: string | null;
  rotulo: string;
  toques: number;
  leads: number;
  /** `null` = nao ha custo ingerido para esta campanha (diferente de "custou zero"). */
  gasto: number | null;
  /** `null` sempre que `gasto` for null OU nao houver lead: nunca dividir por zero. */
  custoPorLead: number | null;
}

export function custoPorCampanha(toques: ToqueCru[], custos: CustoCru[]): LinhaCampanha[] {
  interface Acc extends LinhaCampanha {
    _leads: Set<string>;
  }
  const linhas = new Map<string, Acc>();
  const chave = (p: string | null, c: string | null) => `${p ?? "?"} ${c ?? "?"}`;

  const garantir = (p: string | null, c: string | null, rotulo: string): Acc => {
    const k = chave(p, c);
    let l = linhas.get(k);
    if (!l) {
      l = {
        plataforma: p,
        campanhaId: c,
        rotulo,
        toques: 0,
        leads: 0,
        gasto: null,
        custoPorLead: null,
        _leads: new Set(),
      };
      linhas.set(k, l);
    }
    return l;
  };

  for (const t of toques) {
    const l = garantir(t.plataforma, t.campanha_id, t.campanha_nome ?? t.campanha_id ?? "Sem campanha");
    l.toques += 1;
    l._leads.add(t.lead_id);
  }
  // O lado do custo tem de EXISTIR mesmo sem lead nenhum: e o balde "gasto sem lead casado",
  // e um `left join` a partir dos toques o descartaria em silencio (o buraco do C-1).
  for (const c of custos) {
    const l = garantir(c.plataforma, c.campanha_id, c.campanha_nome ?? c.campanha_id);
    l.gasto = (l.gasto ?? 0) + dinheiro(c.custo);
  }

  return [...linhas.values()]
    .map(({ _leads, ...l }) => {
      const leads = _leads.size;
      return { ...l, leads, custoPorLead: l.gasto != null && leads > 0 ? l.gasto / leads : null };
    })
    .sort((a, b) => (b.gasto ?? -1) - (a.gasto ?? -1) || b.toques - a.toques);
}

// =========================================================================================
// 6. COBERTURA (RF-11) - o que impede a tela de mentir por omissao
// =========================================================================================

export interface Cobertura {
  /** Toques no periodo. */
  toques: number;
  /** Leads DISTINTOS com pelo menos um toque atribuido. */
  leadsComAtribuicao: number;
  /**
   * Leads criados no periodo - DENOMINADOR DE OUTRA BASE, e isso e de proposito.
   * O numerador conta `core.captacao`, o denominador conta `core.lead`. A taxa responde
   * "que fracao dos leads do periodo tem atribuicao", e misturar as duas bases dentro da
   * mesma linha SEM DIZER e o defeito que o RF-9 tinha acabado de consertar.
   */
  leadsNoPeriodo: number | null;
  taxaComAtribuicao: number | null;
  taxaComClid: number | null;
  /** O buraco medido (11,2%, M28): leads do periodo sem captacao nenhuma. */
  leadsSemCanalNenhum: number | null;
  /** `min(capturado_em)` de toda a tabela - quando a serie entrou no ar. */
  inicioSerie: string | null;
}

export function calcularCobertura(
  toques: ToqueCru[],
  leadsNoPeriodo: number | null,
  inicioSerie: string | null,
): Cobertura {
  const leads = new Set(toques.map((t) => t.lead_id));
  const comClid = toques.filter((t) => t.clids != null && t.clids.ctwa_clid != null).length;
  const leadsComAtribuicao = leads.size;
  return {
    toques: toques.length,
    leadsComAtribuicao,
    leadsNoPeriodo,
    taxaComAtribuicao: taxa(leadsComAtribuicao, leadsNoPeriodo),
    taxaComClid: taxa(comClid, toques.length),
    // Complemento medido, nao estimado. `null` quando nao da para saber o total de leads - e
    // negativo nunca: mais captacoes que leads significa toque de lead de outro periodo.
    leadsSemCanalNenhum:
      leadsNoPeriodo == null ? null : Math.max(0, leadsNoPeriodo - leadsComAtribuicao),
    inicioSerie,
  };
}

// =========================================================================================
// 7. FRESCURA (RF-13) - duas fontes, dois carimbos, nunca uma media
// =========================================================================================

/** Uma media de frescura esconderia justamente a fonte que parou. Por isso, separadas. */
export const HORAS_ATE_ENVELHECER = 24;

export interface Frescura {
  fonte: "captacao" | "custo";
  rotulo: string;
  /** Instante do dado mais recente; `null` = nunca houve dado nenhum desta fonte. */
  ate: string | null;
  horas: number | null;
  /** `true` = parada ha mais de 24h. `null` quando nao ha o que envelhecer. */
  velha: boolean | null;
}

export function frescuraDe(
  fonte: Frescura["fonte"],
  rotulo: string,
  ate: string | null,
  agora: Date,
): Frescura {
  if (!ate) return { fonte, rotulo, ate: null, horas: null, velha: null };
  const ms = agora.getTime() - new Date(ate).getTime();
  const horas = ms / 3600_000;
  return { fonte, rotulo, ate, horas, velha: horas > HORAS_ATE_ENVELHECER };
}

// =========================================================================================
// 8. O ESTADO DO PERIODO - a resposta que precede todas as outras
// =========================================================================================

/**
 * Antes de desenhar qualquer numero, a tela responde a UMA pergunta: por que este periodo
 * esta vazio? Sao tres respostas diferentes e a tela nunca desenha grafico no lugar delas -
 * grafico vazio parece zero de resultado, e zero de resultado e uma afirmacao sobre o
 * marketing que ninguem mediu.
 */
export type EstadoPeriodo =
  /** Ha captacao no recorte: desenha. */
  | "com_dado"
  /** A serie ainda nao comecou, ou comecou depois do fim do recorte. */
  | "antes_da_serie"
  /** A serie existe e cobre o recorte, mas este periodo nao teve captacao. E noticia real. */
  | "sem_dado_no_periodo"
  /** Nunca entrou uma captacao sequer no sistema. E estado de implantacao, nao de marketing. */
  | "serie_nao_iniciada";

export function estadoDoPeriodo(
  toquesNoPeriodo: number,
  inicioSerie: string | null,
  fim: string,
): EstadoPeriodo {
  if (toquesNoPeriodo > 0) return "com_dado";
  if (inicioSerie == null) return "serie_nao_iniciada";
  if (diaSP(inicioSerie) >= fim) return "antes_da_serie";
  return "sem_dado_no_periodo";
}

/** Idem para o dinheiro - o mesmo vocabulario do oraculo, para os dois falarem a mesma lingua. */
export type EstadoCusto = "ingerido" | "sem_linhas_no_periodo" | "sem_ingestao";

export function estadoDoCusto(linhasNoPeriodo: number, linhasNoTotal: number): EstadoCusto {
  if (linhasNoTotal === 0) return "sem_ingestao";
  if (linhasNoPeriodo === 0) return "sem_linhas_no_periodo";
  return "ingerido";
}

// =========================================================================================
// 9. O RECORTE - ele mora aqui, e nao no arquivo de leitura, para poder ser TESTADO
// =========================================================================================
// `lib/dados/marketing.ts` importa `@/lib/supabase/server`, e o `node --test` nao resolve o
// alias `@/`. Regra da casa (a mesma de `dashboard-calculos.ts`): o que e logica pura fica
// deste lado, o I/O fica do outro. O periodo decide QUAIS linhas entram na conta - errar o
// recorte erra todo numero da tela, entao ele e exatamente o que precisa de teste.

export interface Periodo {
  /** "YYYY-MM-DD" inclusivo. */
  ini: string;
  /** "YYYY-MM-DD" EXCLUSIVO - `>= ini and < fim`, igual ao oraculo do RF-9. */
  fim: string;
  rotulo: string;
}

const RE_YMD = /^\d{4}-\d{2}-\d{2}$/;

export function somarDias(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" de hoje no fuso da operacao (UTC-3 fixo). */
export function hojeSP(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

export const PRESETS = [
  { chave: "7d", rotulo: "7 dias", dias: 7 },
  { chave: "30d", rotulo: "30 dias", dias: 30 },
  { chave: "90d", rotulo: "90 dias", dias: 90 },
] as const;

/**
 * O periodo pedido pela URL. `?de=&ate=` manda; senao, `?p=30d`; senao, 30 dias.
 *
 * Data invalida NAO vira "hoje" em silencio - cai no padrao, e o padrao e nomeado na tela.
 * Silenciar aqui produziria o recorte errado com cara de recorte pedido.
 */
export function periodoDaUrl(
  params: { de?: string; ate?: string; p?: string } = {},
  agora: Date = new Date(),
): Periodo {
  const hoje = hojeSP(agora);
  if (
    params.de &&
    params.ate &&
    RE_YMD.test(params.de) &&
    RE_YMD.test(params.ate) &&
    params.de <= params.ate
  ) {
    // `ate` chega inclusivo na URL (e o que a pessoa digita) e sai exclusivo daqui.
    return { ini: params.de, fim: somarDias(params.ate, 1), rotulo: `${params.de} a ${params.ate}` };
  }
  const preset = PRESETS.find((x) => x.chave === params.p) ?? PRESETS[1];
  return {
    ini: somarDias(hoje, -(preset.dias - 1)),
    fim: somarDias(hoje, 1),
    rotulo: `ultimos ${preset.rotulo}`,
  };
}

// =======================================================================================
// 10. A COMPOSICAO - o que a tela recebe pronto
// =======================================================================================

export interface VisaoMarketing {
  periodo: Periodo;
  estado: EstadoPeriodo;
  estadoCusto: EstadoCusto;
  /** true = a leitura bateu no teto; os numeros sao de uma AMOSTRA, e a tela diz isso. */
  parcial: boolean;
  /** true = alguma leitura falhou; o que falhou vira "—", nunca zero. */
  leituraFalhou: boolean;
  resumo: {
    toques: number;
    leads: number;
    gasto: number | null;
    custoPorLead: number | null;
  };
  pagoOrganico: Fatia[];
  plataformas: Fatia[];
  campanhas: Fatia[];
  anuncios: Fatia[];
  cidades: Fatia[];
  serie: PontoSerie[];
  recentes: ToqueCru[];
  custoCampanhas: LinhaCampanha[];
  baldes: Baldes;
  cobertura: Cobertura;
  frescura: Frescura[];
  /** false = a config `canal_captacao` v2 nao respondeu; a classificacao (a)/(b) fica cega. */
  vocabularioDisponivel: boolean;
  /** Estado da flag de release. `null` = a linha `flag.modulo_marketing` nao existe no banco. */
  flagAtiva: boolean | null;
  geradoEm: string;
}

/** Quantas atribuicoes recentes a fatia mostra. Lista longa ninguem le; 20 cabe na tela. */
export const RECENTES = 20;

/** Tudo que a composicao precisa saber do mundo. Quem le o banco entrega isto pronto. */
export interface EntradaVisao {
  periodo: Periodo;
  toques: ToqueCru[];
  custos: CustoCru[];
  parcial: boolean;
  leituraFalhou: boolean;
  /** Toques com `capturado_em` nulo, contados FORA do recorte (C-1d). */
  leadsSemData: number;
  /** Leads em `core.lead` no periodo - OUTRA BASE, e a tela diz isso ao lado do numero. */
  leadsNoPeriodo: number | null;
  inicioSerie: string | null;
  ultimaCaptacao: string | null;
  custoLinhasTotal: number;
  ultimoCusto: string | null;
  /** `null` = a config nao respondeu; a tela declara que (a) e (b) ficaram cegas. */
  vocabulario: FonteVocabulario[] | null;
  flagAtiva: boolean | null;
  agora: Date;
}

/**
 * Monta a visao inteira. PURA de proposito - e a mesma funcao que a rota de ensaio usa, entao o
 * que o ensaio mostra na tela e o que a tela real faz com as linhas que ela leu. Ensaio que
 * monta a propria visao vira uma segunda tela, e a segunda tela e a que ninguem atualiza.
 */
export function montarVisao(e: EntradaVisao): VisaoMarketing {
  const vocab = indexarVocabulario(e.vocabulario ?? []);
  const estadoCusto = estadoDoCusto(e.custos.length, e.custoLinhasTotal);
  const houveIngestao = estadoCusto !== "sem_ingestao";

  const baldes = calcularBaldes(e.toques, e.custos, e.leadsSemData);
  const cobertura = calcularCobertura(e.toques, e.leadsNoPeriodo, e.inicioSerie);
  const leadsDistintos = new Set(e.toques.map((t) => t.lead_id)).size;
  // Gasto e `null` - nao zero - enquanto ninguem ingeriu: zero de tabela vazia e zero de "nao
  // gastamos" tem a mesma aparencia e sao coisas opostas, e a primeira e INCIDENTE.
  const gasto = houveIngestao ? baldes.gastoTotal : null;

  return {
    periodo: e.periodo,
    estado: estadoDoPeriodo(e.toques.length, e.inicioSerie, e.periodo.fim),
    estadoCusto,
    parcial: e.parcial,
    leituraFalhou: e.leituraFalhou,
    resumo: {
      toques: e.toques.length,
      leads: leadsDistintos,
      gasto,
      custoPorLead: gasto != null && leadsDistintos > 0 ? gasto / leadsDistintos : null,
    },
    pagoOrganico: porPagoOrganico(e.toques, vocab),
    plataformas: porPlataforma(e.toques, vocab),
    campanhas: porChave(e.toques, extrairCampanha, "Sem campanha"),
    anuncios: porChave(e.toques, extrairAnuncio, "Sem anuncio"),
    cidades: porChave(e.toques, extrairCidade, "Sem cidade na segmentacao"),
    serie: serieTemporal(e.toques, e.custos, e.periodo.ini, e.periodo.fim, houveIngestao),
    recentes: e.toques.slice(0, RECENTES),
    custoCampanhas: custoPorCampanha(e.toques, e.custos),
    baldes,
    cobertura,
    frescura: [
      frescuraDe("captacao", "Captacao", e.ultimaCaptacao, e.agora),
      frescuraDe("custo", "Custo de midia", e.ultimoCusto, e.agora),
    ],
    vocabularioDisponivel: e.vocabulario != null,
    flagAtiva: e.flagAtiva,
    geradoEm: e.agora.toISOString(),
  };
}
