import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { gerarAgentesEnsaio } from "@/lib/ensaio/fixtures/agentes";
import { gerarCanaisEnsaio } from "@/lib/ensaio/fixtures/canais";
import { MapaInteligencia } from "@/components/ensaio/mapa-inteligencia";

export const dynamic = "force-dynamic";

/** /configuracoes/inteligencia — a entrada da seção: o Mapa (números → agentes → validadoras → saídas). */
export default function InteligenciaPage() {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/configuracoes/clara");
  const agora = new Date();
  return (
    <MapaInteligencia
      agentes={gerarAgentesEnsaio(agora)}
      canais={gerarCanaisEnsaio(agora)}
      gestao={ensaio.papel === "owner" || ensaio.papel === "admin"}
      agoraIso={agora.toISOString()}
    />
  );
}
