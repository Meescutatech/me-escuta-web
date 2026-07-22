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
  const dados = await lerFunil();

  // autor exibido em tarefas/anotações criadas no drawer (o ator real é carimbado pela porta)
  const supabase = criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <Quadro
      dados={dados}
      geradoEm={new Date().toISOString()}
      abrirLead={searchParams.lead ?? null}
      autorEmail={user?.email ?? null}
    />
  );
}
