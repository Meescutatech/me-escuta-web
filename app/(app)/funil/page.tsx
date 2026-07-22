import { lerFunil } from "@/lib/dados/funil";
import { lerMencionaveis } from "@/lib/dados/mencionaveis";
import { lerTiposTarefa } from "@/lib/dados/tarefa-tipos";
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

  // autor de tarefas/notas criadas no drawer (o ator real é carimbado pela porta) + lista do
  // `@` e tipos de tarefa (R13 / Bloco C) — o drawer é o caminho de criação a partir do funil
  const supabase = criarClienteServidor();
  const [{ data: sessao }, mencionaveis, tipos] = await Promise.all([
    supabase.auth.getUser(),
    lerMencionaveis(),
    lerTiposTarefa(),
  ]);

  return (
    <Quadro
      dados={dados}
      geradoEm={new Date().toISOString()}
      abrirLead={searchParams.lead ?? null}
      autorEmail={sessao.user?.email ?? null}
      autorId={sessao.user?.id ?? null}
      mencionaveis={mencionaveis}
      tiposTarefa={tipos.tipos}
    />
  );
}
