import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { agentesInteligencia } from "@/lib/ensaio/inteligencia";
import { CartoesAgentes } from "@/components/inteligencia/cartoes-agentes";

export const dynamic = "force-dynamic";

/**
 * /configuracoes/agentes — a grade dos quatro agentes. Cada card abre a tela dele
 * (`/configuracoes/agentes/[id]`). Fora do ensaio, enquanto não há leitura de `core.agente` para
 * esta tela, cai na página da Clara, que já existe.
 */
export default function AgentesPage({ searchParams }: { searchParams: { agente?: string } }) {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/configuracoes/clara");
  // compatibilidade com os links antigos `?agente=clara`, que abriam uma gaveta
  const chaves = ["clara", "jarvis", "levindo", "priscila"];
  if (searchParams.agente && chaves.includes(searchParams.agente)) {
    redirect(`/configuracoes/agentes/${searchParams.agente}`);
  }
  return (
    <CartoesAgentes
      agentes={agentesInteligencia(new Date())}
      gestao={ensaio.papel === "owner" || ensaio.papel === "admin"}
    />
  );
}
