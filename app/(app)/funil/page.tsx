import { lerFunil } from "@/lib/dados/funil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Quadro } from "@/components/funil/quadro";

// Sempre lê o estado atual do funil (sem cache) — projeção do ledger.
export const dynamic = "force-dynamic";

export default async function FunilPage({
  searchParams,
}: {
  searchParams: { lead?: string };
}) {
  // board + autor exibido no drawer (o ator real é carimbado pela porta) em paralelo —
  // getUser vai à rede e não depende do funil
  const supabase = criarClienteServidor();
  const [dados, userRes] = await Promise.all([lerFunil(), supabase.auth.getUser()]);
  const user = userRes.data.user;

  return (
    <Quadro
      dados={dados}
      geradoEm={new Date().toISOString()}
      abrirLead={searchParams.lead ?? null}
      autorEmail={user?.email ?? null}
    />
  );
}
