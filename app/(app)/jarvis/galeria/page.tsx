import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { GaleriaJarvis } from "@/components/jarvis/galeria";
import { RESPONSAVEIS_ENSAIO, jarvisDizEnsaio, propostasInlineEnsaio, propostasTarefaEnsaio, reguaJarvisEnsaio } from "@/lib/ensaio/jarvis";

export const dynamic = "force-dynamic";

/**
 * /jarvis/galeria — GALERIA TEMPORÁRIA (W-J, 10/09/2026) dos 5 componentes do Jarvis, só em modo
 * ensaio (`?como=sara`). Fora do ensaio cai em /jarvis. Sai quando as telas donas montarem os
 * componentes.
 */
export default function GaleriaJarvisPage() {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/jarvis");
  const agora = new Date();
  return (
    <GaleriaJarvis
      quem={ensaio.nome.split(" ")[0]}
      responsaveis={RESPONSAVEIS_ENSAIO}
      inline={propostasInlineEnsaio(agora)}
      tarefas={propostasTarefaEnsaio(agora)}
      diz={jarvisDizEnsaio(agora)}
      regua={reguaJarvisEnsaio()}
      podeEditarRegua={ensaio.papel === "owner" || ensaio.papel === "admin"}
    />
  );
}
