import { notFound } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { agenteInteligencia } from "@/lib/ensaio/inteligencia";
import { lerAgenteReal } from "@/lib/dados/agentes";
import { lerTarefasCriadasPeloAgente } from "@/lib/dados/execucoes-jarvis";
import { lerPapelAtual } from "@/components/configuracoes/dados/porta";
import { TelaAgente } from "@/components/inteligencia/tela-agente";

export const dynamic = "force-dynamic";

/**
 * /configuracoes/agentes/[id] — a tela inteira de UM agente: ferramentas, autonomia, instrução,
 * quem valida e onde ele aparece.
 *
 * 11/09/2026: fora do ensaio, só `jarvis` tinha dono (o painel de prompt da Clara) e o resto caía
 * na página da Clara. Agora a mesma `TelaAgente` do ensaio serve os dois caminhos, com o estado
 * vindo de `core.agente`. `notFound()` em vez de redirecionar: agente que não existe é 404, não
 * um desvio silencioso para outro agente — mandar alguém para a Clara quando pediu Priscila é a
 * classe de mentira que essa rodada inteira existiu para tirar.
 */
export default async function AgentePage({ params }: { params: { id: string } }) {
  const ensaio = lerSessaoEnsaio();
  if (ensaio) {
    const agente = agenteInteligencia(params.id, new Date());
    if (!agente) notFound();
    return <TelaAgente agente={agente} gestao={ensaio.papel === "owner" || ensaio.papel === "admin"} ensaio />;
  }

  // o histórico só existe para quem grava `origem` na tarefa — hoje, o Jarvis. Para os outros a
  // seção simplesmente não aparece (11/09: "se isso não é documentado, remova a seção do front").
  const [agente, papel, criadas] = await Promise.all([
    lerAgenteReal(params.id, new Date()),
    lerPapelAtual(),
    // `[]` (e não `null`) para quem não tem origem própria: lista vazia é um fato lido, `null`
    // seria "não consegui ler" — e a tela diz coisas diferentes nos dois casos.
    params.id === "jarvis" ? lerTarefasCriadasPeloAgente(undefined, 10) : Promise.resolve([]),
  ]);
  if (!agente) notFound();
  return <TelaAgente agente={agente} gestao={papel === "owner" || papel === "admin"} criadas={criadas} />;
}
