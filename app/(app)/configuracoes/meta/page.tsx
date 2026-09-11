import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { gerarIntegracoesEnsaio } from "@/lib/ensaio/fixtures/integracoes";
import { IntegracoesEnsaio } from "@/components/ensaio/integracoes";

export const dynamic = "force-dynamic";

/**
 * /configuracoes/meta — Canais › Meta / WhatsApp. O ENCANAMENTO por trás dos números: o app da
 * Meta (WABA, webhook, qualidade), o servidor do Lite, e os dois serviços pequenos que existem de
 * verdade (Kommo, para importar; Resend, em espera). "Integrações" como seção morreu (Diogo,
 * 22:00): não há integração além do MCP, que tem tela própria em Inteligência › Claude.
 */
export default function MetaPage() {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/configuracoes/canais");
  const so = new Set(["meta", "lite", "kommo", "resend"]);
  return (
    <IntegracoesEnsaio
      titulo="Meta / WhatsApp"
      descricao="O app da Meta de onde nascem os números oficiais, e o servidor do Lite que pareia os celulares. Os números em si ficam em Números conectados."
      integracoes={gerarIntegracoesEnsaio().filter((i) => so.has(i.chave))}
      gestao={ensaio.papel === "owner" || ensaio.papel === "admin"}
    />
  );
}
