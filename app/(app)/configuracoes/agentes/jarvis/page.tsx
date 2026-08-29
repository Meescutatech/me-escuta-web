import { PainelJarvis } from "@/components/jarvis/painel";

export const dynamic = "force-dynamic";

/**
 * Configurações → Agentes → Jarvis (F9): o painel de MELHORIA DE PROMPT da Clara (@jarvis propõe,
 * você valida, vira evento). Morava em /jarvis; a rota /jarvis agora é o chat. O componente é o
 * mesmo — só mudou de casa.
 */
export default function ConfiguracoesJarvisPage() {
  return <PainelJarvis />;
}
