import Link from "next/link";
import { JarvisDiz } from "@/components/jarvis/jarvis-diz";
import type { DadosDashboardDono } from "@/lib/dados/dashboard-dono";
import type { VisaoMarketing } from "@/lib/dados/marketing";
import { hrefPergunta, montarHref } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";
import { AbaMarketing } from "./aba-marketing";
import { PrecisaDeAtencao } from "./atencao";
import { Filtros } from "./filtros";
import { BarrasPorHora, EvolucaoAcumulada, MensagensPorDia } from "./graficos";
import { Kpis } from "./kpis";
import { MetaEscura } from "./meta-escura";
import { Bloco, CabecalhoBloco, ddmm } from "./pecas";
import { TabelaFunil, TabelaNumeros, TabelaPessoas } from "./tabelas";

/*
 * Dashboard do DONO — v2 (10/09/2026, 22:35, depois da reprovação: "cara de IA").
 *
 * Duas referências do Diogo, misturadas: o "Advanced Stats" do 21st.dev (grid gráfico 2/3 + coluna
 * com card escuro de META e card de insight; KPIs com rótulo em caixa alta espaçada, valor grande
 * `tracking-tighter`, chip de variação) e um painel de administração denso (linha de filtros no
 * topo, Tabela | Dashboard, seis KPIs "51,2% · 945 / 1.846", linha acumulada preta fina, tabelas
 * por pessoa e por número com TOTAL em bold e % apagado ao lado, dinheiro verde/vermelho).
 *
 * A ordem é a da pergunta das 8h: filtros → seis números → evolução + meta + atenção → Jarvis →
 * por pessoa → por número + funil → por hora + mensagens por dia. `?vista=tabela` tira os gráficos
 * e deixa só as tabelas. Marketing é `?aba=marketing`; `/marketing` só redireciona.
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
  janelaLivre: boolean;
}) {
  const { periodo, aba, departamento, vista, busca } = dados;
  const atorNome = dados.atorFiltro ? dados.porAtor.find((r) => r.ator === dados.atorFiltro)?.nome ?? dados.atorFiltro : null;
  const tudoIndisponivel = dados.indisponiveis.length >= 7;
  const abas: Array<{ chave: "geral" | "marketing"; rotulo: string }> = [{ chave: "geral", rotulo: "Operação" }, ...(verMarketing ? [{ chave: "marketing" as const, rotulo: "Marketing" }] : [])];

  return (
    <main className="mx-auto max-w-[1280px] px-6 pb-12 pt-4">
      <Filtros
        periodo={periodo}
        janela={dados.janela}
        livre={janelaLivre}
        atorFiltro={dados.atorFiltro}
        atores={dados.atores}
        aba={aba}
        departamento={departamento}
        vista={vista}
        busca={busca}
        mostrarDepartamento={mostrarDepartamento}
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border">
        <nav aria-label="Seções" className="flex items-end gap-1">
          {abas.map((a) => (
            <Link
              key={a.chave}
              href={montarHref({ periodo, ator: dados.atorFiltro, aba: a.chave, departamento, vista, q: busca })}
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
        <span className="ml-auto flex items-center gap-3 pb-1.5 text-[11px] text-muted-foreground tabular-nums">
          {atorNome && (
            <span>
              como <b className="font-semibold text-foreground">{atorNome}</b>{" "}
              <Link href={montarHref({ periodo, ator: null, aba, departamento, vista, q: busca })} className="underline underline-offset-2 hover:text-foreground">
                limpar
              </Link>
            </span>
          )}
          {busca && (
            <span>
              busca <b className="font-semibold text-foreground">“{busca}”</b>{" "}
              <Link href={montarHref({ periodo, ator: dados.atorFiltro, aba, departamento, vista })} className="underline underline-offset-2 hover:text-foreground">
                limpar
              </Link>
            </span>
          )}
          <span>
            {ddmm(dados.janela.inicio)} – {ddmm(dados.janela.fim)} · {dados.janela.dias} dias · vs. {dados.janela.dias} anteriores
          </span>
        </span>
      </div>

      {departamento && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {dados.departamentoAplicado
            ? "Recorte aplicado a atenção, pessoas e números. KPIs, funil e evolução seguem de toda a operação — as views do ledger ainda não separam por departamento."
            : "As leituras do ledger ainda não separam por departamento: os números abaixo são de toda a operação."}
        </p>
      )}

      <div className="mt-4">
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
            <AbaMarketing visao={marketing} periodo={periodo} />
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
        ) : vista === "tabela" ? (
          <div className="flex flex-col gap-4">
            <Kpis dados={dados} />
            <TabelaPessoas dados={dados} />
            <div className="grid items-start gap-4 xl:grid-cols-2">
              <TabelaNumeros dados={dados} />
              <TabelaFunil dados={dados} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Kpis dados={dados} />

            <div className="grid items-stretch gap-4 xl:grid-cols-3">
              <Bloco className="xl:col-span-2">
                <CabecalhoBloco titulo="Evolução acumulada" descricao={`Leads e conversas recebidas, somados dia a dia nos últimos ${dados.janela.dias} dias.`} />
                <div className="mt-2">
                  <EvolucaoAcumulada serie={dados.serie} />
                </div>
              </Bloco>
              <MetaEscura meta={dados.meta} valorEmNegociacao={dados.valorNegociacao.total} />
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <JarvisDiz frase={dados.jarvis.frase} observacoes={dados.jarvis.observacoes} perguntas={dados.jarvis.perguntas} geradoEm={dados.jarvis.geradoEm} hrefPergunta={hrefPergunta} />
              </div>
              <PrecisaDeAtencao atencao={dados.atencao} />
            </div>

            <TabelaPessoas dados={dados} />

            <div className="grid items-start gap-4 xl:grid-cols-2">
              <TabelaNumeros dados={dados} />
              <TabelaFunil dados={dados} />
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-2">
              <Bloco>
                <CabecalhoBloco titulo="Mensagens recebidas por hora" descricao={`Todas as semanas do período somadas · horário de Brasília`} />
                <div className="mt-3">
                  <BarrasPorHora heatmap={dados.heatmap} />
                </div>
              </Bloco>
              <Bloco>
                <CabecalhoBloco titulo="Mensagens enviadas por dia" descricao="Agentes embaixo, pessoas em cima — um dia com muita pessoa é um dia em que a Clara não segurou." />
                <div className="mt-3">
                  <MensagensPorDia serie={dados.serie} />
                </div>
              </Bloco>
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
