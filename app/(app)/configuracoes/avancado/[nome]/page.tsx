import { notFound } from "next/navigation";
import { lerPapelAtual } from "@/components/configuracoes/dados/porta";
import {
  lerConfigVigente,
  lerConfigsVigentes,
  lerContextoValidacao,
  lerHistoricoConfig,
} from "@/components/configuracoes/dados/config";
import { podeEditarConfig } from "@/components/configuracoes/regras/config.ts";
import { EditorConfig } from "@/components/configuracoes/editor-config";

export const dynamic = "force-dynamic";

/**
 * F14 · /configuracoes/avancado/<nome>. A allowlist é conferida AQUI também, no servidor: a lista
 * já não oferece o link, mas URL digitada à mão não passa pela lista — e a porta recusaria depois
 * de a pessoa ter editado a tela inteira.
 */
export default async function ChavePage({ params }: { params: { nome: string } }) {
  const nome = decodeURIComponent(params.nome);
  const [papel, vigente, historico, contexto, todas] = await Promise.all([
    lerPapelAtual(),
    lerConfigVigente(nome),
    lerHistoricoConfig(nome),
    lerContextoValidacao(),
    lerConfigsVigentes(),
  ]);

  if (!podeEditarConfig(nome, todas.vigentes.map((v) => v.nome)).editavel) notFound();

  return (
    <EditorConfig
      nome={nome}
      vigente={vigente}
      historico={historico.versoes}
      contexto={contexto}
      meuPapel={papel}
    />
  );
}
