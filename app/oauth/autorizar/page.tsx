import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { escopoMcpPara } from "@/lib/ensaio/fixtures/claude";
import { OauthAutorizar } from "@/components/ensaio/oauth-autorizar";

export const dynamic = "force-dynamic";

/**
 * /oauth/autorizar — consentimento OAuth da Me Escuta para o MCP. Hoje só em ensaio (mock): a
 * versão real vem com o servidor OAuth do MCP remoto (Twenty `mcp-auth.guard.ts` como referência).
 */
export default function AutorizarPage({ searchParams }: { searchParams: { volta?: string; client?: string } }) {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/login");
  const escopo = escopoMcpPara(ensaio);
  const volta = searchParams.volta && searchParams.volta.startsWith("/") ? searchParams.volta : "/configuracoes/claude";
  return <OauthAutorizar eu={ensaio} escopo={escopo} escopoTitulo={escopo.titulo} volta={volta} />;
}
