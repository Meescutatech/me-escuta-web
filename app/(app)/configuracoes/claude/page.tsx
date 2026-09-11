import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { escopoMcpPara, gerarConexoesMcp } from "@/lib/ensaio/fixtures/claude";
import { ClaudeMcpEnsaio } from "@/components/ensaio/claude-mcp";

export const dynamic = "force-dynamic";

/** /configuracoes/claude — Inteligência › Claude (MCP): o fluxo de conectar, o escopo por cargo, quem está conectado. */
export default function ClaudePage({ searchParams }: { searchParams: { conectado?: string } }) {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/configuracoes/membros");
  const agora = new Date();
  return (
    <ClaudeMcpEnsaio
      eu={ensaio}
      escopo={escopoMcpPara(ensaio)}
      conexoes={gerarConexoesMcp(agora)}
      gestao={ensaio.papel === "owner" || ensaio.papel === "admin"}
      conectadoAgora={searchParams.conectado === "1"}
      agoraIso={agora.toISOString()}
    />
  );
}
