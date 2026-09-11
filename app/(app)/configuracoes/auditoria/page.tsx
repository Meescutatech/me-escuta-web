import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { gerarConfigsPublicadas } from "@/lib/ensaio/fixtures/operacao";
import { AuditoriaEnsaio } from "@/components/ensaio/auditoria";

export const dynamic = "force-dynamic";

/** Sistema › Auditoria e histórico — o que "Avançado" era, sem o balde. Fora do ensaio, a tela antiga (`/avancado`) segue. */
export default function AuditoriaPage() {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/configuracoes/avancado");
  const agora = new Date();
  return <AuditoriaEnsaio configs={gerarConfigsPublicadas(agora)} gestao={ensaio.papel === "owner" || ensaio.papel === "admin"} agoraIso={agora.toISOString()} />;
}
