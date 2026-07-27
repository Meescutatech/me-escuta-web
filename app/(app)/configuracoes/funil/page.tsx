import { lerPapelAtual } from "@/components/configuracoes/dados/porta";
import {
  lerConfigVigente,
  lerContextoValidacao,
  lerHistoricoConfig,
} from "@/components/configuracoes/dados/config";
import { EditorFunil } from "@/components/configuracoes/editor-funil";

export const dynamic = "force-dynamic";

/** F14 · /configuracoes/funil — a tela DEDICADA do funil (mockup r10, tela 1). */
export default async function FunilConfigPage() {
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
