import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { gerarIntegracoesEnsaio } from "@/lib/ensaio/fixtures/integracoes";
import { ConexoesEnsaio } from "@/components/ensaio/conexoes";

export const dynamic = "force-dynamic";

/**
 * /configuracoes/conexoes — o encanamento, em lista. Era `/configuracoes/meta`, dentro de Canais.
 * Fora do ensaio a leitura real ainda não existe (cada conexão tem uma origem de estado diferente:
 * Graph API, WuzAPI, Kommo, Resend, o nosso MCP), então redireciona para Canais em vez de mostrar
 * uma lista vazia que pareceria defeito.
 */
export default function ConexoesPage() {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/configuracoes/canais");
  const gestao = ensaio.papel === "owner" || ensaio.papel === "admin";
  return <ConexoesEnsaio conexoes={gerarIntegracoesEnsaio(new Date())} gestao={gestao} />;
}
