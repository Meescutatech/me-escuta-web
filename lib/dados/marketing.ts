import { criarClienteServidor } from "@/lib/supabase/server";
import { lerEtapasReais } from "./funil";
import {
  montarVisao,
  type CustoCru,
  type EtapaLeadCru,
  type FonteVocabulario,
  type Periodo,
  type ToqueCru,
  type VisaoMarketing,
} from "./marketing-calculos";
import { entradaDeEnsaio } from "./marketing-ensaio";

export { PRESETS, hojeSP, periodoDaUrl, type Periodo, type VisaoMarketing } from "./marketing-calculos";

/**
 * Marketing — a LEITURA (servidor, mesma sessao/RLS do resto do app).
 *
 * Linhas cruas de `core.captacao`, `core.custo_midia` e `core.estado_lead`; a composicao e
 * pura e mora em `marketing-calculos.ts`. Cada leitura degrada para `null` sozinha: o que
 * falhou vira "—" na tela, nunca zero.
 *
 * Teto declarado com `+1` como detector: bater no teto acende `parcial`, nunca vira total
 * silenciosamente parcial. Medido em 22/08/2026: producao tem ZERO linhas nas duas tabelas.
 */

type Supabase = ReturnType<typeof criarClienteServidor>;

export const TETO_TOQUES = 20000;
export const TETO_CUSTO = 20000;
// Medido em 03/09: com 400 ids o `in()` falha (4 tentativas com backoff, o lote seguinte nunca
// sai). Limiar observado no navegador: 322 leads passa, 398 falha. 200 fica com folga.
const LOTE_ETAPAS = 200;

const COLUNAS_TOQUE =
  "lead_id,fonte,plataforma,campanha_id,campanha_nome,anuncio_id,anuncio_nome,utm,clids,hierarquia_estado,capturado_em,criado_em";
const COLUNAS_CUSTO = "dia,plataforma,campanha_id,campanha_nome,custo,impressoes,cliques,ingerido_em";

/** Modo de ensaio: fixture no lugar do banco. So com a env explicita; nunca por padrao. */
export function ensaioLigado(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEXT_PUBLIC_MARKETING_ENSAIO === "1";
}

async function contar(supabase: Supabase, tabela: string, filtros: (q: any) => any): Promise<number | null> {
  try {
    const { count, error } = await filtros(supabase.schema("core").from(tabela).select("*", { count: "exact", head: true }));
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

async function extremo(supabase: Supabase, tabela: string, coluna: string, ascendente: boolean): Promise<string | null> {
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
 * A flag de release. `null` = a linha nao existe em `core.config` (so nasce por migration).
 * Ausente NAO desliga: a tela funciona; so `false` recusa.
 */
export async function lerFlagModuloMarketing(supabase: Supabase = criarClienteServidor()): Promise<boolean | null> {
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

async function listar<T>(
  supabase: Supabase,
  tabela: string,
  colunas: string,
  teto: number,
  filtros: (q: any) => any,
): Promise<{ linhas: T[]; parcial: boolean } | null> {
  try {
    const { data, error } = await filtros(supabase.schema("core").from(tabela).select(colunas)).limit(teto + 1);
    if (error || !data) return null;
    const linhas = data as T[];
    return { linhas: linhas.slice(0, teto), parcial: linhas.length > teto };
  } catch {
    return null;
  }
}

/** A etapa ATUAL dos leads captados, em lotes (o `in()` tem limite de URL). */
async function lerEtapasDosLeads(supabase: Supabase, leadIds: string[]): Promise<EtapaLeadCru[] | null> {
  const ids = [...new Set(leadIds)];
  if (ids.length === 0) return [];
  try {
    const saida: EtapaLeadCru[] = [];
    for (let i = 0; i < ids.length; i += LOTE_ETAPAS) {
      const { data, error } = await supabase
        .schema("core")
        .from("estado_lead")
        .select("lead_id,etapa")
        .in("lead_id", ids.slice(i, i + LOTE_ETAPAS));
      if (error) return null;
      saida.push(...((data ?? []) as EtapaLeadCru[]));
    }
    return saida;
  } catch {
    return null;
  }
}

export async function lerMarketing(periodo: Periodo, agora: Date = new Date()): Promise<VisaoMarketing> {
  if (ensaioLigado()) return montarVisao(entradaDeEnsaio(periodo, agora));

  const supabase = criarClienteServidor();
  const iniIso = `${periodo.ini}T00:00:00-03:00`;
  const fimIso = `${periodo.fim}T00:00:00-03:00`;

  const [toquesLidos, custosLidos, inicioSerie, custoLinhasTotal, vocabulario, flagAtiva, etapas] = await Promise.all([
    listar<ToqueCru>(supabase, "captacao", COLUNAS_TOQUE, TETO_TOQUES, (q) =>
      q.gte("capturado_em", iniIso).lt("capturado_em", fimIso).order("capturado_em", { ascending: true }),
    ),
    listar<CustoCru>(supabase, "custo_midia", COLUNAS_CUSTO, TETO_CUSTO, (q) =>
      q.gte("dia", periodo.ini).lt("dia", periodo.fim).order("dia", { ascending: true }),
    ),
    extremo(supabase, "captacao", "capturado_em", true),
    contar(supabase, "custo_midia", (q) => q),
    lerVocabulario(supabase),
    lerFlagModuloMarketing(supabase),
    lerEtapasReais(supabase),
  ]);

  const toques = toquesLidos?.linhas ?? [];
  const etapasLeads = await lerEtapasDosLeads(
    supabase,
    toques.map((t) => t.lead_id),
  );

  return montarVisao({
    periodo,
    toques,
    custos: custosLidos?.linhas ?? [],
    // 🔴 SEM `?? []` DE PROPOSITO. O `?? []` apagava a diferenca entre "a leitura FALHOU" e
    // "nao achou ninguem", e o funil imprimia 0 (0%) com toda a confianca — que e a conclusao
    // OPOSTA. Medido em 03/09 na janela de 90 dias: a tela dizia qualificado 0 / consulta 0 /
    // venda 0 enquanto o SQL dava 5 / 2 / 1. O banner vermelho ate acendia; ninguem olha o
    // banner quando a tabela ao lado mostra numero. `null` viaja ate o fim e vira "—".
    etapasLeads,
    etapas: (etapas ?? []).map((e) => ({ chave: e.chave, nome: e.nome, ordem: e.ordem, tipo: e.tipo })),
    parcial: Boolean(toquesLidos?.parcial || custosLidos?.parcial),
    leituraFalhou: toquesLidos == null || custosLidos == null || etapasLeads == null,
    inicioSerie,
    custoLinhasTotal: custoLinhasTotal ?? 0,
    vocabulario,
    flagAtiva,
    agora,
  });
}
