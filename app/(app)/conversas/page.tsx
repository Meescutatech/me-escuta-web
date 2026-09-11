import {
  lerConversas,
  lerEnviosProgramados,
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
import { lerEstadoEscopo } from "@/lib/dados/departamentos";
import { Inbox } from "@/components/conversas/inbox";
import type { EnvioProgramadoLinha } from "@/lib/conversas/envios-programados";
import { lerSessaoEnsaio, estadoEscopoEnsaio } from "@/lib/ensaio/sessao";
import { mencionaveisEnsaio } from "@/lib/ensaio/fixtures/mencionaveis";
import {
  conversasVisiveisPara,
  etapasEnsaio,
  gerarConversasEnsaio,
  gerarLeadsEnsaio,
  painelLeadEnsaio,
  paginaEnsaio,
} from "@/lib/ensaio/fixtures/conversas";
import { canaisDeEnvio, formatarE164, gerarCanaisEnsaio } from "@/lib/ensaio/fixtures/canais";
import {
  cardDoLeadNovo,
  lerEstadoConversasEnsaio,
  programadasDaConversa,
  propostasComDecisoes,
  resumoDaConversaNova,
  tarefaAceitaComoLead,
} from "@/lib/ensaio/conversas-extra";
import { CONVERSA_JOSE_CARLOS, TAREFA_JOSE_CARLOS, propostasJarvisEnsaio, tarefaDaPropostaAceitaEnsaio } from "@/lib/ensaio/jarvis-propostas";
import { TIPOS_TAREFA_SEMENTE } from "@/lib/tarefa-tipos";
import { PESSOAS } from "@/lib/ensaio/modo";
import { GRUPOS_FICHA_COMPLETA, valoresFichaCompletaEnsaio } from "@/lib/ensaio/ficha-completa";
import { fotosEnsaio } from "@/lib/ensaio/fotos";
import { conversasComTarefaPendente } from "@/lib/tarefas/foco";
import { visaoTarefasDeEnsaio } from "@/lib/dados/tarefas-ensaio";
import type { CanalEnvioComposer } from "@/components/conversas/composer";

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
  searchParams: { c?: string; lead?: string; em?: string; foco?: string };
}) {
  // W-D2 · MODO ENSAIO: o mesmo <Inbox>, alimentado pela fixture. Visibilidade = R4 do contrato
  // (por papel + lotação + canal próprio) e escopo do header, os dois aplicados no servidor.
  const ensaio = lerSessaoEnsaio();
  if (ensaio) {
    const agora = new Date();
    const { escopo, ativo } = estadoEscopoEnsaio(ensaio);
    const canais = gerarCanaisEnsaio(agora);
    const { conversas: daFixture, mensagens: porConversa } = gerarConversasEnsaio(agora);
    // W-D3 · o que a demo mudou e o cookie lembra: conversas abertas pelo "+", tarefas aceitas do
    // Jarvis, programadas canceladas, decisões sobre as propostas. Tudo SOMA por cima da fixture.
    const estado = lerEstadoConversasEnsaio();
    const leads = gerarLeadsEnsaio(agora);
    const novas = estado.conversas
      .map((n) => resumoDaConversaNova(n, canais, leads))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .filter((c) => !daFixture.some((f) => f.id === c.id));
    const todas = [...novas.reverse(), ...daFixture];
    const conversas = conversasVisiveisPara(ensaio, todas, escopo, canais);
    const alvoPedido = searchParams.c ?? searchParams.lead ?? null;
    const doAlvo =
      (searchParams.c && conversas.find((c) => c.id === searchParams.c)?.id) ||
      (searchParams.lead && conversas.find((c) => c.lead_id === searchParams.lead)?.id) ||
      null;
    const selecionadaId = doAlvo || (alvoPedido ? null : conversas[0]?.id) || null;
    const selecionada = conversas.find((c) => c.id === selecionadaId) ?? null;
    const novaSelecionada = estado.conversas.find((n) => n.id === selecionadaId) ?? null;
    const lead = selecionada?.lead_id
      ? leads.find((l) => l.lead_id === selecionada.lead_id) ?? (novaSelecionada ? cardDoLeadNovo(novaSelecionada, ensaio) : null)
      : null;
    // mensagens da selecionada, menos as programadas que a pessoa cancelou nesta demo
    const mensagensSel = (selecionadaId ? porConversa.get(selecionadaId) ?? [] : []).filter(
      (m) => !(m.programada_para && estado.canceladas.includes(m.id)),
    );
    // as propostas do Jarvis (fixture + decisões), só das conversas que esta pessoa vê
    const visiveisIds = new Set(conversas.map((c) => c.id));
    const propostas = propostasComDecisoes(propostasJarvisEnsaio(agora), estado).filter((p) => !!p.conversa_id && visiveisIds.has(p.conversa_id));
    // proposta decidida → tarefa que nasceu dela ("Ver tarefa" na nota; e o registro não duplica)
    const tarefasPorProposta: Record<string, string> = { "prop-ensaio-jose-carlos": TAREFA_JOSE_CARLOS };
    for (const d of estado.propostas) if (d.tarefa_id) tarefasPorProposta[d.id] = d.tarefa_id;
    // W-D3 v3 · etapa movida pelo painel sobrescreve a fixture (na conversa e no lead)
    const movida = selecionada?.lead_id ? estado.etapas[selecionada.lead_id] : undefined;
    if (movida && selecionada) {
      selecionada.etapa = movida.etapa;
      selecionada.etapa_nome = etapasEnsaio().find((e) => e.chave === movida.etapa)?.nome ?? movida.etapa;
      selecionada.entrou_etapa_em = movida.em;
      if (lead) {
        lead.etapa = movida.etapa;
        lead.entrou_etapa_em = movida.em;
      }
    }
    // painel do lead + as tarefas que nasceram de propostas aceitas (a da fixture e as do cookie)
    // + as tarefas do lead na fixture de /tarefas (W-D5), para o painel e a fila contarem a mesma coisa
    const painel = lead ? painelLeadEnsaio(lead, agora) : null;
    if (painel && selecionada) {
      const aceitas = [
        ...(selecionada.id === CONVERSA_JOSE_CARLOS ? [tarefaDaPropostaAceitaEnsaio(agora)] : []),
        ...estado.tarefas.filter((t) => t.conversa_id === selecionada.id || (t.lead_id && t.lead_id === selecionada.lead_id)).map(tarefaAceitaComoLead),
      ];
      const daFila = visaoTarefasDeEnsaio(agora, { leadsDoFunil: true }).tarefas.filter((t) => t.lead_id === selecionada.lead_id);
      const vistos = new Set<string>();
      painel.tarefas = [...aceitas, ...painel.tarefas, ...daFila]
        .filter((t) => (vistos.has(t.id) ? false : (vistos.add(t.id), true)))
        .map((t) => (estado.concluidas.includes(t.id) ? { ...t, status: "concluida", concluida_em: t.concluida_em ?? agora.toISOString() } : t));
      // W-D3 v4 · a FICHA COMPLETA: os slugs de `core.lead_campo` de produção, nos 7 grupos do
      // Diogo, com valores verossímeis por lead (`lib/ensaio/ficha-completa.ts`) + o que a pessoa editou
      painel.ficha = {
        grupos: GRUPOS_FICHA_COMPLETA,
        valores: {
          ...(lead ? valoresFichaCompletaEnsaio(lead, agora) : {}),
          ...(selecionada.lead_id ? estado.ficha[selecionada.lead_id] ?? {} : {}),
        },
      };
    }
    // W-D3 v6 · `?foco=1`: a lista vira a fila de tarefas desta pessoa (ordem vencida→hoje→futura).
    // A leitura é a MESMA de /tarefas (fixture do ensaio); em produção troca a origem em foco.ts.
    const foco = searchParams.foco === "1";
    const linhasFoco = conversasComTarefaPendente(ensaio.id, {}, agora).filter((l) => visiveisIds.has(l.conversa_id));
    const envio = canaisDeEnvio(ensaio, canais);
    const canaisEnvio: CanalEnvioComposer[] = envio.canais.map((c) => ({
      id: c.canal_id,
      apelido: c.apelido,
      numero: formatarE164(c.numero_e164),
      provedor: c.provedor,
      producao: c.finalidade === "producao" && c.provedor === "waba",
      proprio: c.responsavel_id === ensaio.id,
    }));
    const mencionaveis = mencionaveisEnsaio(agora);
    return (
      <Inbox
        conversas={conversas}
        total={conversas.length}
        corte={false}
        proximoCursor={null}
        origemLegivel
        selecionadaId={selecionadaId}
        mensagens={mensagensSel}
        sugestoes={[]}
        painel={painel}
        autorEmail={ensaio.email}
        autorId={ensaio.id}
        nomeAtendente={ensaio.nome.split(" ")[0]}
        mencionaveis={mencionaveis}
        tiposTarefa={TIPOS_TAREFA_SEMENTE}
        templates={[]}
        etapas={etapasEnsaio()}
        departamentoAtivo={ativo ? { chave: ativo.chave, rotulo: ativo.rotulo } : null}
        programadas={selecionadaId ? programadasDaConversa(selecionadaId, mensagensSel, estado.canceladas) : []}
        ancoraEm={searchParams.em ?? null}
        alvoNaoEncontrado={!!alvoPedido && !doAlvo}
        canaisEnvio={canaisEnvio}
        jarvisSobDemanda
        propostas={propostas}
        tarefasPorProposta={tarefasPorProposta}
        ensaio
        pessoasPorEmail={Object.fromEntries(PESSOAS.map((p) => [p.email, p.nome.split(" ")[0]]))}
        fotos={fotosEnsaio()}
        foco={foco}
        linhasFoco={linhasFoco}
      />
    );
  }
  // autor exibido (getUser vai à rede) + insumos do composer em paralelo com a lista —
  // nada aqui depende de nada. O autor das notas/tarefas sai desta mesma chamada: o uuid é o
  // dado forte (responsavel_id / autor_id / mencionado_id) e o e-mail fica só como legado de
  // exibição. O ator do evento é carimbado pela porta de qualquer jeito.
  const supabase = criarClienteServidor();
  // O escopo é lido ANTES da lista porque ele é PREDICADO DA CONSULTA, não filtro do resultado. Se
  // fosse lido depois, a lista já teria chegado inteira ao servidor — e a tentação seguinte seria
  // filtrar aqui, que é meio caminho para filtrar no cliente.
  const { escopo, ativo: departamentoAtivo } = await lerEstadoEscopo();
  const [pagina, etapasReais, userRes, mencionaveis, tipos, templatesLidos] = await Promise.all([
    lerConversas({ escopo }),
    lerEtapasReais(),
    supabase.auth.getUser(),
    lerMencionaveis(), // R13/C4-C5: lista canônica do `@` (core.v_membro + core.agente)
    lerTiposTarefa(), // R13/C6: config `tipo_tarefa`, com semente provisória
    lerTemplates(), // SPEC-TEMPLATES §6: menu / do composer (degrade: lista vazia)
  ]);
  const { conversas } = pagina;
  const etapas = etapasReais ?? ETAPAS_PADRAO; // régua do funil no painel do lead (r9)
  const user = userRes.data.user;
  // {{atendente}} vem do NOME de core.v_membro — nunca do e-mail (spec §5.1)
  const nomeAtendente = await lerNomeMembro(user?.id ?? null);

  // conversa selecionada: ?c explícito → ?lead (do funil ou de uma TAREFA) → a primeira do inbox.
  //
  // 31/08 · quando o alvo foi PEDIDO e não está na caixa de entrada, a tela NÃO cai na primeira
  // conversa: abrir outro fio como se fosse o pedido é mentira silenciosa — e agora que a tarefa
  // linka para cá com âncora de tempo, a mentira viria com uma bolha anelada dizendo "é aqui".
  // A conversa pode faltar por dois motivos legítimos: o filtro `visivel_inbox` (fio sem entrada
  // real) e o escopo de departamento. Os dois merecem frase, não silêncio.
  const alvoPedido = searchParams.c ?? searchParams.lead ?? null;
  const doAlvo =
    (searchParams.c && conversas.find((c) => c.id === searchParams.c)?.id) ||
    (searchParams.lead && conversas.find((c) => c.lead_id === searchParams.lead)?.id) ||
    null;
  const selecionadaId = doAlvo || (alvoPedido ? null : conversas[0]?.id) || null;
  const alvoNaoEncontrado = !!alvoPedido && !doAlvo;
  const selecionada = conversas.find((c) => c.id === selecionadaId) ?? null;

  // mensagens + sugestões + painel do lead (ficha/tarefas/anotações/menções, R8/R13) em
  // paralelo: todos dependem só da conversa selecionada, não uns dos outros
  const [mensagens, sugestoes, painel, programadas]: [
    Mensagem[],
    SugestaoMensagem[],
    PainelLead | null,
    EnvioProgramadoLinha[],
  ] = await Promise.all([
    selecionadaId ? lerMensagens(selecionadaId) : Promise.resolve([]),
    selecionadaId ? lerSugestoesConversa(selecionadaId) : Promise.resolve([]),
    selecionada?.lead_id ? lerPainelLead(selecionada.lead_id) : Promise.resolve(null),
    selecionadaId ? lerEnviosProgramados(selecionadaId) : Promise.resolve([]), // R27/F1
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
      etapas={etapas}
      departamentoAtivo={
        departamentoAtivo
          ? { chave: departamentoAtivo.chave, rotulo: departamentoAtivo.rotulo }
          : null
      }
      programadas={programadas}
      ancoraEm={searchParams.em ?? null}
      alvoNaoEncontrado={alvoNaoEncontrado}
    />
  );
}
