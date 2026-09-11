import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { agentesInteligencia } from "@/lib/ensaio/inteligencia";
import { lerAgentesReais } from "@/lib/dados/agentes";
import { lerPapelAtual } from "@/components/configuracoes/dados/porta";
import { lerCanais } from "@/components/configuracoes/dados/canais";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { CanalEscolhivel } from "@/components/clara/canais-da-clara";
import { CartoesAgentes } from "@/components/inteligencia/cartoes-agentes";

export const dynamic = "force-dynamic";

/**
 * /configuracoes/agentes — a grade dos agentes. Cada card abre a tela dele
 * (`/configuracoes/agentes/[id]`).
 *
 * 11/09/2026: fora do ensaio esta página redirecionava para a da Clara, porque "não há leitura de
 * core.agente para esta tela". Há agora — `lerAgentesReais` traz o estado do banco (quem existe,
 * quem está ligado, que versão de prompt) por cima do editorial do card, e zera os números de 7
 * dias, que eram fixture. O redirecionamento fica só como degrade: se a leitura falhar, a pessoa
 * vai para uma tela que funciona em vez de encarar uma grade vazia.
 */
export default async function AgentesPage({ searchParams }: { searchParams: { agente?: string } }) {
  const ensaio = lerSessaoEnsaio();

  // compatibilidade com os links antigos `?agente=clara`, que abriam uma gaveta
  const chaves = ["clara", "jarvis", "levindo", "priscila"];
  if (searchParams.agente && chaves.includes(searchParams.agente)) {
    redirect(`/configuracoes/agentes/${searchParams.agente}`);
  }

  if (ensaio) {
    return (
      <CartoesAgentes
        agentes={agentesInteligencia(new Date())}
        gestao={ensaio.papel === "owner" || ensaio.papel === "admin"}
      />
    );
  }

  const [reais, papel] = await Promise.all([lerAgentesReais(new Date()), lerPapelAtual()]);
  if (!reais) redirect("/configuracoes/clara");
  // quem liga e desliga agente é gestão — o mesmo corte do ensaio, agora com o papel de verdade
  return <CartoesAgentes agentes={reais} gestao={papel === "owner" || papel === "admin"} />;
}
