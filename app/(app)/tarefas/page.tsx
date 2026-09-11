import { lerVisaoTarefas } from "@/lib/dados/tarefas-visao";
import { lerMencionaveis } from "@/lib/dados/mencionaveis";
import { lerTiposTarefa } from "@/lib/dados/tarefa-tipos";
import { parseFiltros } from "@/lib/dados/tarefas-visao-calculos";
import { criarClienteServidor } from "@/lib/supabase/server";
import { VisaoTarefas } from "@/components/tarefas/visao-tarefas";
import { lerEmAndamento } from "@/lib/tarefas/andamento";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { mencionaveisEnsaio } from "@/lib/ensaio/fixtures/mencionaveis";
import { TIPOS_TAREFA_SEMENTE } from "@/lib/tarefa-tipos";
import { visaoTarefasDeEnsaio } from "@/lib/dados/tarefas-ensaio";

// Sempre lê o estado atual — projeção do ledger, nunca cache.
export const dynamic = "force-dynamic";

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // W-D2 · modo ensaio: a fixture de /tarefas já existia (NEXT_PUBLIC_TAREFAS_ENSAIO); o que
  // vazava eram as leituras ao redor (getUser, mencionáveis, tipos, em-andamento).
  const ensaio = lerSessaoEnsaio();
  if (ensaio) {
    const { emAndamento, ...dados } = visaoTarefasDeEnsaio();
    const ver = Array.isArray(searchParams.ver) ? searchParams.ver[0] : searchParams.ver;
    return (
      <VisaoTarefas
        dados={dados}
        filtrosIniciais={parseFiltros(searchParams)}
        meuId={ensaio.id}
        mencionaveis={mencionaveisEnsaio()}
        tiposTarefa={TIPOS_TAREFA_SEMENTE}
        emAndamento={{ ids: emAndamento, disponivel: true }}
        quadroInicial={ver === "quadro"}
      />
    );
  }

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
