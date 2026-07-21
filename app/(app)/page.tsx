import { lerDashboard } from "@/lib/dados/dashboard";
import { PainelDashboard } from "@/components/dashboard/painel";

// `/` é o dashboard (Rodada 7, D4) — sempre o estado atual do ledger, sem cache.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const dados = await lerDashboard();
  return <PainelDashboard dados={dados} />;
}
