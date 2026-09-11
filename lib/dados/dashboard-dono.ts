import { lerDashboardCeo, type DadosDashboardCeo } from "./dashboard-ceo";
import { ensaioDashboardLigado, gerarEnsaioDashboard } from "./dashboard-ensaio";
import { diasDaJanela, type EtapaResumo, type PeriodoDias } from "./dashboard-ceo-calculos";
import {
  atencaoLeadsParados,
  atencaoPropostasJarvis,
  atencaoSemResposta,
  atencaoTarefasVencidas,
  ordenarAtencao,
  respondidasPorAtor,
  serieRespondidas,
  PERGUNTAS_PADRAO,
  type Aba,
  type Atencao,
  type DepartamentoFiltro,
  type Heatmap,
  type JarvisDiz,
  type LinhaCanal,
  type LinhaEquipe,
  type MetaMes,
  type TipoAtencao,
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
 *   | Jarvis diz (frases)  | gabarito         | `null` até o F9 escrever o resumo                  |
 *   | canais               | fixture          | `null` — as views não sabem por qual número entrou |
 *   | heatmap hora × dia   | fixture          | `null` — as views são por DIA                      |
 *   | meta do mês          | fixture          | `null` — `core.config` ainda não tem `meta_mensal` |
 *   | tempo médio na etapa | fixture          | `null` — a view não mede permanência              |
 *   | carga agora (equipe) | fixture          | `null`                                            |
 */

export interface DadosDashboardDono extends DadosDashboardCeo {
  aba: Aba;
  departamento: DepartamentoFiltro;
  /**
   * true = o recorte de departamento foi aplicado aos blocos que TÊM departamento (atenção, equipe,
   * canais). KPIs, funil e série nunca são recortados: as views `v_dashboard_*` não têm `area`.
   * false = nada foi recortado (produção, até a migration).
   */
  departamentoAplicado: boolean;
  atencao: Atencao;
  jarvis: JarvisDiz;
  canais: LinhaCanal[] | null;
  heatmap: Heatmap | null;
  meta: MetaMes | null;
  equipe: LinhaEquipe[];
  funilComTempo: Array<EtapaResumo & { tempoMedioDias: number | null }>;
  /** trajetórias diárias já na ordem da janela — as mini-barras dos KPIs */
  trajetorias: { leads: number[]; recebidas: number[]; respondidas: number[]; enviadas: number[]; ganhos: number[] };
  ganhos: EtapaResumo | null;
}

/** Sem departamento na fixture, o filtro recorta pela LOTAÇÃO da pessoa e pelo departamento do canal. */
const DEPARTAMENTO_DO_ATOR: Record<string, DepartamentoFiltro> = {
  "agente:clara": "pre_venda",
  "agente:jarvis": null,
  "humano:sara": "pre_venda",
  "humano:ana-paula": "pos_venda",
  "humano:diogo": null,
};

export async function lerDashboardDono(
  periodo: PeriodoDias,
  atorFiltro: string | null,
  aba: Aba,
  departamento: DepartamentoFiltro,
  agora = new Date(),
): Promise<DadosDashboardDono> {
  const base = await lerDashboardCeo(periodo, atorFiltro, agora);
  const dias = diasDaJanela(base.janela);
  const ganhos = base.funil.find((e) => e.tipo === "ganho") ?? null;

  if (ensaioDashboardLigado()) {
    const en = gerarEnsaioDashboard(agora);
    const canaisTodos = canaisDeEnsaio(en, base.janela, agora);
    const canais = departamento ? canaisTodos.filter((c) => (departamento === "pos_venda" ? c.departamento !== "pre_venda" : c.departamento === "pre_venda")) : canaisTodos;
    const atencao = atencaoDeEnsaio(canais, agora);
    const meta = metaDeEnsaio(en.etapaDia, agora);
    const carga = cargaAgoraDeEnsaio(agora);
    const equipe: LinhaEquipe[] = base.porAtor
      .filter((r) => !departamento || DEPARTAMENTO_DO_ATOR[r.ator] === departamento || DEPARTAMENTO_DO_ATOR[r.ator] === null)
      .map((r) => ({
        ...r,
        respondidas: respondidasPorAtor(en.primeira, r.ator, base.janela),
        cargaAgora: carga.get(r.ator) ?? 0,
        departamento: DEPARTAMENTO_DO_ATOR[r.ator] ?? null,
      }));
    const ganhosDia = dias.map((d) => en.etapaDia.filter((l) => l.dia === d && l.etapa === "ganho").reduce((s, l) => s + l.entradas, 0));
    return {
      ...base,
      aba,
      departamento,
      departamentoAplicado: true,
      atencao,
      jarvis: jarvisDizDeEnsaio(en, base.janela, atencao, agora, base.atendimento, meta),
      canais,
      heatmap: heatmapDeEnsaio(),
      meta,
      equipe,
      funilComTempo: base.funil.map((e) => ({ ...e, tempoMedioDias: TEMPO_ETAPA_ENSAIO[e.etapa] ?? null })),
      trajetorias: {
        leads: base.serie.map((p) => p.leadsNovos),
        recebidas: base.serie.map((p) => p.recebidas),
        respondidas: serieRespondidas(en.primeira, dias),
        enviadas: base.serie.map((p) => p.enviadasAgente + p.enviadasHumano),
        ganhos: ganhosDia,
      },
      ganhos,
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

  const atencao: Atencao = {
    itens: ordenarAtencao([
      conversas ? atencaoSemResposta(conversas.conversas, agoraMs) : null,
      tarefas ? atencaoTarefasVencidas(tarefas.tarefas) : null,
      funil ? atencaoLeadsParados(funil.cards, funil.sla, agoraMs, funil.todasEtapas) : null,
      fila && fila.total != null ? atencaoPropostasJarvis(fila.total, (fila.porAgente ?? []).map((a) => ({ nome: a.rotulo || a.agente, n: a.qtd }))) : null,
    ]),
    indisponiveis,
  };

  return {
    ...base,
    aba,
    departamento,
    departamentoAplicado: false,
    atencao,
    jarvis: { frase: null, observacoes: [], perguntas: PERGUNTAS_PADRAO, geradoEm: null },
    canais: null,
    heatmap: null,
    meta: null,
    equipe: base.porAtor.map((r) => ({ ...r, respondidas: r.conversas, cargaAgora: null, departamento: null })),
    funilComTempo: base.funil.map((e) => ({ ...e, tempoMedioDias: null })),
    trajetorias: {
      leads: base.serie.map((p) => p.leadsNovos),
      recebidas: base.serie.map((p) => p.recebidas),
      respondidas: [],
      enviadas: base.serie.map((p) => p.enviadasAgente + p.enviadasHumano),
      ganhos: [],
    },
    ganhos,
  };
}
