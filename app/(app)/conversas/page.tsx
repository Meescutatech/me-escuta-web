import { lerConversas, lerMensagens, lerSugestoesConversa } from "@/lib/dados/conversas";
import { lerPainelLead, type PainelLead } from "@/lib/dados/lead-painel";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Inbox } from "@/components/conversas/inbox";

export const dynamic = "force-dynamic";

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: { c?: string; lead?: string };
}) {
  const conversas = await lerConversas();

  // conversa selecionada: ?c explícito → ?lead (vindo do funil) → a primeira do inbox
  const selecionadaId =
    (searchParams.c && conversas.find((c) => c.id === searchParams.c)?.id) ||
    (searchParams.lead && conversas.find((c) => c.lead_id === searchParams.lead)?.id) ||
    conversas[0]?.id ||
    null;
  const selecionada = conversas.find((c) => c.id === selecionadaId) ?? null;

  const [mensagens, sugestoes] = selecionadaId
    ? await Promise.all([lerMensagens(selecionadaId), lerSugestoesConversa(selecionadaId)])
    : [[], []];

  // painel do lead (ficha + tarefas + anotações) da conversa selecionada — Rodada 8
  const painel: PainelLead | null = selecionada?.lead_id
    ? await lerPainelLead(selecionada.lead_id)
    : null;

  // autor das anotações/tarefas criadas aqui (exibição; o ator real é carimbado pela porta)
  const supabase = criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <Inbox
      conversas={conversas}
      selecionadaId={selecionadaId}
      mensagens={mensagens}
      sugestoes={sugestoes}
      painel={painel}
      autorEmail={user?.email ?? null}
    />
  );
}
