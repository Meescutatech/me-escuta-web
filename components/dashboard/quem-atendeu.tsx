import { BotIcon, MessagesSquareIcon } from "lucide-react";
import type { DadosDashboardDono } from "@/lib/dados/dashboard-dono";
import { fmtInt, fmtMinutos, fmtPct, variacao, type Comparado } from "@/lib/dados/dashboard-ceo-calculos";
import { cn } from "@/lib/utils";
import { GraficoBarras } from "./grafico-barras";
import { Acao, COR_AGENTE, COR_HUMANO, FILL_AGENTE, FILL_HUMANO, LegendaAgenteHumano } from "./pecas";
import { CartaoGrafico, ItemLegenda, SeloVariacao } from "./relatorio";

/**
 * Quem atendeu — o trilho dividido agente × pessoa é a assinatura da tela: uma barra, dois lados,
 * os dois percentuais escritos dentro. Embaixo, os quatro números que o trilho resume e os três
 * tempos de 1ª resposta (agentes, pessoas, geral).
 */

function Metrica({ rot, val, delta, menorEhMelhor }: { rot: string; val: string; delta?: Comparado; menorEhMelhor?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-ui-11 text-muted-foreground">{rot}</span>
      <span className="flex items-center gap-1.5">
        <span className="text-ui-14 font-semibold tabular-nums text-foreground">{val}</span>
        {delta && <SeloVariacao delta={variacao(delta)} menorEhMelhor={menorEhMelhor} tamanho="sm" />}
      </span>
    </div>
  );
}

export function QuemAtendeu({ dados }: { dados: DadosDashboardDono }) {
  const a = dados.atendimento;
  const ag = a.conversasAgente.atual ?? 0;
  const hu = a.conversasHumano.atual ?? 0;
  const total = ag + hu;
  const frac = a.fracaoAgente;
  const fracHumano = frac == null ? null : 1 - frac;

  return (
    <CartaoGrafico
      titulo="Quem atendeu"
      descricao="Primeira resposta por agente ou por pessoa, no período."
      icone={BotIcon}
      dica="Cada conversa respondida conta uma vez, pelo tipo de quem deu a PRIMEIRA resposta. Transbordos são as conversas que a Clara passou para uma pessoa; devolvidas, as que voltaram."
      legenda={
        <ul className="flex flex-col gap-2">
          <ItemLegenda cor={COR_AGENTE} nome="Agente" glosa="a Clara respondeu primeiro." />
          <ItemLegenda cor={COR_HUMANO} nome="Pessoa" glosa="alguém da equipe respondeu primeiro." />
        </ul>
      }
      vazio={total === 0}
      mensagemVazio="Nenhuma conversa respondida no período"
      alturaConteudo={160}
    >
      <div className="flex flex-col gap-4">
        <div
          className="flex h-9 w-full overflow-hidden rounded-lg bg-muted"
          role="img"
          aria-label={`${fmtPct(frac)} das conversas respondidas primeiro por agente, ${fmtPct(fracHumano)} por pessoa`}
        >
          {ag > 0 && (
            <div className="flex items-center bg-azul-graf px-3 text-ui-12 font-semibold text-white" style={{ width: `${(ag / total) * 100}%`, minWidth: 52 }}>
              <span className="tabular-nums">{fmtPct(frac)}</span>
            </div>
          )}
          {hu > 0 && (
            <div className="ml-auto flex items-center justify-end bg-laranja px-3 text-ui-12 font-semibold text-white" style={{ width: `${(hu / total) * 100}%`, minWidth: 52 }}>
              <span className="tabular-nums">{fmtPct(fracHumano)}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Metrica rot="Por agente" val={fmtInt(ag)} delta={a.conversasAgente} />
          <Metrica rot="Por pessoa" val={fmtInt(hu)} delta={a.conversasHumano} />
          <Metrica rot="Transbordos" val={fmtInt(a.transbordos.atual)} delta={a.transbordos} menorEhMelhor />
          <Metrica rot="Sem resposta" val={fmtInt(a.semResposta.atual)} delta={a.semResposta} menorEhMelhor />
        </div>

        <div className="grid grid-cols-3 gap-x-4 border-t border-border/70 pt-3">
          <Metrica rot="1ª resposta · agentes" val={fmtMinutos(a.primeiraResposta.agenteMin)} />
          <Metrica rot="1ª resposta · pessoas" val={fmtMinutos(a.primeiraResposta.humanoMin)} />
          <Metrica rot="1ª resposta · geral" val={fmtMinutos(a.primeiraResposta.geralMin.atual)} delta={a.primeiraResposta.geralMin} menorEhMelhor />
        </div>
      </div>
    </CartaoGrafico>
  );
}

export function MensagensPorDia({ dados }: { dados: DadosDashboardDono }) {
  const { serie } = dados;
  const vazio = serie.every((p) => p.enviadasAgente + p.enviadasHumano === 0);
  return (
    <CartaoGrafico
      titulo="Mensagens enviadas por dia"
      descricao="Quanto a operação falou, e quem falou."
      icone={MessagesSquareIcon}
      dica="Mensagens de saída por dia, empilhadas: embaixo as dos agentes, em cima as das pessoas. Um dia com muita mensagem de pessoa e pouca de agente é um dia em que a Clara não segurou."
      legenda={
        <ul className="flex flex-col gap-2">
          <ItemLegenda cor={COR_AGENTE} nome="Agentes" glosa="enviadas pela Clara e outros agentes." />
          <ItemLegenda cor={COR_HUMANO} nome="Pessoas" glosa="enviadas por alguém da equipe." />
        </ul>
      }
      acoes={<LegendaAgenteHumano />}
      vazio={vazio}
      mensagemVazio="Sem mensagens enviadas no período"
      alturaConteudo={160}
    >
      <GraficoBarras
        rotulos={serie.map((p) => p.rotulo)}
        series={[
          { chave: "agente", rotulo: "agentes", fill: FILL_AGENTE, valores: serie.map((p) => p.enviadasAgente) },
          { chave: "humano", rotulo: "pessoas", fill: FILL_HUMANO, valores: serie.map((p) => p.enviadasHumano) },
        ]}
        altura={120}
        rotuloVazio="sem mensagens enviadas no período"
      />
      {dados.indisponiveis.length > 0 && (
        <p className={cn("mt-2 text-ui-11 text-muted-foreground")}>
          Sem leitura de {dados.indisponiveis.map((v) => v.replace("v_dashboard_", "")).join(", ")}. <Acao href="/suporte">Relatar</Acao>
        </p>
      )}
    </CartaoGrafico>
  );
}
