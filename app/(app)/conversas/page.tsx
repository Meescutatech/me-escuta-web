import {
  lerConversas,
  lerMensagens,
  lerSugestoesConversa,
  type Mensagem,
  type SugestaoMensagem,
} from "@/lib/dados/conversas";
import { ETAPAS_PADRAO, lerEtapasReais } from "@/lib/dados/funil";
import { lerPainelLead, type PainelLead } from "@/lib/dados/lead-painel";
import { lerMencionaveis } from "@/lib/dados/mencionaveis";
import { lerTiposTarefa } from "@/lib/dados/tarefa-tipos";
import { lerNomeMembro, lerTemplates } from "@/lib/dados/templates";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Inbox } from "@/components/conversas/inbox";

export const dynamic = "force-dynamic";

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: { c?: string; lead?: string };
}) {
  // autor exibido (getUser vai à rede) + insumos do composer em paralelo com a lista —
  // nada aqui depende de nada. O autor das notas/tarefas sai desta mesma chamada: o uuid é o
  // dado forte (responsavel_id / autor_id / mencionado_id) e o e-mail fica só como legado de
  // exibição. O ator do evento é carimbado pela porta de qualquer jeito.
  const supabase = criarClienteServidor();
  const [conversas, etapasReais, userRes, mencionaveis, tipos, templatesLidos] = await Promise.all([
    lerConversas(),
    lerEtapasReais(),
    supabase.auth.getUser(),
    lerMencionaveis(), // R13/C4-C5: lista canônica do `@` (core.v_membro + core.agente)
    lerTiposTarefa(), // R13/C6: config `tipo_tarefa`, com semente provisória
    lerTemplates(), // SPEC-TEMPLATES §6: menu / do composer (degrade: lista vazia)
  ]);
  const etapas = etapasReais ?? ETAPAS_PADRAO; // régua do funil no painel do lead (r9)
  const user = userRes.data.user;
  // {{atendente}} vem do NOME de core.v_membro — nunca do e-mail (spec §5.1)
  const nomeAtendente = await lerNomeMembro(user?.id ?? null);

  // conversa selecionada: ?c explícito → ?lead (vindo do funil) → a primeira do inbox
  const selecionadaId =
    (searchParams.c && conversas.find((c) => c.id === searchParams.c)?.id) ||
    (searchParams.lead && conversas.find((c) => c.lead_id === searchParams.lead)?.id) ||
    conversas[0]?.id ||
    null;
  const selecionada = conversas.find((c) => c.id === selecionadaId) ?? null;

  // mensagens + sugestões + painel do lead (ficha/tarefas/anotações/menções, R8/R13) em
  // paralelo: todos dependem só da conversa selecionada, não uns dos outros
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
      autorId={user?.id ?? null}
      nomeAtendente={nomeAtendente}
      mencionaveis={mencionaveis}
      tiposTarefa={tipos.tipos}
      templates={templatesLidos.templates.filter((t) => t.ativo)}
      etapas={etapas}
    />
  );
}
