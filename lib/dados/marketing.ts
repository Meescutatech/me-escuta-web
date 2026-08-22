import { criarClienteServidor } from "@/lib/supabase/server";
import {
  montarVisao,
  type CustoCru,
  type FonteVocabulario,
  type Periodo,
  type ToqueCru,
  type VisaoMarketing,
} from "./marketing-calculos";

// O recorte mora nos calculos (testavel sem alias `@/`); a tela continua importando daqui.
export {
  PRESETS,
  hojeSP,
  periodoDaUrl,
  RECENTES,
  type Periodo,
  type VisaoMarketing,
} from "./marketing-calculos";

/**
 * T7 - A LEITURA da tela do Fernando. SERVIDOR (mesma sessao/RLS do resto do app).
 *
 * =========================================================================================
 * O CAMINHO E PROPRIO, E ISSO E O REQUISITO - NAO UMA PREFERENCIA DE ARQUITETURA
 * =========================================================================================
 * A T6 entregou `core.casamento_midia(date,date)`, que responde os cinco baldes em SQL. Esta
 * tela NAO A CHAMA, e o comentario da propria funcao diz por que: ela e o ORACULO contra o
 * qual a tela e conferida. Tela que chama o oraculo compara a consulta consigo mesma.
 *
 * Entao aqui a leitura e CRUA - linhas de `core.captacao` e `core.custo_midia` - e a
 * agregacao acontece em `marketing-calculos.ts`, em TypeScript. Dois caminhos de naturezas
 * diferentes; se divergirem, um dos dois esta errado, e o teste tem de poder dizer qual.
 *
 * =========================================================================================
 * TETO DECLARADO, E ELE APARECE NA TELA
 * =========================================================================================
 * Ler linha crua nao escala sozinho. O teto abaixo e o limite; o `+1` no `limit` e o detector
 * (se voltou mais que o teto, ha pelo menos mais uma). Bater no teto NAO vira agregacao
 * silenciosamente parcial: `parcial` acende e a tela avisa - numero parcial com cara de total
 * e a mesma familia de defeito que o zero sem causa.
 *
 * Medido em 22/08/2026: producao tem ZERO linhas em `core.captacao` e ZERO em
 * `core.custo_midia`. O teto e folga larga para o volume medido (43-73 leads/semana, M27).
 */

type Supabase = ReturnType<typeof criarClienteServidor>;

export const TETO_TOQUES = 20000;
export const TETO_CUSTO = 20000;

/** Colunas lidas de `core.captacao` - so as que a tela usa, nada de `select *`. */
const COLUNAS_TOQUE =
  "lead_id,fonte,plataforma,campanha_id,campanha_nome,anuncio_id,anuncio_nome,utm,clids,hierarquia_estado,capturado_em,criado_em";

const COLUNAS_CUSTO = "dia,plataforma,campanha_id,campanha_nome,custo,impressoes,cliques,ingerido_em";

// =========================================================================================
// A VISAO COMPLETA - o que a tela recebe pronto
// =========================================================================================

async function contar(
  supabase: Supabase,
  tabela: string,
  filtros: (q: any) => any,
): Promise<number | null> {
  try {
    const { count, error } = await filtros(
      supabase.schema("core").from(tabela).select("*", { count: "exact", head: true }),
    );
    return error ? null : count ?? 0;
  } catch {
    return null;
  }
}

/** Extremo de uma coluna de data (min ou max). `null` = sem linha, ou leitura falhou. */
async function extremo(
  supabase: Supabase,
  tabela: string,
  coluna: string,
  ascendente: boolean,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .schema("core")
      .from(tabela)
      .select(coluna)
      .not(coluna, "is", null)
      .order(coluna, { ascending: ascendente })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return ((data as unknown as Record<string, unknown>)[coluna] as string) ?? null;
  } catch {
    return null;
  }
}

/** O vocabulario v2 (T2). Sem ele, (a) e (b) nao tem como classificar - e a tela diz isso. */
async function lerVocabulario(supabase: Supabase): Promise<FonteVocabulario[] | null> {
  try {
    const { data, error } = await supabase
      .schema("core")
      .from("v_config_vigente")
      .select("payload")
      .eq("nome", "canal_captacao")
      .maybeSingle();
    const lista = (data as any)?.payload?.fontes;
    if (error || !Array.isArray(lista)) return null;
    return lista.map((f: any) => ({
      chave: String(f.chave),
      rotulo: String(f.rotulo ?? f.chave),
      ativo: f.ativo !== false,
      pago_organico: f.pago_organico ?? null,
      plataforma: f.plataforma ?? null,
    }));
  } catch {
    return null;
  }
}

/**
 * A flag de release da spec (`dod`: "deploy atras de `flag.modulo_marketing`").
 *
 * `null` = a linha NAO EXISTE em `core.config` - e ela so nasce por migration, porque a porta
 * recusa publicar `flag.*` pela tela (0075). Enquanto nao nascer, a tela funciona e DECLARA
 * que nao esta atras de flag nenhuma. O contrario - tratar ausente como desligada - deixaria
 * a tela inacessivel esperando trabalho de outro repo, e ninguem veria o aviso para saber por que.
 */
export async function lerFlagModuloMarketing(
  supabase: Supabase = criarClienteServidor(),
): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .schema("core")
      .from("v_config_vigente")
      .select("payload")
      .eq("nome", "flag.modulo_marketing")
      .maybeSingle();
    if (error || !data) return null;
    const ativa = (data as any)?.payload?.ativa;
    return typeof ativa === "boolean" ? ativa : null;
  } catch {
    return null;
  }
}

/** Lista com deteccao de teto pelo `+1`. Falha devolve `null` (diferente de lista vazia). */
async function listar<T>(
  supabase: Supabase,
  tabela: string,
  colunas: string,
  teto: number,
  filtros: (q: any) => any,
): Promise<{ linhas: T[]; parcial: boolean } | null> {
  try {
    const { data, error } = await filtros(
      supabase.schema("core").from(tabela).select(colunas),
    ).limit(teto + 1);
    if (error || !data) return null;
    const linhas = data as T[];
    return { linhas: linhas.slice(0, teto), parcial: linhas.length > teto };
  } catch {
    return null;
  }
}

/**
 * A leitura inteira da tela. Nenhuma falha derruba as vizinhas: cada bloco degrada para
 * `null`, e `null` vira "—" na tela, nunca zero.
 */
export async function lerMarketing(periodo: Periodo, agora: Date = new Date()): Promise<VisaoMarketing> {
  const supabase = criarClienteServidor();
  const iniIso = `${periodo.ini}T00:00:00-03:00`;
  const fimIso = `${periodo.fim}T00:00:00-03:00`;

  const [
    toquesLidos,
    custosLidos,
    semData,
    leadsNoPeriodo,
    inicioSerie,
    ultimaCaptacao,
    custoLinhasTotal,
    ultimaIngestao,
    ultimoDiaCusto,
    vocabulario,
    flagAtiva,
  ] = await Promise.all([
    listar<ToqueCru>(supabase, "captacao", COLUNAS_TOQUE, TETO_TOQUES, (q) =>
      q.gte("capturado_em", iniIso).lt("capturado_em", fimIso).order("capturado_em", { ascending: false }),
    ),
    listar<CustoCru>(supabase, "custo_midia", COLUNAS_CUSTO, TETO_CUSTO, (q) =>
      q.gte("dia", periodo.ini).lt("dia", periodo.fim).order("dia", { ascending: false }),
    ),
    // FORA do recorte de proposito (C-1d): toque sem data de ocorrencia nao pertence a
    // periodo nenhum, e sem esta contagem ele sumiria dos dois lados do filtro.
    contar(supabase, "captacao", (q) => q.is("capturado_em", null)),
    // OUTRA BASE, e a tela diz isso ao lado do numero: leads em `core.lead`, nao toques.
    contar(supabase, "lead", (q) => q.gte("criado_em", iniIso).lt("criado_em", fimIso)),
    extremo(supabase, "captacao", "capturado_em", true),
    extremo(supabase, "captacao", "capturado_em", false),
    contar(supabase, "custo_midia", (q) => q),
    extremo(supabase, "custo_midia", "ingerido_em", false),
    extremo(supabase, "custo_midia", "dia", false),
    lerVocabulario(supabase),
    lerFlagModuloMarketing(supabase),
  ]);

  // A COMPOSICAO E PURA e mora nos calculos: e a mesma funcao que a rota de ensaio usa. Se o
  // ensaio montasse a visao por conta propria, ele deixaria de provar a tela de verdade.
  return montarVisao({
    periodo,
    toques: toquesLidos?.linhas ?? [],
    custos: custosLidos?.linhas ?? [],
    parcial: Boolean(toquesLidos?.parcial || custosLidos?.parcial),
    leituraFalhou: toquesLidos == null || custosLidos == null,
    leadsSemData: semData ?? 0,
    leadsNoPeriodo,
    inicioSerie,
    ultimaCaptacao,
    custoLinhasTotal: custoLinhasTotal ?? 0,
    // O custo tem DOIS carimbos possiveis e eles respondem coisas diferentes: `dia` e ate
    // quando o gasto vai, `ingerido_em` e quando NOS buscamos. Quem envelhece a tela e o
    // segundo - a ingestao parada e o que faz o numero de hoje ser o de anteontem.
    ultimoCusto: ultimaIngestao ?? ultimoDiaCusto,
    vocabulario,
    flagAtiva,
    agora,
  });
}
