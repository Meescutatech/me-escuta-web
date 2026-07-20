import { lerFunil } from "@/lib/dados/funil";
import { Quadro } from "@/components/funil/quadro";

// Sempre lê o estado atual do funil (sem cache) — projeção do ledger.
export const dynamic = "force-dynamic";

export default async function FunilPage() {
  const dados = await lerFunil();
  return <Quadro dados={dados} />;
}
