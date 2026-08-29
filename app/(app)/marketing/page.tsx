import { lerPapelAtual, podeVerMarketing } from "@/components/configuracoes/dados/porta";
import { lerFlagModuloMarketing, lerMarketing, periodoDaUrl } from "@/lib/dados/marketing";
import { PainelMarketing } from "@/components/marketing/painel";
import { RecusaMarketing } from "@/components/marketing/recusa";

/**
 * `/marketing` — Server Component, sempre o estado atual (numero de marketing cacheado e
 * numero que ja foi verdade).
 *
 * A recusa mora na ROTA: quem digita a URL passa por cima de item de menu escondido. A defesa
 * do DADO e a RLS da `0251` (`core.captacao`/`core.custo_midia` so respondem a marketing/admin/
 * owner); a recusa aqui evita que "vazio por RLS" seja lido como "nao houve captacao".
 *
 * A flag `flag.modulo_marketing` e de release: `false` recusa; `null` (linha ausente) NAO desliga.
 */
export const dynamic = "force-dynamic";

export default async function MarketingPage({ searchParams }: { searchParams?: { p?: string; de?: string; ate?: string } }) {
  const [papel, flag] = await Promise.all([lerPapelAtual(), lerFlagModuloMarketing()]);

  if (!podeVerMarketing(papel)) return <RecusaMarketing motivo="papel" papel={papel} />;
  if (flag === false) return <RecusaMarketing motivo="flag" papel={papel} />;

  const periodo = periodoDaUrl(searchParams ?? {});
  const visao = await lerMarketing(periodo);
  return <PainelMarketing visao={visao} />;
}
