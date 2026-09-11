import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { escopoMcpPara, gerarConexoesMcp } from "@/lib/ensaio/fixtures/claude";
import { ClaudeMcp } from "@/components/inteligencia/claude-mcp";

export const dynamic = "force-dynamic";

/** /configuracoes/claude — conectar o Claude ao sistema, com o escopo do próprio cargo. */
export default function ClaudePage({ searchParams }: { searchParams: { conectado?: string } }) {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/configuracoes/membros");
  return (
    <ClaudeMcp
      eu={ensaio}
      escopo={escopoMcpPara(ensaio)}
      conexoes={gerarConexoesMcp(new Date())}
      gestao={ensaio.papel === "owner" || ensaio.papel === "admin"}
      jaConectado={searchParams.conectado === "1"}
    />
  );
}
