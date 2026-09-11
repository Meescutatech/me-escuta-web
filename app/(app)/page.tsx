import { lerPapelAtual, podeVerMarketing } from "@/components/configuracoes/dados/porta";
import { PainelDashboard } from "@/components/dashboard/painel";
import { interpretarPeriodo, janelaCustom } from "@/lib/dados/dashboard-ceo-calculos";
import { lerDashboardDono } from "@/lib/dados/dashboard-dono";
import { interpretarAba, interpretarFiltros, interpretarVista } from "@/lib/dados/dashboard-dono-calculos";
import { lerFlagModuloMarketing, lerMarketing, periodoDaUrl } from "@/lib/dados/marketing";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";

// `/` é o dashboard do dono (W-D4). Sempre o estado atual do ledger, sem cache.
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  // periodo (7/30/90), aba, departamento e "ver como" (ator) vivem na URL — link compartilhável,
  // sem estado escondido. A aba decide o que LER: Marketing só é lida quando está aberta.
  const periodo = interpretarPeriodo(searchParams.periodo);
  const aba = interpretarAba(searchParams.aba);
  const vista = interpretarVista(searchParams.vista);
  const filtros = interpretarFiltros(searchParams);
  const agora = new Date();
  const janelaLivre = janelaCustom(searchParams.de, searchParams.ate, agora);

  // Papel: em ensaio vem da fixture (zero consulta); fora dele, do banco.
  const ensaio = lerSessaoEnsaio();
  const papel = ensaio ? ensaio.papel : await lerPapelAtual();
  const verMarketing = podeVerMarketing(papel);
  const mostrarDepartamento = papel === "admin" || papel === "owner";

  const [dados, marketing] = await Promise.all([
    lerDashboardDono(periodo, aba, vista, filtros, agora, janelaLivre),
    aba === "marketing" && verMarketing ? lerMarketingSeLiberado(periodo, Boolean(ensaio), janelaLivre) : Promise.resolve(null),
  ]);

  return <PainelDashboard dados={dados} marketing={marketing} mostrarDepartamento={mostrarDepartamento} verMarketing={verMarketing} janelaLivre={janelaLivre} />;
}

/** A flag de release `flag.modulo_marketing`: `false` recusa; ausente NÃO desliga. Em ensaio nem consulta. */
async function lerMarketingSeLiberado(periodo: 7 | 30 | 90, ensaio: boolean, janelaLivre: { inicio: string; fim: string } | null) {
  if (!ensaio) {
    const flag = await lerFlagModuloMarketing();
    if (flag === false) return null;
  }
  return lerMarketing(janelaLivre ? periodoDaUrl({ de: janelaLivre.inicio, ate: janelaLivre.fim }) : periodoDaUrl({ p: `${periodo}d` }));
}
