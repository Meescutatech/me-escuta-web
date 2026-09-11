import Link from "next/link";
import type { DadosDashboardDono } from "@/lib/dados/dashboard-dono";
import type { VisaoMarketing } from "@/lib/dados/marketing";
import type { Janela } from "@/lib/dados/dashboard-ceo-calculos";
import { ABAS, montarHref, type Aba, type EstadoUrl } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";
import { AbaMarketing } from "./aba-marketing";
import { PrecisaDeAtencao } from "./atencao";
import { ChipsAtivos } from "./chips";
import { BarrasPorHora, EvolucaoAcumulada, MensagensPorDia } from "./graficos";
import { HeatmapHoraDia } from "./heatmap";
import { JarvisLinha } from "./jarvis-linha";
import { Kpis } from "./kpis";
import { MetaCompacta } from "./meta-compacta";
import { Bloco, CabecalhoBloco, ddmm } from "./pecas";
import { TabelaFunil, TabelaNumeros, TabelaPessoas } from "./tabelas";
import { Toolbar } from "./toolbar";

/*
 * Dashboard do DONO — v3 (10/09/2026, 22:45; depois de "tudo muito espaçado, cara de IA").
 *
 * Fontes desta passada (pesquisa de 10 min, registradas no STATUS): Stephen Few — data-ink, sem
 * chartjunk, uma tela; Refactoring UI — hierarquia por peso/tamanho, não por caixa, e densidade;
 * Stripe / Linear Insights / Vercel Analytics / Metabase — toolbar de filtros densa, números
 * grandes com contexto pequeno, tabelas densas, quase nenhuma prosa. Indicadores do PRD
 * (Dashboards gerenciais · Comercial): leads e conversão por etapa, tempo por etapa vs SLA, taxa
 * e tempo de 1ª resposta, agendamentos, vendas vs meta, performance por SDR/fono, CPL.
 *
 * Regras que a v3 segue: largura fluida (gutter 24px, máx. 1440); card padding 12-14px; KPI ≤ 84px
 * em UMA linha; gráfico principal ≤ 260px; linha de tabela 32px; título de card 13px sem
 * subtítulo; nada de prosa flutuando — o Jarvis é UMA linha; "Precisa de atenção" é lista lateral
 * de 28px. Abas: Operação · Equipe · Marketing. Tudo na URL.
 */

export function PainelDashboard({
  dados,
  marketing,
  mostrarDepartamento,
  verMarketing,
  janelaLivre,
}: {
  dados: DadosDashboardDono;
  marketing: VisaoMarketing | null;
  mostrarDepartamento: boolean;
  verMarketing: boolean;
  janelaLivre: Janela | null;
}) {
  const { aba, vista, filtros, janela } = dados;
  const estado: EstadoUrl = { aba, vista, periodo: dados.periodo, de: janelaLivre?.inicio ?? null, ate: janelaLivre?.fim ?? null, filtros };
  const tudoIndisponivel = dados.indisponiveis.length >= 7;
  const abas = ABAS.filter((a) => a.chave !== "marketing" || verMarketing);

  return (
    <main className="mx-auto max-w-[1440px] px-6 pb-10 pt-3">
      <Toolbar estado={estado} janela={janela} livre={janelaLivre != null} atores={dados.atores} opcoes={dados.opcoes} mostrarDepartamento={mostrarDepartamento} />
      <div className="mt-1.5">
        <ChipsAtivos estado={estado} atores={dados.atores} opcoes={dados.opcoes} />
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-x-4 border-b border-border">
        <nav aria-label="Seções" className="flex items-end gap-0.5">
          {abas.map((a) => (
            <Link
              key={a.chave}
              href={montarHref(estado, { aba: a.chave as Aba })}
              aria-current={aba === a.chave ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex h-8 items-center border-b-2 px-2.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                aba === a.chave ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {a.rotulo}
            </Link>
          ))}
        </nav>
        <span className="ml-auto pb-1.5 text-[11px] text-muted-foreground tabular-nums">
          {ddmm(janela.inicio)} – {ddmm(janela.fim)} · {janela.dias} dias{filtros.comparar ? ` · vs. ${janela.dias} anteriores` : ""}
        </span>
      </div>

      <JarvisLinha jarvis={dados.jarvis} />

      {filtros.departamento && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {dados.departamentoAplicado ? "Departamento recorta atenção, pessoas e números; KPIs, funil e evolução são de toda a operação (as views não separam por área)." : "As leituras do ledger ainda não separam por departamento."}
        </p>
      )}

      <div className="mt-3">
        {tudoIndisponivel ? (
          <Bloco>
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              As leituras do dashboard não responderam.{" "}
              <Link href="/suporte" className="font-medium text-foreground underline underline-offset-[3px]">
                Relatar
              </Link>
            </p>
          </Bloco>
        ) : aba === "marketing" ? (
          marketing ? (
            <AbaMarketing visao={marketing} periodo={dados.periodo} />
          ) : (
            <Bloco>
              <p className="py-6 text-center text-[13px] text-muted-foreground">
                Marketing pede o papel de marketing, admin ou owner.{" "}
                <Link href="/configuracoes/membros" className="font-medium text-foreground underline underline-offset-[3px]">
                  Ver membros
                </Link>
              </p>
            </Bloco>
          )
        ) : aba === "equipe" ? (
          <div className="flex flex-col gap-3">
            <TabelaPessoas dados={dados} />
            <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Bloco>
                <CabecalhoBloco titulo="Mensagens recebidas por hora e dia" />
                <div className="mt-2">
                  <HeatmapHoraDia heatmap={dados.heatmap} />
                </div>
              </Bloco>
              <Bloco>
                <CabecalhoBloco titulo="Mensagens enviadas por dia" />
                <div className="mt-2">
                  <MensagensPorDia serie={dados.serie} />
                </div>
              </Bloco>
            </div>
          </div>
        ) : vista === "tabela" ? (
          <div className="flex flex-col gap-3">
            <Kpis dados={dados} />
            <TabelaFunil dados={dados} />
            <TabelaNumeros dados={dados} />
            <TabelaPessoas dados={dados} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Kpis dados={dados} />

            <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
              <Bloco>
                <CabecalhoBloco titulo="Evolução acumulada" />
                <EvolucaoAcumulada serie={dados.serie} className="mt-1" />
              </Bloco>
              <div className="flex flex-col gap-3">
                <MetaCompacta meta={dados.meta} />
                <PrecisaDeAtencao atencao={dados.atencao} className="flex-1" />
              </div>
            </div>

            <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <TabelaFunil dados={dados} />
              <div className="flex flex-col gap-3">
                <TabelaNumeros dados={dados} />
                <Bloco>
                  <CabecalhoBloco titulo="Mensagens recebidas por hora" />
                  <div className="mt-2">
                    <BarrasPorHora heatmap={dados.heatmap} />
                  </div>
                </Bloco>
              </div>
            </div>

            {dados.indisponiveis.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Sem leitura de {dados.indisponiveis.map((v) => v.replace("v_dashboard_", "")).join(", ")}.{" "}
                <Link href="/suporte" className="underline underline-offset-2">
                  Relatar
                </Link>
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
