import { lerVisaoTarefas } from "@/lib/dados/tarefas-visao";
import { lerMencionaveis } from "@/lib/dados/mencionaveis";
import { lerTiposTarefa } from "@/lib/dados/tarefa-tipos";
import { parseFiltros } from "@/lib/dados/tarefas-visao-calculos";
import { criarClienteServidor } from "@/lib/supabase/server";
import { VisaoTarefas } from "@/components/tarefas/visao-tarefas";

// Sempre lê o estado atual — projeção do ledger, nunca cache.
export const dynamic = "force-dynamic";

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // tarefas (v_tarefa, RLS) + usuário ("minhas tarefas") + membros e tipos (filtros/rótulos)
  const supabase = criarClienteServidor();
  const [dados, userRes, mencionaveis, tipos] = await Promise.all([
    lerVisaoTarefas(),
    supabase.auth.getUser(),
    lerMencionaveis(),
    lerTiposTarefa(),
  ]);

  return (
    <VisaoTarefas
      dados={dados}
      filtrosIniciais={parseFiltros(searchParams)}
      meuId={userRes.data.user?.id ?? null}
      mencionaveis={mencionaveis}
      tiposTarefa={tipos.tipos}
    />
  );
}
