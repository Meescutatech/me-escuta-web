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
  // board + autor exibido no drawer (o ator real é carimbado pela porta) + lista do `@` e
  // tipos de tarefa (R13 / Bloco C) em paralelo — o drawer é o caminho de criação a partir do
  // funil, e nada disto depende do funil (getUser vai à rede)
  const supabase = criarClienteServidor();
  const [dados, userRes, mencionaveis, tipos] = await Promise.all([
    lerFunil(),
    supabase.auth.getUser(),
    lerMencionaveis(),
    lerTiposTarefa(),
  ]);
  const user = userRes.data.user;

  return (
    <Quadro
      dados={dados}
      geradoEm={new Date().toISOString()}
      abrirLead={searchParams.lead ?? null}
      autorEmail={user?.email ?? null}
      autorId={user?.id ?? null}
      mencionaveis={mencionaveis}
      tiposTarefa={tipos.tipos}
    />
  );
}
