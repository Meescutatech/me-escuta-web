import { lerPapelAtual, podeVerMarketing } from "@/components/configuracoes/dados/porta";
import { lerFlagModuloMarketing, lerMarketing, periodoDaUrl } from "@/lib/dados/marketing";
import { PainelMarketing } from "@/components/marketing/painel";
import { RecusaMarketing } from "@/components/marketing/recusa";

/**
 * T7 · A TELA DO FERNANDO — `/marketing` (RF-10, RF-11, RF-12, RF-13).
 *
 * Server Component, sempre o estado atual: recorte de período não se cacheia, porque um
 * número de marketing cacheado é um número que já foi verdade.
 *
 * A RECUSA MORA AQUI, NA ROTA — e o negativo do RF-12 é literal sobre isso: "acessa a rota
 * DIRETO PELA URL · então recusa · teste na rota, não só item de menu escondido". Item de menu
 * ausente é organização; não é controle de acesso, e quem digita a URL passa por cima dele.
 *
 * O que a rota NÃO é: a defesa do dado. Essa é a RLS da `0251` — `core.captacao` e
 * `core.custo_midia` só respondem a `marketing`/`admin`/`owner`. Se esta rota falhasse aberta,
 * a tela viria vazia, não cheia. A recusa aqui existe para que "vazio por RLS" nunca seja
 * confundido com "vazio porque não houve captação", que é a distinção que a tela inteira
 * defende.
 */
export const dynamic = "force-dynamic";

export default async function MarketingPage({
  searchParams,
}: {
  searchParams?: { p?: string; de?: string; ate?: string };
}) {
  const [papel, flag] = await Promise.all([lerPapelAtual(), lerFlagModuloMarketing()]);

  if (!podeVerMarketing(papel)) {
    return <RecusaMarketing motivo="papel" papel={papel} />;
  }

  // A flag é de RELEASE (dod da spec: "deploy atrás de `flag.modulo_marketing`; rollback =
  // desligar a flag"). `null` = a linha ainda não existe em `core.config`, e ela só nasce por
  // migration — a porta recusa publicar `flag.*` pela tela (0075). Ausente NÃO desliga: a tela
  // funciona e declara no rodapé que não está atrás de flag nenhuma. Desligar por ausência
  // deixaria a tela inacessível esperando trabalho de outro repo, sem ninguém saber por quê.
  if (flag === false) {
    return <RecusaMarketing motivo="flag" papel={papel} />;
  }

  const periodo = periodoDaUrl(searchParams ?? {});
  const visao = await lerMarketing(periodo);
  return <PainelMarketing visao={visao} />;
}
