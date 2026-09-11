import { CalendarCheckIcon, CheckSquareIcon, InboxIcon, TimerIcon, TrophyIcon, UserPlusIcon } from "lucide-react";
import type { DadosDashboardDono } from "@/lib/dados/dashboard-dono";
import { fmtInt, fmtMoeda, fmtPct, variacao, MINUTOS_SLA_RESPOSTA } from "@/lib/dados/dashboard-ceo-calculos";
import { compactar, fmtMoedaCurta } from "@/lib/dados/dashboard-dono-calculos";
import { Kpi } from "./kpi";

/**
 * Os seis números do topo, no molde "51,2% · 945 / 1.846": o valor grande responde, a linha
 * apagada embaixo diz de onde ele veio. Cinco são do período (com variação e faísca); Tarefas
 * concluídas traz o débito de agora na base ("4 vencidas").
 */
export function Kpis({ dados }: { dados: DadosDashboardDono }) {
  const { negocio, atendimento, trajetorias, equipe, janela } = dados;
  const gp = dados.ganhosPeriodo;
  const respondidas = (atendimento.conversasAgente.atual ?? 0) + (atendimento.conversasHumano.atual ?? 0);
  const noSla = atendimento.dentroDeSla.atual ?? 0;
  const vencidas = dados.atencao.itens.find((i) => i.tipo === "tarefas_vencidas")?.quantidade ?? (dados.atencao.indisponiveis.includes("tarefas_vencidas") ? null : 0);
  const concluidas = equipe.reduce((s, r) => s + (r.tarefasConcluidas.atual ?? 0), 0);
  const concluidasAntes = equipe.reduce((s, r) => s + (r.tarefasConcluidas.anterior ?? 0), 0);
  const criadas = equipe.reduce((s, r) => s + (r.tarefasCriadas.atual ?? 0), 0);
  const agend = dados.funil.find((e) => e.tipo === "aberto" && /agend|avalia/.test(e.etapa)) ?? null;
  const leads = negocio.leadsNovos.atual ?? 0;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
      <Kpi
        comparar={dados.filtros.comparar}
        icone={InboxIcon}
        rotulo="Conversas recebidas"
        valor={fmtInt(negocio.conversasComEntrada.atual)}
        base={`${fmtInt(negocio.mensagensRecebidas.atual)} mensagens`}
        delta={variacao(negocio.conversasComEntrada)}
        trajetoria={compactar(trajetorias.recebidas, 30)}
      />
      <Kpi
        comparar={dados.filtros.comparar}
        icone={TimerIcon}
        rotulo={`Respondidas em ${MINUTOS_SLA_RESPOSTA} min`}
        valor={respondidas > 0 ? fmtPct(noSla / respondidas, 1) : "—"}
        base={`${fmtInt(noSla)} / ${fmtInt(respondidas)} respondidas`}
        delta={variacao(atendimento.dentroDeSla)}
        trajetoria={compactar(trajetorias.respondidas, 30)}
      />
      <Kpi comparar={dados.filtros.comparar} icone={UserPlusIcon} rotulo="Leads novos" valor={fmtInt(leads)} base={`${(leads / janela.dias).toFixed(1).replace(".", ",")} por dia`} delta={variacao(negocio.leadsNovos)} trajetoria={compactar(trajetorias.leads, 30)} />
      <Kpi
        comparar={dados.filtros.comparar}
        icone={CalendarCheckIcon}
        rotulo="Agendamentos"
        valor={agend ? fmtInt(agend.entradas.atual) : "—"}
        base={agend ? `${leads > 0 ? fmtPct((agend.entradas.atual ?? 0) / leads, 1) : "—"} dos leads novos` : "sem etapa de agendamento"}
        delta={agend ? variacao(agend.entradas) : null}
      />
      <Kpi
        comparar={dados.filtros.comparar}
        icone={CheckSquareIcon}
        rotulo="Tarefas concluídas"
        valor={fmtInt(concluidas)}
        base={`${fmtInt(criadas)} criadas · ${vencidas == null ? "vencidas: sem leitura" : `${fmtInt(vencidas)} vencidas`}`}
        delta={variacao({ atual: concluidas, anterior: concluidasAntes })}
      />
      <Kpi
        comparar={dados.filtros.comparar}
        icone={TrophyIcon}
        rotulo="Ganhos"
        valor={gp.valor != null ? fmtMoedaCurta(gp.valor) : gp.vendas.atual != null ? `${fmtInt(gp.vendas.atual)} vendas` : "—"}
        base={gp.valor != null ? `${fmtMoeda(gp.valor)} · ${fmtInt(gp.vendas.atual)} vendas${dados.meta && dados.meta.metaValor ? ` · ${fmtPct(dados.meta.valor / dados.meta.metaValor)} da meta` : ""}` : gp.vendas.atual != null ? "valor sem leitura" : ""}
        delta={variacao(gp.vendas)}
        tom="verde"
      />
    </div>
  );
}
