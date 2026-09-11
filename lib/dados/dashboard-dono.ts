import { lerDashboardCeo, type DadosDashboardCeo } from "./dashboard-ceo";
import { ensaioDashboardLigado, gerarEnsaioDashboard } from "./dashboard-ensaio";
import { diasDaJanela, type Comparado, type EtapaResumo, type Janela, type PeriodoDias } from "./dashboard-ceo-calculos";
import {
  atencaoLeadsParados,
  atencaoPropostasJarvis,
  atencaoSemResposta,
  atencaoTarefasVencidas,
  ordenarAtencao,
  respondidasPorAtor,
  serieRespondidas,
  MINUTOS_SLA_CANAL,
  PERGUNTAS_PADRAO,
  type Aba,
  type Atencao,
  type FiltrosDashboard,
  type Heatmap,
  type JarvisDiz,
  type LinhaCanal,
  type LinhaEquipe,
  type MetaMes,
  type TipoAtencao,
  type Vista,
} from "./dashboard-dono-calculos";
import {
  atencaoDeEnsaio,
  canaisDeEnsaio,
  cargaAgoraDeEnsaio,
  heatmapDeEnsaio,
  jarvisDizDeEnsaio,
  metaDeEnsaio,
  TEMPO_ETAPA_ENSAIO,
} from "./dashboard-dono-ensaio";
import { lerFunil } from "./funil";
import { lerVisaoTarefas } from "./tarefas-visao";
import { lerConversas } from "./conversas";
import { lerFila } from "@/app/(app)/fila/dados";

/**
 * Leitura do DASHBOARD DO DONO (W-D4, 10/09/2026) — `lerDashboardCeo` (as seis views 0300/0302)
 * mais os blocos que respondem "o que precisa da minha atenção hoje?".
 *
 * A regra é a mesma da leitura de baixo: bloco que não tem leitura fica `null` e a UI escreve
 * "sem leitura" — nunca zero inventado, e nunca derruba os vizinhos. Hoje:
 *
 *   | bloco                | ensaio           | produção                                          |
 *   |----------------------|------------------|---------------------------------------------------|
 *   | atenção              | fixtures do W-D2 | tarefas (`v_tarefa`), funil (`v_lead_card` + SLA), |
 *   |                      |                  | conversas (1ª página do inbox), fila do Jarvis     |
 *   | Jarvis diz (frase)   | gabarito         | `null` até o F9 escrever o resumo                  |
 *   | canais               | fixture          | `null` — as views não sabem por qual número entrou |
 *   | heatmap hora × dia   | fixture          | `null` — as views são por DIA                      |
 *   | meta do mês          | fixture          | `null` — `core.config` ainda não tem `meta_mensal` |
 *   | tempo médio na etapa | fixture          | `null` — a view não mede permanência              |
 *   | carga agora (equipe) | fixture          | `null`                                            |
 *
 * FILTROS (v3): `pessoas` recorta tudo que vem por ator (KPIs, evolução, funil, tabelas);
 * `numeros` recorta a tabela por número e a atenção; `etapas` o funil e os leads parados;
 * `origens` os leads parados (e o marketing, na aba dele); `departamento` atenção, pessoas e
 * números. O que cada filtro NÃO alcança está dito na tela, não escondido.
 */

export interface DadosDashboardDono extends DadosDashboardCeo {
  aba: Aba;
  vista: Vista;
  filtros: FiltrosDashboard;
  /**
   * true = o recorte de departamento foi aplicado aos blocos que TÊM departamento (atenção, equipe,
   * canais). KPIs, funil e série nunca são recortados: as views `v_dashboard_*` não têm `area`.
   */
  departamentoAplicado: boolean;
  atencao: Atencao;
  jarvis: JarvisDiz;
  canais: LinhaCanal[] | null;
  heatmap: Heatmap | null;
  meta: MetaMes | null;
  equipe: LinhaEquipe[];
  funilComTempo: Array<EtapaResumo & { tempoMedioDias: number | null }>;
  trajetorias: { leads: number[]; recebidas: number[]; respondidas: number[]; enviadas: number[]; ganhos: number[] };
  ganhos: EtapaResumo | null;
  /** vendas ganhas NO PERÍODO e o valor delas; valor null = sem leitura */
  ganhosPeriodo: { vendas: Comparado; valor: number | null };
  /** opções dos filtros multi — o que existe para escolher */
  opcoes: { numeros: Array<{ id: string; rotulo: string }>; etapas: Array<{ chave: string; nome: string }>; origens: Array<{ chave: string; rotulo: string }>; cidades: string[] };
}

/** Sem departamento na fixture, o filtro recorta pela LOTAÇÃO da pessoa e pelo departamento do canal. */
const DEPARTAMENTO_DO_ATOR: Record<string, "pre_venda" | "pos_venda" | null> = {
  "agente:clara": "pre_venda",
  "agente:jarvis": null,
  "humano:sara": "pre_venda",
  "humano:ana-paula": "pos_venda",
  "humano:diogo": null,
};

const ORIGENS_PADRAO = [
  { chave: "meta", rotulo: "Meta" },
  { chave: "google", rotulo: "Google" },
  { chave: "ind", rotulo: "Indicação" },
  { chave: "ig", rotulo: "Instagram" },
  { chave: "wa", rotulo: "WhatsApp direto" },
  { chave: "site", rotulo: "Site" },
];

export async function lerDashboardDono(
  periodo: PeriodoDias,
  aba: Aba,
  vista: Vista,
  filtros: FiltrosDashboard,
  agora = new Date(),
  janelaLivre: Janela | null = null,
): Promise<DadosDashboardDono> {
  const atorFiltro = filtros.pessoas.length > 0 ? filtros.pessoas : null;
  const base = await lerDashboardCeo(periodo, atorFiltro, agora, undefined, janelaLivre);
  const dias = diasDaJanela(base.janela);
  const ganhos = base.funil.find((e) => e.tipo === "ganho") ?? null;
  const { departamento } = filtros;
  const casaPessoa = (ator: string) => filtros.pessoas.length === 0 || filtros.pessoas.includes(ator);
  const casaDep = (ator: string) => !departamento || DEPARTAMENTO_DO_ATOR[ator] === departamento || DEPARTAMENTO_DO_ATOR[ator] === null;
  const funilRecortado = (f: EtapaResumo[]) => f.filter((e) => filtros.etapas.length === 0 || filtros.etapas.includes(e.etapa) || e.tipo !== "aberto");

  if (ensaioDashboardLigado()) {
    const en = gerarEnsaioDashboard(agora);
    const canaisTodos = canaisDeEnsaio(en, base.janela, agora);
    const canais = canaisTodos
      .filter((c) => !departamento || (departamento === "pos_venda" ? c.departamento !== "pre_venda" : c.departamento === "pre_venda"))
      .filter((c) => filtros.numeros.length === 0 || filtros.numeros.includes(c.canal_id));
    const atencao = atencaoDeEnsaio(canais, agora, departamento, filtros);
    const meta = metaDeEnsaio(en.etapaDia, agora);
    const carga = cargaAgoraDeEnsaio(agora);
    const equipe: LinhaEquipe[] = base.porAtor
      .filter((r) => casaDep(r.ator) && casaPessoa(r.ator))
      .map((r) => {
        const vendas = en.etapaDia.filter((l) => l.etapa === "ganho" && l.ator === r.ator && l.dia >= base.janela.inicio && l.dia <= base.janela.fim).reduce((s, l) => s + l.entradas, 0);
        return {
          ...r,
          respondidas: respondidasPorAtor(en.primeira, r.ator, base.janela),
          dentroDeSla: respondidasPorAtor(en.primeira, r.ator, base.janela, MINUTOS_SLA_CANAL),
          cargaAgora: carga.get(r.ator) ?? 0,
          departamento: DEPARTAMENTO_DO_ATOR[r.ator] ?? null,
          ganhos: { vendas, valor: vendas * 11_600 },
        };
      });
    const ganhosDia = dias.map((d) => en.etapaDia.filter((l) => l.dia === d && l.etapa === "ganho" && casaPessoa(l.ator)).reduce((s, l) => s + l.entradas, 0));
    return {
      ...base,
      aba,
      vista,
      filtros,
      departamentoAplicado: true,
      atencao,
      jarvis: jarvisDizDeEnsaio(en, base.janela, atencao, agora, base.atendimento, meta),
      canais,
      heatmap: heatmapDeEnsaio(),
      meta,
      equipe,
      funilComTempo: funilRecortado(base.funil).map((e) => ({ ...e, tempoMedioDias: TEMPO_ETAPA_ENSAIO[e.etapa] ?? null })),
      trajetorias: {
        leads: base.serie.map((p) => p.leadsNovos),
        recebidas: base.serie.map((p) => p.recebidas),
        respondidas: serieRespondidas(en.primeira.filter((p) => p.respondida_por == null || casaPessoa(p.respondida_por)), dias),
        enviadas: base.serie.map((p) => p.enviadasAgente + p.enviadasHumano),
        ganhos: ganhosDia,
      },
      ganhos,
      ganhosPeriodo: { vendas: ganhos?.entradas ?? { atual: 0, anterior: 0 }, valor: equipe.reduce((s, r) => s + (r.ganhos?.valor ?? 0), 0) },
      opcoes: {
        numeros: canaisTodos.map((c) => ({ id: c.canal_id, rotulo: c.apelido })),
        etapas: base.funil.filter((e) => e.tipo === "aberto").map((e) => ({ chave: e.etapa, nome: e.nome })),
        origens: ORIGENS_PADRAO,
        cidades: ["Campinas", "Valinhos", "Jundiaí", "Sorocaba"],
      },
    };
  }

  // ── produção: só o que já tem leitura; o resto é null e a UI diz "sem leitura" ──
  const agoraMs = agora.getTime();
  const indisponiveis: TipoAtencao[] = [];
  const [tarefas, funil, conversas, fila] = await Promise.all([
    lerVisaoTarefas().catch(() => null),
    lerFunil().catch(() => null),
    lerConversas({ limite: 200 }).catch(() => null),
    lerFila(null).catch(() => null),
  ]);
  if (!tarefas) indisponiveis.push("tarefas_vencidas");
  if (!funil) indisponiveis.push("leads_parados");
  if (!conversas) indisponiveis.push("sem_resposta");
  if (!fila || fila.total == null) indisponiveis.push("propostas_jarvis");
  indisponiveis.push("canal");

  const cards = funil
    ? funil.cards.filter((c) => (filtros.etapas.length === 0 || filtros.etapas.includes(c.etapa)) && (filtros.origens.length === 0 || (c.origem != null && filtros.origens.includes(String(c.origem)))))
    : [];
  const atencao: Atencao = {
    itens: ordenarAtencao([
      conversas ? atencaoSemResposta(conversas.conversas.filter((c) => filtros.numeros.length === 0 || (c.phone_number_id != null && filtros.numeros.includes(c.phone_number_id))), agoraMs) : null,
      tarefas ? atencaoTarefasVencidas(tarefas.tarefas) : null,
      funil ? atencaoLeadsParados(cards, funil.sla, agoraMs, funil.todasEtapas) : null,
      fila && fila.total != null ? atencaoPropostasJarvis(fila.total, (fila.porAgente ?? []).map((a) => ({ nome: a.rotulo || a.agente, n: a.qtd }))) : null,
    ]),
    indisponiveis,
  };

  return {
    ...base,
    aba,
    vista,
    filtros,
    departamentoAplicado: false,
    atencao,
    jarvis: { frase: null, observacoes: [], perguntas: PERGUNTAS_PADRAO, geradoEm: null },
    canais: null,
    heatmap: null,
    meta: null,
    equipe: base.porAtor.filter((r) => casaPessoa(r.ator)).map((r) => ({ ...r, respondidas: r.conversas, dentroDeSla: { atual: null, anterior: null }, cargaAgora: null, departamento: null, ganhos: null })),
    funilComTempo: funilRecortado(base.funil).map((e) => ({ ...e, tempoMedioDias: null })),
    trajetorias: {
      leads: base.serie.map((p) => p.leadsNovos),
      recebidas: base.serie.map((p) => p.recebidas),
      respondidas: [],
      enviadas: base.serie.map((p) => p.enviadasAgente + p.enviadasHumano),
      ganhos: [],
    },
    ganhos,
    ganhosPeriodo: { vendas: ganhos?.entradas ?? { atual: null, anterior: null }, valor: null },
    opcoes: {
      numeros: [],
      etapas: base.funil.filter((e) => e.tipo === "aberto").map((e) => ({ chave: e.etapa, nome: e.nome })),
      origens: ORIGENS_PADRAO,
      cidades: [],
    },
  };
}
