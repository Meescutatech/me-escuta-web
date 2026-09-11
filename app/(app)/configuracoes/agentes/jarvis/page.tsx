import { PainelJarvis } from "@/components/jarvis/painel";
import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";

export const dynamic = "force-dynamic";

/**
 * Configurações → Agentes → Jarvis (F9): o painel de MELHORIA DE PROMPT da Clara (@jarvis propõe,
 * você valida, vira evento). Morava em /jarvis; a rota /jarvis agora é o chat. O componente é o
 * mesmo — só mudou de casa.
 */
export default function ConfiguracoesJarvisPage() {
  // W-D2 (2ª passada): em ensaio o Jarvis mora na sheet de Agentes — uma fonte só.
  if (lerSessaoEnsaio()) redirect("/configuracoes/agentes?agente=jarvis");

  return <PainelJarvis />;
}
