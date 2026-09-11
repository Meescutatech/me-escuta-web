import { permanentRedirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { gerarRelatos } from "@/lib/ensaio/fixtures/operacao";
import { SuporteEnsaio } from "@/components/ensaio/suporte";

export const dynamic = "force-dynamic";

/**
 * Sistema › Suporte. Em ensaio, a tela nova (lista + fio + resolver). Fora dele, o endereço real
 * continua sendo `/suporte` (M5/R18: suporte não é ajuste de workspace) — redireciona.
 */
export default function SuportePage() {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) permanentRedirect("/suporte");
  const agora = new Date();
  return <SuporteEnsaio relatos={gerarRelatos(agora)} gestao={ensaio.papel === "owner" || ensaio.papel === "admin"} eu={ensaio.nome} agoraIso={agora.toISOString()} />;
}
