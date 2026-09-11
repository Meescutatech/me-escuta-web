import { AlertTriangleIcon, InboxIcon, MessageSquareReplyIcon, TrophyIcon, UserPlusIcon, ZapIcon } from "lucide-react";
import type { DadosDashboardDono } from "@/lib/dados/dashboard-dono";
import { fmtInt, fmtMinutos, fmtMoeda, fmtPct, variacao, type Comparado } from "@/lib/dados/dashboard-ceo-calculos";
import { compactar } from "@/lib/dados/dashboard-dono-calculos";
import { CartaoIndicador } from "./relatorio";

/**
 * Os seis números do topo — "como estamos indo", em uma linha. Cada card tem a variação contra o
 * período anterior (mesma duração) e a trajetória dia a dia em mini-barras. A explicação de cada
 * métrica vive no "i", não na tela: quem abre isto toda segunda já sabe o que é "1ª resposta".
 *
 * Tarefas vencidas é o único número de AGORA no meio de cinco números de PERÍODO — por isso não
 * tem variação nem trajetória, e o card ganha o âmbar só quando há débito.
 */
export function KpisDono({ dados }: { dados: DadosDashboardDono }) {
  const { negocio, atendimento, trajetorias, ganhos, periodo } = dados;
  const respondidas: Comparado = {
    atual: (atendimento.conversasAgente.atual ?? 0) + (atendimento.conversasHumano.atual ?? 0),
    anterior: (atendimento.conversasAgente.anterior ?? 0) + (atendimento.conversasHumano.anterior ?? 0),
  };
  const vencidas = dados.atencao.itens.find((i) => i.tipo === "tarefas_vencidas");
  const semLeituraVencidas = dados.atencao.indisponiveis.includes("tarefas_vencidas");
  const quebraVencidas = vencidas?.quebra.slice(0, 2).map((q) => `${q.rotulo} ${q.quantidade}`).join(" · ");
  const leadsPorDia = negocio.leadsNovos.atual == null ? null : negocio.leadsNovos.atual / periodo;

  return (
    <div data-slot="kpis-dono" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <CartaoIndicador
        rotulo="Conversas recebidas"
        dica="Conversas que receberam pelo menos uma mensagem do cliente no período. Mede a demanda que entrou, não o que foi atendido."
        icone={InboxIcon}
        acento="var(--chart-2)"
        valor={fmtInt(negocio.conversasComEntrada.atual)}
        detalhe={`${fmtInt(negocio.mensagensRecebidas.atual)} mensagens`}
        delta={variacao(negocio.conversasComEntrada)}
        trajetoria={compactar(trajetorias.recebidas)}
        corTrajetoria="var(--chart-2)"
      />
      <CartaoIndicador
        rotulo="Respondidas"
        dica="Conversas que receberam a primeira resposta nossa (Clara ou uma pessoa) no período. A fração por agente diz quanto a Clara está segurando sozinha."
        icone={MessageSquareReplyIcon}
        acento="var(--chart-2)"
        valor={fmtInt(respondidas.atual)}
        detalhe={atendimento.fracaoAgente == null ? "sem conversas respondidas" : `${fmtPct(atendimento.fracaoAgente)} pela Clara`}
        delta={variacao(respondidas)}
        trajetoria={compactar(trajetorias.respondidas)}
        corTrajetoria="var(--chart-2)"
      />
      <CartaoIndicador
        rotulo="1ª resposta"
        dica="Mediana do tempo entre a primeira mensagem do cliente e a primeira resposta nossa. Entram só as conversas já respondidas; as sem resposta aparecem em Precisa de atenção."
        icone={ZapIcon}
        acento="var(--chart-1)"
        valor={fmtMinutos(atendimento.primeiraResposta.geralMin.atual)}
        detalhe={atendimento.primeiraResposta.amostra > 0 ? `mediana de ${fmtInt(atendimento.primeiraResposta.amostra)} conversas` : "sem conversas respondidas"}
        delta={variacao(atendimento.primeiraResposta.geralMin)}
        menorEhMelhor
      />
      <CartaoIndicador
        rotulo="Leads novos"
        dica="Leads criados no período, pela data de entrada no funil. Um lead conta uma vez, mesmo que tenha falado por dois números."
        icone={UserPlusIcon}
        acento="var(--chart-3)"
        valor={fmtInt(negocio.leadsNovos.atual)}
        detalhe={leadsPorDia == null ? "" : `${leadsPorDia.toFixed(1).replace(".", ",")} por dia`}
        delta={variacao(negocio.leadsNovos)}
        trajetoria={compactar(trajetorias.leads)}
        corTrajetoria="var(--chart-3)"
      />
      <CartaoIndicador
        rotulo="Tarefas vencidas"
        dica="Tarefas pendentes com prazo já passado, agora. É o único número desta linha que não é do período: é o débito de hoje, e cai a zero quando alguém trabalha."
        icone={AlertTriangleIcon}
        acento={vencidas ? "var(--chart-4)" : undefined}
        valor={semLeituraVencidas ? "—" : fmtInt(vencidas?.quantidade ?? 0)}
        detalhe={semLeituraVencidas ? "sem leitura" : vencidas ? quebraVencidas : "nada vencido"}
      />
      <CartaoIndicador
        rotulo="Ganhos"
        dica="Vendas fechadas no período (leads que entraram na etapa de ganho). O valor é a soma do que estava registrado no lead."
        icone={TrophyIcon}
        acento="var(--chart-1)"
        valor={ganhos ? fmtInt(ganhos.entradas.atual) : "—"}
        detalhe={dados.meta ? `${fmtMoeda(dados.meta.valor)} no mês` : ganhos && ganhos.valor > 0 ? `${fmtMoeda(ganhos.valor)} em valor` : ""}
        delta={ganhos ? variacao(ganhos.entradas) : null}
        trajetoria={compactar(trajetorias.ganhos)}
        corTrajetoria="var(--chart-1)"
      />
    </div>
  );
}
