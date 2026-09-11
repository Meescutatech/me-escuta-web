import { notFound, redirect } from "next/navigation";
import { PainelJarvis } from "@/components/jarvis/painel";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { agenteInteligencia } from "@/lib/ensaio/inteligencia";
import { TelaAgente } from "@/components/inteligencia/tela-agente";

export const dynamic = "force-dynamic";

/**
 * /configuracoes/agentes/[id] — a tela inteira de UM agente: ferramentas, autonomia, execuções
 * (com o trace), instrução, quem valida e onde ele aparece.
 *
 * Fora do ensaio a única rota que já tinha dono é `/jarvis`: ela é o painel de melhoria de prompt
 * da Clara (F9), que segue em produção e continua respondendo aqui. As outras caem na página da
 * Clara enquanto não existe leitura de `core.agente` para esta tela.
 */
export default function AgentePage({ params }: { params: { id: string } }) {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) {
    if (params.id === "jarvis") return <PainelJarvis />;
    redirect("/configuracoes/clara");
  }
  const agente = agenteInteligencia(params.id, new Date());
  if (!agente) notFound();
  return <TelaAgente agente={agente} gestao={ensaio.papel === "owner" || ensaio.papel === "admin"} />;
}
