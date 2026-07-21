import { lerConversas, lerMensagens, lerSugestoesConversa } from "@/lib/dados/conversas";
import { Inbox } from "@/components/conversas/inbox";

export const dynamic = "force-dynamic";

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: { c?: string; lead?: string };
}) {
  const conversas = await lerConversas();

  // conversa selecionada: ?c explícito, senão a primeira do inbox
  const selecionadaId =
    (searchParams.c && conversas.find((c) => c.id === searchParams.c)?.id) ||
    conversas[0]?.id ||
    null;

  const [mensagens, sugestoes] = selecionadaId
    ? await Promise.all([lerMensagens(selecionadaId), lerSugestoesConversa(selecionadaId)])
    : [[], []];

  return (
    <Inbox
      conversas={conversas}
      selecionadaId={selecionadaId}
      mensagens={mensagens}
      sugestoes={sugestoes}
    />
  );
}
