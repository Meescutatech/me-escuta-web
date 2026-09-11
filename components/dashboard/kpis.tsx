import { CalendarCheckIcon, CheckSquareIcon, InboxIcon, TimerIcon, TrophyIcon, UserPlusIcon } from "lucide-react";
import type { DadosDashboardDono } from "@/lib/dados/dashboard-dono";
import { fmtInt, fmtMoeda, fmtPct, variacao, MINUTOS_SLA_RESPOSTA } from "@/lib/dados/dashboard-ceo-calculos";
import { compactar, fmtMoedaCurta } from "@/lib/dados/dashboard-dono-calculos";
import { Kpi } from "./kpi";

/**
 * Seis números, cada um com valor + variação + UMA linha de contexto — e só quando o contexto
 * responde a uma pergunta ("de quantas?", "e a meta?"). Sem "1.050 mensagens" nem "6,2 por dia"
 * (Diogo 23:30: "tiraria números desnecessários").
 */
export function Kpis({ dados }: { dados: DadosDashboardDono }) {
  const { negocio, atendimento, trajetorias, equipe } = dados;
  const comparar = dados.filtros.comparar;
  const gp = dados.ganhosPeriodo;
  const respondidas = (atendimento.conversasAgente.atual ?? 0) + (atendimento.conversasHumano.atual ?? 0);
  const noSla = atendimento.dentroDeSla.atual ?? 0;
  const vencidas = dados.atencao.itens.find((i) => i.tipo === "tarefas_vencidas")?.quantidade ?? (dados.atencao.indisponiveis.includes("tarefas_vencidas") ? null : 0);
  const concluidas = equipe.reduce((s, r) => s + (r.tarefasConcluidas.atual ?? 0), 0);
  const concluidasAntes = equipe.reduce((s, r) => s + (r.tarefasConcluidas.anterior ?? 0), 0);
  const agend = dados.funil.find((e) => e.tipo === "aberto" && /agend|avalia/.test(e.etapa)) ?? null;
  const leads = negocio.leadsNovos.atual ?? 0;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
      <Kpi comparar={comparar} icone={InboxIcon} rotulo="Conversas recebidas" valor={fmtInt(negocio.conversasComEntrada.atual)} delta={variacao(negocio.conversasComEntrada)} trajetoria={compactar(trajetorias.recebidas, 30)} />
      <Kpi
        comparar={comparar}
        icone={TimerIcon}
        rotulo={`Respondidas em ${MINUTOS_SLA_RESPOSTA} min`}
        valor={respondidas > 0 ? fmtPct(noSla / respondidas, 1) : "—"}
        base={respondidas > 0 ? `${fmtInt(noSla)} de ${fmtInt(respondidas)}` : "sem conversas respondidas"}
        delta={variacao(atendimento.dentroDeSla)}
        trajetoria={compactar(trajetorias.respondidas, 30)}
      />
      <Kpi comparar={comparar} icone={UserPlusIcon} rotulo="Leads novos" valor={fmtInt(leads)} delta={variacao(negocio.leadsNovos)} trajetoria={compactar(trajetorias.leads, 30)} />
      <Kpi
        comparar={comparar}
        icone={CalendarCheckIcon}
        rotulo="Agendamentos"
        valor={agend ? fmtInt(agend.entradas.atual) : "—"}
        base={agend ? (leads > 0 ? `${fmtPct((agend.entradas.atual ?? 0) / leads, 1)} dos leads novos` : undefined) : "sem etapa de agendamento"}
        delta={agend ? variacao(agend.entradas) : null}
      />
      <Kpi
        comparar={comparar}
        icone={CheckSquareIcon}
        rotulo="Tarefas concluídas"
        valor={fmtInt(concluidas)}
        base={vencidas == null ? "vencidas: sem leitura" : vencidas > 0 ? `${fmtInt(vencidas)} vencidas agora` : "nada vencido"}
        delta={variacao({ atual: concluidas, anterior: concluidasAntes })}
      />
      <Kpi
        comparar={comparar}
        icone={TrophyIcon}
        rotulo="Ganhos"
        valor={gp.valor != null ? fmtMoedaCurta(gp.valor) : gp.vendas.atual != null ? `${fmtInt(gp.vendas.atual)} vendas` : "—"}
        base={gp.valor != null ? `${fmtInt(gp.vendas.atual)} vendas${dados.meta && dados.meta.metaValor ? ` · ${fmtPct(dados.meta.valor / dados.meta.metaValor)} da meta do mês` : ""}` : gp.vendas.atual != null ? "valor sem leitura" : ""}
        delta={variacao(gp.vendas)}
        tom="verde"
      />
    </div>
  );
}
