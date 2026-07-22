import {
  lerConversas,
  lerMensagens,
  lerSugestoesConversa,
  type Mensagem,
  type SugestaoMensagem,
} from "@/lib/dados/conversas";
import { ETAPAS_PADRAO, lerEtapasReais } from "@/lib/dados/funil";
import { lerPainelLead, type PainelLead } from "@/lib/dados/lead-painel";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Inbox } from "@/components/conversas/inbox";

export const dynamic = "force-dynamic";

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: { c?: string; lead?: string };
}) {
  // autor exibido (getUser vai à rede) em paralelo com a lista — nada aqui depende de nada
  const supabase = criarClienteServidor();
  const [conversas, etapasReais, userRes] = await Promise.all([
    lerConversas(),
    lerEtapasReais(),
    supabase.auth.getUser(),
  ]);
  const etapas = etapasReais ?? ETAPAS_PADRAO; // régua do funil no painel do lead (r9)
  const user = userRes.data.user;

  // conversa selecionada: ?c explícito → ?lead (vindo do funil) → a primeira do inbox
  const selecionadaId =
    (searchParams.c && conversas.find((c) => c.id === searchParams.c)?.id) ||
    (searchParams.lead && conversas.find((c) => c.lead_id === searchParams.lead)?.id) ||
    conversas[0]?.id ||
    null;
  const selecionada = conversas.find((c) => c.id === selecionadaId) ?? null;

  // mensagens + sugestões + painel do lead (ficha/tarefas/anotações, Rodada 8) em paralelo:
  // todos dependem só da conversa selecionada, não uns dos outros
  const [mensagens, sugestoes, painel]: [Mensagem[], SugestaoMensagem[], PainelLead | null] =
    await Promise.all([
      selecionadaId ? lerMensagens(selecionadaId) : Promise.resolve([]),
      selecionadaId ? lerSugestoesConversa(selecionadaId) : Promise.resolve([]),
      selecionada?.lead_id ? lerPainelLead(selecionada.lead_id) : Promise.resolve(null),
    ]);

  return (
    <Inbox
      conversas={conversas}
      selecionadaId={selecionadaId}
      mensagens={mensagens}
      sugestoes={sugestoes}
      painel={painel}
      autorEmail={user?.email ?? null}
      etapas={etapas}
    />
  );
}
