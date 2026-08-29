import { lerVisaoTarefas } from "@/lib/dados/tarefas-visao";
import { lerMencionaveis } from "@/lib/dados/mencionaveis";
import { lerTiposTarefa } from "@/lib/dados/tarefa-tipos";
import { parseFiltros } from "@/lib/dados/tarefas-visao-calculos";
import { criarClienteServidor } from "@/lib/supabase/server";
import { VisaoTarefas } from "@/components/tarefas/visao-tarefas";
import { lerEmAndamento } from "@/lib/tarefas/andamento";

// Sempre lê o estado atual — projeção do ledger, nunca cache.
export const dynamic = "force-dynamic";

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // tarefas (v_tarefa, RLS) + usuário ("minhas tarefas") + membros e tipos (filtros/rótulos)
  const supabase = criarClienteServidor();
  const [dados, userRes, mencionaveis, tipos, emAndamento] = await Promise.all([
    lerVisaoTarefas(),
    supabase.auth.getUser(),
    lerMencionaveis(),
    lerTiposTarefa(),
    lerEmAndamento(), // F8: degrada honesto sem a 0305 (conjunto vazio, disponivel=false)
  ]);
  const ver = Array.isArray(searchParams.ver) ? searchParams.ver[0] : searchParams.ver;

  return (
    <VisaoTarefas
      dados={dados}
      filtrosIniciais={parseFiltros(searchParams)}
      meuId={userRes.data.user?.id ?? null}
      mencionaveis={mencionaveis}
      tiposTarefa={tipos.tipos}
      emAndamento={emAndamento}
      quadroInicial={ver === "quadro"}
    />
  );
}
