import { criarClienteServidor } from "@/lib/supabase/server";
import { lerFunil } from "./funil";
import {
  janelaDoPeriodo,
  resumirAgora,
  resumirAtendimento,
  resumirFunil,
  resumirPorAtor,
  serieDiaria,
  somarDiasNegocio,
  valorEmNegociacao,
  type Ator,
  type Atendimento,
  type EtapaResumo,
  type Janela,
  type LinhaAtorDia,
  type LinhaDia,
  type LinhaEtapaDia,
  type LinhaFunil,
  type LinhaPrimeiraResposta,
  type PeriodoDias,
  type PontoDia,
  type ResumoAgora,
  type ResumoAtor,
} from "./dashboard-ceo-calculos";

/**
 * Leitura do DASHBOARD DO CEO (R27 · F6) — as seis views `api.v_dashboard_*` (0300/0301), lidas
 * com a MESMA sessao/RLS do resto do app. As views devolvem dia a dia (ultimos 190 dias); a conta
 * do periodo e da comparacao mora em `dashboard-ceo-calculos.ts` (pura, testada).
 *
 * Bloco que nao veio (view ainda nao aplicada, erro de leitura) entra em `indisponiveis` e a UI
 * escreve "—" naquele bloco — nunca zero inventado, e nunca derruba os vizinhos.
 */

export interface DadosDashboardCeo {
  periodo: PeriodoDias;
  janela: Janela;
  geradoEm: string;
  /** filtro "ver como" — chave de ator, ou null = todos */
  atorFiltro: string | null;
  atores: Ator[];
  negocio: ReturnType<typeof somarDiasNegocio>;
  serie: PontoDia[];
  atendimento: Atendimento;
  porAtor: ResumoAtor[];
  funil: EtapaResumo[];
  valorNegociacao: ReturnType<typeof valorEmNegociacao>;
  agora: ResumoAgora | null;
  /** nomes das views que nao responderam */
  indisponiveis: string[];
}

type Supabase = ReturnType<typeof criarClienteServidor>;

// As views cobrem 190 dias; 2 x 90 = 180 linhas por ator no pior caso. Os tetos abaixo sao
// detectores (teto+1): se a leitura voltar cheia, o bloco e marcado indisponivel em vez de
// somar uma janela cortada e apresentar como inteira.
const TETO_LINHAS = 20000;

async function lerView<T>(
  supabase: Supabase,
  view: string,
  indisponiveis: string[],
  monta: (q: any) => any = (q) => q,
): Promise<T[]> {
  try {
    const { data, error } = await monta(supabase.schema("api").from(view).select("*")).limit(TETO_LINHAS + 1);
    if (error || !data || data.length > TETO_LINHAS) {
      indisponiveis.push(view);
      return [];
    }
    return data as T[];
  } catch {
    indisponiveis.push(view);
    return [];
  }
}

export async function lerDashboardCeo(
  periodo: PeriodoDias,
  atorFiltro: string | null,
  agora = new Date(),
  cliente?: Supabase,
): Promise<DadosDashboardCeo> {
  const supabase = cliente ?? criarClienteServidor();
  const janela = janelaDoPeriodo(periodo, agora);
  const indisponiveis: string[] = [];
  const desde = janela.inicioAnterior;

  const [atores, atorDia, primeira, dias, etapaDia, funil, board] = await Promise.all([
    lerView<Ator>(supabase, "v_dashboard_ator", indisponiveis),
    lerView<LinhaAtorDia>(supabase, "v_dashboard_ator_dia", indisponiveis, (q) => q.gte("dia", desde)),
    lerView<LinhaPrimeiraResposta>(supabase, "v_dashboard_primeira_resposta", indisponiveis, (q) =>
      q.gte("dia", desde).order("dia", { ascending: true }),
    ),
    lerView<LinhaDia>(supabase, "v_dashboard_dia", indisponiveis, (q) => q.gte("dia", desde)),
    lerView<LinhaEtapaDia>(supabase, "v_dashboard_etapa_dia", indisponiveis, (q) => q.gte("dia", desde)),
    lerView<LinhaFunil>(supabase, "v_dashboard_funil", indisponiveis),
    // o board inteiro (v_lead_card + sla_etapas) — a MESMA leitura do funil, para a % em AGORA
    // sair da mesma regra de cor que pinta os cards (D55).
    lerFunil(supabase).catch(() => null),
  ]);

  const atorDiaFiltrado = atorFiltro ? atorDia.filter((l) => l.ator === atorFiltro) : atorDia;
  const primeiraFiltrada = atorFiltro ? primeira.filter((p) => p.respondida_por === atorFiltro) : primeira;

  return {
    periodo,
    janela,
    geradoEm: agora.toISOString(),
    atorFiltro,
    atores,
    negocio: somarDiasNegocio(dias, janela),
    serie: serieDiaria(dias, atorDia, janela, atorFiltro),
    atendimento: resumirAtendimento(primeiraFiltrada, atorDiaFiltrado, janela),
    porAtor: resumirPorAtor(atores, atorDia, primeira, janela),
    funil: resumirFunil(funil, etapaDia, janela, atorFiltro),
    valorNegociacao: valorEmNegociacao(funil),
    agora: board && board.cards.length > 0 ? resumirAgora(board.cards, board.sla, agora.getTime()) : null,
    indisponiveis,
  };
}
