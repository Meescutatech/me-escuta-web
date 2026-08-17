import { criarClienteServidor } from "@/lib/supabase/server";
import { ETAPAS_PADRAO, lerEtapasReais, type EtapaFunil } from "./funil";
import {
  ESTADOS_ENTREGA_CONHECIDA,
  TETO_LEADS_AGREGACAO,
  TETO_MENSAGENS_AGREGACAO,
  bucketizarMensagens,
  contarEntrega,
  contarPorEtapa,
  janelasUltimosDias,
  mediana,
  minutosPrimeiraResposta,
  percentualEntrega,
  resumirSugestoes,
  somaValores,
  precisaoGeral,
  precisaoPorAgente,
  STATUS_DECIDIDOS,
  TETO_DECIDIDAS_AGREGACAO,
  TETO_SUGESTOES_AGREGACAO,
  type JanelaDia,
  type MensagemMinima,
  type PrecisaoAgente,
} from "./dashboard-calculos";

/**
 * Leitura do DASHBOARD (Rodada 7, D5) — números 100% derivados do ledger/projeções reais,
 * com a MESMA sessão/RLS do resto do app (criarClienteServidor).
 *
 * Agregação NO BANCO: contagens são head-counts do PostgREST (SELECT count(*) com filtro no
 * Postgres — nenhuma linha trafega), então o resultado independe do volume (40 ou 400 leads).
 * O PostgREST deste projeto não expõe funções de agregação (`count()`/`sum()` em select →
 * PGRST123 desabilitado), e a rodada não permite migration/RPC nova — as DUAS exceções
 * documentadas abaixo (valor em negociação e 1ª resposta) trafegam colunas mínimas de
 * conjuntos pequenos e limitados.
 *
 * Número indisponível (erro de leitura) = null → a UI mostra "—", nunca um zero inventado.
 */

export interface FaixaEtapa {
  etapa: EtapaFunil;
  qtd: number | null;
}

export interface DiaMensagens {
  rotulo: string;
  entrada: number | null;
  saida: number | null;
}

export interface DadosDashboard {
  /** Recência: criado_em do último evento do ledger (o universo Kommo é snapshot). */
  ultimoEventoEm: string | null;
  leadsPorEtapa: FaixaEtapa[];
  leadsAtivos: number | null; // soma das etapas de tipo 'aberto'
  novosHoje: number | null;
  novos7d: number | null;
  mensagens7d: DiaMensagens[];
  entrega: {
    base: number | null; // saídas com estado conhecido (enviado/entregue/lido/falhou)
    entregues: number | null; // entregue + lido
    falhas: number | null;
    pct: number | null; // entregues/base
  };
  primeiraResposta: {
    medianaMin: number | null;
    amostra: number; // conversas dos últimos 7d com par entrada→saída
    parcial: boolean; // leitura bateu num dos tetos → mediana sobre amostra parcial (a UI avisa)
  };
  valorNegociacao: {
    total: number; // soma dos `valor` não-null em etapas abertas
    comValor: number;
    semValor: number | null; // honesto: Kommo só preenche price no fechamento
  };
  /** R19: a operação de agentes (core.sugestao_ia pendente) — a identidade do sistema, visível. */
  sugestoes: {
    pendentes: number | null;
    porAgente: Array<{ agente: string; qtd: number }> | null; // null = quebra indisponível (teto/erro)
    maisAntigaEm: string | null;
  };
  /** R23 · RF-15.3 — a base da régua de autonomia (RF-M3). null = leitura indisponível. */
  precisao: {
    agentes: PrecisaoAgente[] | null;
    geral: PrecisaoAgente | null;
    /** Quando foi a última decisão humana. Fila crescendo + data velha = ninguém está validando. */
    ultimaDecisaoEm: string | null;
  };
  /** R23 · RF-15.4 — saúde do fluxo, fonte única `ops.v_saude_fluxo` via `core.v_saude_fluxo` (0180). */
  saudeFluxo: SaudeFluxo | null;
  /**
   * R23 · a recência REAL do que o painel está lendo. Sem isto, "0 novos hoje" é indistinguível de
   * "nada foi importado desde 22/07" — e é a segunda coisa, não a primeira.
   */
  recencia: {
    ultimoLeadCriadoEm: string | null;
    ultimaMensagemEm: string | null;
  };
}

/**
 * R23 · RF-15.4 — o retrato do fluxo. Todos os campos podem ser `null` quando a fonte não veio;
 * `disponivel: false` diz que a view inteira não foi alcançada (é o caso enquanto a 0180 não
 * estiver aplicada: `ops` está fora da Data API e o PostgREST devolve PGRST106/205).
 */
export interface SaudeFluxo {
  disponivel: boolean;
  eventosUltimoMinuto: number | null;
  eventosUltimaHora: number | null;
  duplicadosUltimaHora: number | null;
  falhasUltimaHora: number | null;
  lagFilaEventos: number | null;
  idadeFilaEventosSeg: number | null;
  lagFilaSaida: number | null;
  idadeFilaSaidaSeg: number | null;
  enviosFalhados24h: number | null;
  ultimaIngestaoWhatsapp: string | null;
}

type Supabase = ReturnType<typeof criarClienteServidor>;

/** COUNT no banco (head:true → só o total volta). Erro → null (a UI mostra "—"). */
async function contar(
  supabase: Supabase,
  tabela: string,
  filtros: (q: any) => any,
): Promise<number | null> {
  const q = filtros(
    supabase.schema("core").from(tabela).select("*", { count: "exact", head: true }),
  );
  const { count, error } = await q;
  return error ? null : count ?? 0;
}

async function lerUltimoEvento(supabase: Supabase): Promise<string | null> {
  const { data, error } = await supabase
    .schema("core")
    .from("evento")
    .select("criado_em")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return error || !data ? null : (data.criado_em as string);
}

// Tetos da amostra da 1ª resposta (hoje: ~86 conversas / ~410 mensagens em 7d — folga larga).
// Bater no teto NÃO pode virar mediana silenciosamente parcial: a flag `parcial` acende e a
// UI avisa "amostra parcial".
const TETO_CONVERSAS_7D = 300;
const TETO_MENSAGENS_7D = 5000;

/*
 * ── F24a · os três blocos que colapsam ──────────────────────────────────────────────────────
 * Cada um lê UMA coluna estreita em vez de disparar N head-counts, e cada um volta ao caminho
 * antigo acima de um teto declarado. O `+1` no limite é o detector: se voltou mais que o teto, é
 * porque há pelo menos mais uma — então não dá para confiar na leitura, e o fallback assume.
 * Falha de leitura devolve `null` só do bloco dela; nunca zera os vizinhos (EARS).
 */

/** 14 head-counts (1 por etapa) → 1 leitura da coluna `etapa`. */
async function lerContagensEtapa(
  supabase: Supabase,
  etapas: EtapaFunil[],
): Promise<Array<number | null>> {
  const { data, error } = await supabase
    .schema("core")
    .from("v_lead_card")
    .select("etapa")
    .limit(TETO_LEADS_AGREGACAO + 1);
  if (!error && data && data.length <= TETO_LEADS_AGREGACAO) {
    return contarPorEtapa(data as Array<{ etapa?: string | null }>, etapas.map((e) => e.chave));
  }
  // acima do teto (ou leitura falhou): volta aos head-counts, que independem do volume
  return Promise.all(etapas.map((e) => contar(supabase, "v_lead_card", (q) => q.eq("etapa", e.chave))));
}

/** 14 head-counts (7 dias × 2 direções) → 1 leitura da janela. */
async function lerMensagensPorDia(
  supabase: Supabase,
  janelas: JanelaDia[],
): Promise<DiaMensagens[]> {
  const inicio = janelas[0].inicioIso;
  const fim = janelas[janelas.length - 1].fimIso;
  const { data, error } = await supabase
    .schema("core")
    .from("mensagem")
    .select("direcao,criado_em")
    .gte("criado_em", inicio)
    .lt("criado_em", fim)
    .limit(TETO_MENSAGENS_AGREGACAO + 1);
  if (!error && data && data.length <= TETO_MENSAGENS_AGREGACAO) {
    return bucketizarMensagens(data as Array<{ direcao?: string; criado_em?: string }>, janelas);
  }
  return Promise.all(
    janelas.map(async (j) => {
      const [entrada, saida] = await Promise.all([
        contar(supabase, "mensagem", (q) =>
          q.eq("direcao", "entrada").gte("criado_em", j.inicioIso).lt("criado_em", j.fimIso),
        ),
        contar(supabase, "mensagem", (q) =>
          q.eq("direcao", "saida").gte("criado_em", j.inicioIso).lt("criado_em", j.fimIso),
        ),
      ]);
      return { rotulo: j.rotulo, entrada, saida } as DiaMensagens;
    }),
  );
}

/** 3 head-counts → 1 leitura de `status_entrega` das saídas com estado conhecido. */
async function lerEntrega(
  supabase: Supabase,
): Promise<{ base: number | null; entregues: number | null; falhas: number | null }> {
  const { data, error } = await supabase
    .schema("core")
    .from("mensagem")
    .select("status_entrega")
    .eq("direcao", "saida")
    .in("status_entrega", ESTADOS_ENTREGA_CONHECIDA)
    .limit(TETO_MENSAGENS_AGREGACAO + 1);
  if (!error && data && data.length <= TETO_MENSAGENS_AGREGACAO) {
    return contarEntrega(data as Array<{ status_entrega?: string | null }>);
  }
  const [base, entregues, falhas] = await Promise.all([
    contar(supabase, "mensagem", (q) =>
      q.eq("direcao", "saida").in("status_entrega", ESTADOS_ENTREGA_CONHECIDA),
    ),
    contar(supabase, "mensagem", (q) => q.eq("direcao", "saida").in("status_entrega", ["entregue", "lido"])),
    contar(supabase, "mensagem", (q) => q.eq("direcao", "saida").eq("status_entrega", "falhou")),
  ]);
  return { base, entregues, falhas };
}

async function lerPrimeiraResposta(
  supabase: Supabase,
  inicio7dIso: string,
): Promise<{ medianaMin: number | null; amostra: number; parcial: boolean }> {
  // Conjunto limitado pela JANELA (7d), não pelo volume de leads: conversas novas do período…
  const { data: convs, error } = await supabase
    .schema("core")
    .from("conversa")
    .select("id")
    .gte("criado_em", inicio7dIso)
    .limit(TETO_CONVERSAS_7D);
  if (error || !convs || convs.length === 0) return { medianaMin: null, amostra: 0, parcial: false };

  // …e só 3 colunas das mensagens delas (o cálculo do par entrada→saída precisa da ordem).
  // Follow-up declarado no PR: o .in() com até 300 UUIDs (~11KB de querystring) funciona, mas
  // filtrar por janela de tempo na própria mensagem é mais robusto quando o volume crescer.
  const ids = convs.map((c: any) => String(c.id));
  const { data: msgs, error: erroMsgs } = await supabase
    .schema("core")
    .from("mensagem")
    .select("conversa_id,direcao,criado_em")
    .in("conversa_id", ids)
    .order("criado_em", { ascending: true })
    .limit(TETO_MENSAGENS_7D);
  if (erroMsgs || !msgs) return { medianaMin: null, amostra: 0, parcial: false };

  const tempos = minutosPrimeiraResposta(msgs as MensagemMinima[]);
  const parcial = convs.length >= TETO_CONVERSAS_7D || msgs.length >= TETO_MENSAGENS_7D;
  return { medianaMin: mediana(tempos), amostra: tempos.length, parcial };
}

async function lerValorNegociacao(
  supabase: Supabase,
  etapasAbertas: string[],
): Promise<DadosDashboard["valorNegociacao"]> {
  // Soma no servidor Next (não no navegador): PostgREST sem sum() → trafega SÓ a coluna
  // `valor` das linhas não-null (Kommo só preenche price no fechamento → conjunto pequeno).
  const { data, error } = await supabase
    .schema("core")
    .from("v_lead_card")
    .select("valor")
    .in("etapa", etapasAbertas)
    .not("valor", "is", null)
    .limit(1000);
  const valores = error || !data ? [] : data.map((r: any) => Number(r.valor));
  const semValor = await contar(supabase, "v_lead_card", (q) =>
    q.in("etapa", etapasAbertas).is("valor", null),
  );
  return { total: somaValores(valores), comValor: valores.length, semValor };
}

/**
 * R19 · fila dos agentes: 1 leitura estreita das pendentes (`agente,criado_em`, teto+1 como
 * detector — F24a). Acima do teto ou com erro na leitura larga, volta ao head-count: o TOTAL
 * continua certo e a quebra por agente fica indisponível (null), nunca inventada.
 */
async function lerSugestoes(supabase: Supabase): Promise<DadosDashboard["sugestoes"]> {
  const { data, error } = await supabase
    .schema("core")
    .from("sugestao_ia")
    .select("agente,criado_em")
    .eq("status", "pendente")
    .limit(TETO_SUGESTOES_AGREGACAO + 1);
  if (!error && data && data.length <= TETO_SUGESTOES_AGREGACAO) {
    return resumirSugestoes(data as Array<{ agente?: string | null; criado_em?: string | null }>);
  }
  const pendentes = await contar(supabase, "sugestao_ia", (q) => q.eq("status", "pendente"));
  return { pendentes, porAgente: null, maisAntigaEm: null };
}

/**
 * R23 · RF-15.3 — PRECISÃO POR AGENTE.
 *
 * UMA leitura estreita de (`agente`,`status`) restrita às DECIDIDAS, no molde F24a: teto+1 como
 * detector. Medido em 17/08/2026: 32 decididas de 437 sugestões — a leitura estreita cabe com
 * folga de duas ordens de grandeza no teto de 5.000.
 *
 * O filtro `.in("status", STATUS_DECIDIDOS)` é o que torna isto barato E correto ao mesmo tempo:
 * ele deixa no banco as 405 pendentes, que são 93% da tabela e não entram na conta.
 *
 * Erro na leitura → `agentes: null`, e a UI mostra "—". Zero por cento é o pior chute possível
 * aqui: seria a régua de autonomia lendo "este agente nunca acerta" por causa de uma query que
 * não voltou.
 */
async function lerPrecisao(supabase: Supabase): Promise<DadosDashboard["precisao"]> {
  const [{ data, error }, ultima] = await Promise.all([
    supabase
      .schema("core")
      .from("sugestao_ia")
      .select("agente,status")
      .in("status", STATUS_DECIDIDOS)
      .limit(TETO_DECIDIDAS_AGREGACAO + 1),
    supabase
      .schema("core")
      .from("sugestao_ia")
      .select("validado_em")
      .in("status", STATUS_DECIDIDOS)
      .not("validado_em", "is", null)
      .order("validado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const ultimaDecisaoEm = ultima.error || !ultima.data ? null : (ultima.data.validado_em as string);
  if (error || !data || data.length > TETO_DECIDIDAS_AGREGACAO) {
    return { agentes: null, geral: null, ultimaDecisaoEm };
  }
  const agentes = precisaoPorAgente(data as Array<{ agente?: string | null; status?: string | null }>);
  return { agentes, geral: precisaoGeral(agentes), ultimaDecisaoEm };
}

/**
 * R23 · RF-15.4 — SAÚDE DO FLUXO, de `core.v_saude_fluxo` (migration 0180).
 *
 * Uma linha, uma ida. A conta mora em `ops.v_saude_fluxo` (0020) e é a MESMA que o F2 lê — a 0180
 * só a atravessa para a Data API, porque `ops` não está exposto. Enquanto a 0180 não estiver
 * aplicada no ambiente, a leitura falha e `disponivel: false` faz a UI escrever "não medido —
 * fonte não exposta" em vez de desenhar zeros, que aqui seriam a mentira mais perigosa do painel:
 * lag zero e falha zero é exatamente como um sistema saudável se parece.
 */
async function lerSaudeFluxo(supabase: Supabase): Promise<SaudeFluxo | null> {
  const { data, error } = await supabase
    .schema("core")
    .from("v_saude_fluxo")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const num = (v: unknown): number | null => (v == null ? null : Number(v));
  return {
    disponivel: true,
    eventosUltimoMinuto: num((data as any).eventos_ultimo_minuto),
    eventosUltimaHora: num((data as any).eventos_ultima_hora),
    duplicadosUltimaHora: num((data as any).duplicados_rejeitados_ultima_hora),
    falhasUltimaHora: num((data as any).falhas_ultima_hora),
    lagFilaEventos: num((data as any).lag_fila_eventos),
    idadeFilaEventosSeg: num((data as any).idade_fila_eventos_seg),
    lagFilaSaida: num((data as any).lag_fila_saida),
    idadeFilaSaidaSeg: num((data as any).idade_fila_saida_seg),
    enviosFalhados24h: num((data as any).envios_falhados_24h),
    ultimaIngestaoWhatsapp: (data as any).ultima_ingestao_whatsapp ?? null,
  };
}

/**
 * R23 · a data do último lead e da última mensagem QUE EXISTEM no ledger.
 *
 * Existe para um propósito único: separar "não houve" de "não entrou". Medido em 17/08/2026, o
 * lead mais novo do ledger é de 22/07 e a última mensagem de 20/07 — então "0 novos hoje" não é
 * um dia fraco, é ingestão parada. Sem este par de datas o painel não tem como dizer a diferença,
 * e mostrar o zero sozinho é exatamente o que a regra do Rodolfo proíbe.
 */
async function lerRecencia(supabase: Supabase): Promise<DadosDashboard["recencia"]> {
  const [lead, msg] = await Promise.all([
    supabase.schema("core").from("lead").select("criado_em").order("criado_em", { ascending: false }).limit(1).maybeSingle(),
    supabase.schema("core").from("mensagem").select("criado_em").order("criado_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    ultimoLeadCriadoEm: lead.error || !lead.data ? null : (lead.data.criado_em as string),
    ultimaMensagemEm: msg.error || !msg.data ? null : (msg.data.criado_em as string),
  };
}

/**
 * PONTO DE TROCA do F24b (contrato no §F24b da Trilha D): no dia em que
 * `api.painel_resumo(p_dias int default 7)` existir — devolvendo UM jsonb com as chaves que
 * `DadosDashboard` já tem —, `lerDashboard` vira UMA chamada e tudo abaixo passa a ser o caminho
 * de fallback. É por isso que as agregações estão em funções próprias e a lógica de contagem está
 * em `dashboard-calculos.ts`: trocar a fonte não deve exigir reescrever a conta.
 */
export async function lerDashboard(
  agora = new Date(),
  cliente?: Supabase,
): Promise<DadosDashboard> {
  const supabase = cliente ?? criarClienteServidor();
  const janelas: JanelaDia[] = janelasUltimosDias(agora, 7);
  const inicioHojeIso = janelas[janelas.length - 1].inicioIso;
  const inicio7dIso = janelas[0].inicioIso;

  // As leituras que dependem das ETAPAS (contagens por etapa e valor em negociação) esperam só
  // lerEtapasReais; todo o resto dispara imediatamente em paralelo — um round-trip a menos por visita.
  const dependentesDeEtapas = (async () => {
    const etapas = (await lerEtapasReais(supabase)) ?? ETAPAS_PADRAO;
    const etapasAbertas = etapas.filter((e) => e.tipo === "aberto").map((e) => e.chave);
    const [contagensEtapa, valorNegociacao] = await Promise.all([
      lerContagensEtapa(supabase, etapas),
      lerValorNegociacao(supabase, etapasAbertas),
    ]);
    return { etapas, contagensEtapa, valorNegociacao };
  })();

  const [
    ultimoEventoEm,
    novosHoje,
    novos7d,
    porDia,
    { base, entregues, falhas },
    primeiraResposta,
    { etapas, contagensEtapa, valorNegociacao },
    sugestoes,
    precisao,
    saudeFluxo,
    recencia,
  ] = await Promise.all([
    lerUltimoEvento(supabase),
    contar(supabase, "lead", (q) => q.gte("criado_em", inicioHojeIso)),
    contar(supabase, "lead", (q) => q.gte("criado_em", inicio7dIso)),
    lerMensagensPorDia(supabase, janelas),
    lerEntrega(supabase),
    lerPrimeiraResposta(supabase, inicio7dIso),
    dependentesDeEtapas,
    lerSugestoes(supabase),
    // R23: as três leituras novas entram no MESMO Promise.all — o painel não ganha nem um
    // round-trip serial por causa delas (medido: a visita continua no tempo da leitura mais lenta).
    lerPrecisao(supabase),
    lerSaudeFluxo(supabase),
    lerRecencia(supabase),
  ]);

  const leadsPorEtapa: FaixaEtapa[] = etapas.map((etapa, i) => ({ etapa, qtd: contagensEtapa[i] }));
  const ativas = leadsPorEtapa.filter((f) => f.etapa.tipo === "aberto");
  const leadsAtivos = ativas.some((f) => f.qtd == null)
    ? null
    : ativas.reduce((s, f) => s + (f.qtd ?? 0), 0);

  return {
    ultimoEventoEm,
    leadsPorEtapa,
    leadsAtivos,
    novosHoje,
    novos7d,
    mensagens7d: porDia,
    entrega: {
      base,
      entregues,
      falhas,
      pct: base != null && entregues != null ? percentualEntrega(entregues, base) : null,
    },
    primeiraResposta,
    valorNegociacao,
    sugestoes,
    precisao,
    saudeFluxo,
    recencia,
  };
}
