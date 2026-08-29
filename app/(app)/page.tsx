import { lerDashboardCeo } from "@/lib/dados/dashboard-ceo";
import { interpretarAtor, interpretarPeriodo } from "@/lib/dados/dashboard-ceo-calculos";
import { PainelDashboard } from "@/components/dashboard/painel";

// `/` é o dashboard — a tela do CEO (R27 · F6). Sempre o estado atual do ledger, sem cache.
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // periodo (7/30/90) e "ver como" (ator) vivem na URL — link compartilhavel, sem estado escondido
  const periodo = interpretarPeriodo(searchParams.periodo);
  const ator = interpretarAtor(searchParams.ator);
  const dados = await lerDashboardCeo(periodo, ator);
  return <PainelDashboard dados={dados} />;
}
