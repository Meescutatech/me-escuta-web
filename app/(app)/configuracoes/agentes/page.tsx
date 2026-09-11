import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { gerarAgentesEnsaio } from "@/lib/ensaio/fixtures/agentes";
import { AgentesEnsaio } from "@/components/ensaio/agentes";

export const dynamic = "force-dynamic";

/**
 * /configuracoes/agentes — o hub dos agentes (Clara, Jarvis, Levindo, Priscila). Fora do ensaio,
 * enquanto não há leitura de `core.agente` para a tela, cai na página da Clara que já existe.
 */
export default function AgentesPage({ searchParams }: { searchParams: { agente?: string } }) {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/configuracoes/clara");
  const agora = new Date();
  const chaves = ["clara", "jarvis", "levindo", "priscila"] as const;
  const abrir = chaves.find((c) => c === searchParams.agente) ?? null;
  return (
    <AgentesEnsaio
      agentes={gerarAgentesEnsaio(agora)}
      gestao={ensaio.papel === "owner" || ensaio.papel === "admin"}
      agoraIso={agora.toISOString()}
      abrirInicial={abrir}
    />
  );
}
