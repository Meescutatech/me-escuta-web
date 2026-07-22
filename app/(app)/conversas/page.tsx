import { lerConversas, lerMensagens, lerSugestoesConversa } from "@/lib/dados/conversas";
import { ETAPAS_PADRAO, lerEtapasReais } from "@/lib/dados/funil";
import { lerPainelLead, type PainelLead } from "@/lib/dados/lead-painel";
import { lerMencionaveis } from "@/lib/dados/mencionaveis";
import { lerTiposTarefa } from "@/lib/dados/tarefa-tipos";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Inbox } from "@/components/conversas/inbox";

export const dynamic = "force-dynamic";

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: { c?: string; lead?: string };
}) {
  const [conversas, etapasReais] = await Promise.all([lerConversas(), lerEtapasReais()]);
  const etapas = etapasReais ?? ETAPAS_PADRAO; // régua do funil no painel do lead (r9)

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

  // painel do lead (ficha + tarefas + anotações + menções) da conversa selecionada — R8/R13
  const painel: PainelLead | null = selecionada?.lead_id
    ? await lerPainelLead(selecionada.lead_id)
    : null;

  // autor das notas/tarefas criadas aqui. O uuid é o dado forte (responsavel_id / autor_id /
  // mencionado_id); o e-mail fica só como legado de exibição. O ator do evento é carimbado
  // pela porta de qualquer jeito.
  const supabase = criarClienteServidor();
  const [{ data: sessao }, mencionaveis, tipos] = await Promise.all([
    supabase.auth.getUser(),
    lerMencionaveis(), // R13/C4-C5: lista canônica do `@` (core.v_membro + core.agente)
    lerTiposTarefa(), // R13/C6: config `tipo_tarefa`, com semente provisória
  ]);

  return (
    <Inbox
      conversas={conversas}
      selecionadaId={selecionadaId}
      mensagens={mensagens}
      sugestoes={sugestoes}
      painel={painel}
      autorEmail={sessao.user?.email ?? null}
      autorId={sessao.user?.id ?? null}
      mencionaveis={mencionaveis}
      tiposTarefa={tipos.tipos}
      etapas={etapas}
    />
  );
}
