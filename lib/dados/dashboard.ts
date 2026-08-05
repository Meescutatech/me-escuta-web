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
  TETO_SUGESTOES_AGREGACAO,
  type JanelaDia,
  type MensagemMinima,
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
  ] = await Promise.all([
    lerUltimoEvento(supabase),
    contar(supabase, "lead", (q) => q.gte("criado_em", inicioHojeIso)),
    contar(supabase, "lead", (q) => q.gte("criado_em", inicio7dIso)),
    lerMensagensPorDia(supabase, janelas),
    lerEntrega(supabase),
    lerPrimeiraResposta(supabase, inicio7dIso),
    dependentesDeEtapas,
    lerSugestoes(supabase),
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
  };
}
