import { lerPapelAtual } from "@/components/configuracoes/dados/porta";
import {
  lerConfigVigente,
  lerContextoValidacao,
  lerHistoricoConfig,
} from "@/components/configuracoes/dados/config";
import { EditorFunil } from "@/components/configuracoes/editor-funil";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { ETAPAS_CONFIG, MOTIVOS_PERDA } from "@/lib/ensaio/fixtures/operacao";
import { FunilConfigEnsaio } from "@/components/ensaio/funil-config";

export const dynamic = "force-dynamic";

/** F14 · /configuracoes/funil — a tela DEDICADA do funil (mockup r10, tela 1). */
export default async function FunilConfigPage() {
  // W-D2 (2ª passada) · modo ensaio: etapas com arraste, SLA por etapa e motivos de perda.
  const ensaio = lerSessaoEnsaio();
  if (ensaio) return <FunilConfigEnsaio etapas={ETAPAS_CONFIG} motivos={MOTIVOS_PERDA} gestao={ensaio.papel === "owner" || ensaio.papel === "admin"} />;

  const [papel, vigente, historico, contexto] = await Promise.all([
    lerPapelAtual(),
    lerConfigVigente("funil_vendas"),
    lerHistoricoConfig("funil_vendas"),
    lerContextoValidacao(),
  ]);

  return (
    <EditorFunil
      vigente={vigente}
      historico={historico.versoes}
      contexto={contexto}
      meuPapel={papel}
      indisponivel={vigente === null}
    />
  );
}
