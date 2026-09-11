import { lerConfigsVigentes, lerHistoricoConfig } from "@/components/configuracoes/dados/config";
import { ListaChaves } from "@/components/configuracoes/lista-chaves";
import { autorDaVersao } from "@/components/configuracoes/regras/config.ts";
import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";

export const dynamic = "force-dynamic";

/**
 * F14 · /configuracoes/avancado — o inventário. O autor da versão vigente vem do histórico (a
 * `v_config_vigente` não expõe `criado_por`), lido em paralelo por chave.
 */
export default async function AvancadoPage() {
  // W-D2 (2ª passada): "Avançado" morreu — vira Sistema › Auditoria e histórico.
  if (lerSessaoEnsaio()) redirect("/configuracoes/auditoria");

  const { vigentes, indisponivel } = await lerConfigsVigentes();

  const pares = await Promise.all(
    vigentes.map(async (v) => {
      const { versoes } = await lerHistoricoConfig(v.nome);
      const atual = versoes.find((x) => x.versao === v.versao) ?? versoes[0];
      return [v.nome, atual ? (autorDaVersao(atual) ?? atual.criado_por ?? "—") : "—"] as const;
    }),
  );

  return (
    <ListaChaves
      vigentes={vigentes}
      autores={Object.fromEntries(pares)}
      indisponivel={indisponivel}
    />
  );
}
