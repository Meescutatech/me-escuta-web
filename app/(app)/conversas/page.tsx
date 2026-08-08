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
import { lerTemplatesWhatsapp } from "@/lib/dados/templates-whatsapp";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerEstadoEscopo } from "@/lib/dados/departamentos";
import { Inbox } from "@/components/conversas/inbox";

export const dynamic = "force-dynamic";

/**
 * M6/R18 — `/conversas` É A TELA DE REFERÊNCIA DO ESCOPO (ARB-R17-11), e é a única nesta rodada.
 *
 * Por que uma tela entra, quando a spec dizia "não aplico o escopo nas telas": o C9 mede o HTML
 * DESTA rota. Se nenhuma tela obedecesse dentro do M6, o C9 mediria entrega de terceiro e **não
 * conseguiria ficar verde** — e critério que não consegue ficar verde ou trava o item ou é
 * dispensado por conveniência, e dispensá-lo levaria junto a única asserção da rodada que distingue
 * escopo real de filtro feito no cliente. Custa uma tela, não sete, e é o que separa "entreguei o
 * mecanismo" de "provei que o mecanismo funciona".
 *
 * O funil, tarefas e o resto ficam com os donos de cada tela, com o parâmetro que este arquivo
 * demonstra como consumir.
 */

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
  // O escopo é lido ANTES da lista porque ele é PREDICADO DA CONSULTA, não filtro do resultado. Se
  // fosse lido depois, a lista já teria chegado inteira ao servidor — e a tentação seguinte seria
  // filtrar aqui, que é meio caminho para filtrar no cliente.
  const { escopo, ativo: departamentoAtivo } = await lerEstadoEscopo();
  const [pagina, etapasReais, userRes, mencionaveis, tipos, templatesLidos, hsmLidos] =
    await Promise.all([
      lerConversas({ escopo }),
      lerEtapasReais(),
      supabase.auth.getUser(),
      lerMencionaveis(), // R13/C4-C5: lista canônica do `@` (core.v_membro + core.agente)
      lerTiposTarefa(), // R13/C6: config `tipo_tarefa`, com semente provisória
      lerTemplates(), // SPEC-TEMPLATES §6: menu / do composer (degrade: lista vazia)
      // B4 · SPEC-B §7: os templates HSM do popover de fora da janela. Leitura SEPARADA da de
      // cima porque são conceitos separados — e porque a projeção da SPEC-B pode não existir
      // neste ambiente sem que isso tenha nada a ver com a resposta rápida, que existe.
      lerTemplatesWhatsapp(),
    ]);
  const { conversas } = pagina;
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
      total={pagina.total}
      corte={pagina.corte}
      proximoCursor={pagina.proximoCursor}
      origemLegivel={pagina.origemLegivel}
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
      templatesWhatsapp={hsmLidos.templates}
      etapas={etapas}
      departamentoAtivo={
        departamentoAtivo
          ? { chave: departamentoAtivo.chave, rotulo: departamentoAtivo.rotulo }
          : null
      }
    />
  );
}
