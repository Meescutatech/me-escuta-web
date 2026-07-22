import { lerNotificacoes } from "@/lib/dados/notificacoes";
import { Expandida } from "@/components/notificacoes/expandida";

// Sempre lê o estado atual (sem cache) — projeção do ledger, como /funil e /conversas.
export const dynamic = "force-dynamic";

export default async function NotificacoesPage() {
  const { itens } = await lerNotificacoes();
  return <Expandida itens={itens} />;
}
