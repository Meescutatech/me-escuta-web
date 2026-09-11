import Link from "next/link";
import type { DadosDashboardDono } from "@/lib/dados/dashboard-dono";
import type { VisaoMarketing } from "@/lib/dados/marketing";
import type { Janela } from "@/lib/dados/dashboard-ceo-calculos";
import { ABAS, montarHref, type Aba, type EstadoUrl } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";
import { AbaMarketing } from "./aba-marketing";
import { PrecisaDeAtencao } from "./atencao";
import { ChipsAtivos } from "./chips";
import { EvolucaoAcumulada } from "./graficos";
import { HeatmapHoraDia } from "./heatmap";
import { LinhaJarvisDiz } from "@/components/jarvis/linha-diz";
import { ContextoJarvisDashboard } from "./contexto-jarvis";
import { Kpis } from "./kpis";
import { MetaCompacta } from "./meta-compacta";
import { Bloco, CabecalhoBloco, ddmm } from "./pecas";
import { TabelaFunil, TabelaNumeros, TabelaPessoas } from "./tabelas";
import { Toolbar } from "./toolbar";

/*
 * Dashboard do DONO — v4 (10/09/2026, 23:30: "melhorou MUITO", ajustes finais).
 *
 * O que a v4 muda sobre a v3: nada preto (a meta é um card claro como os outros, barra em
 * `primary`); números enxutos (cada card só com o que responde a uma pergunta do dono); grade de
 * 12 colunas com cards da mesma linha na mesma altura (`h-full`), mesmo título de 13px, mesmo
 * padding; sem o toggle Tabela | Dashboard — tabela só onde a informação pede tabela (funil, por
 * pessoa, por número); calendário de verdade (presets + dois meses) e mais filtros (Responsável,
 * Tipo, "Ver mais" para Origem · Número · Cidade). Fontes da v3 continuam valendo: Few (data-ink),
 * Refactoring UI (hierarquia por peso), Stripe/Linear/Vercel/Metabase (toolbar densa, números
 * grandes com contexto pequeno, tabelas densas, quase nenhuma prosa), PRD l. 1453-1467.
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
  // o item mais grave da atenção vira o que a pílula do Jarvis fala ("no painel · 4 conversas sem resposta")
  const pior = dados.atencao.itens[0] ?? null;
  const rotuloAba = ABAS.find((a) => a.chave === aba)?.rotulo ?? "Painel";

  return (
    <main className="w-full px-6 pb-10 pt-3 2xl:px-8">
      <ContextoJarvisDashboard
        aba={`Painel · ${rotuloAba}`}
        aviso={pior ? { texto: pior.titulo.replace(/^\d+\s/, ""), quantidade: pior.quantidade, previa: pior.detalhe ?? dados.jarvis.frase, pergunta: dados.jarvis.perguntas[0] ?? null } : null}
        sugestoes={dados.jarvis.perguntas}
      />
      <Toolbar estado={estado} janela={janela} livre={janelaLivre != null} agoraIso={dados.geradoEm} atores={dados.atores} opcoes={dados.opcoes} mostrarDepartamento={mostrarDepartamento} />
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

      <LinhaJarvisDiz {...dados.jarvis} />

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
          <div className="grid grid-cols-12 gap-3">
            <TabelaPessoas dados={dados} className="col-span-12" />
            <Bloco className="col-span-12">
              <CabecalhoBloco titulo="Mensagens recebidas por hora e dia" />
              <div className="mt-2">
                <HeatmapHoraDia heatmap={dados.heatmap} />
              </div>
            </Bloco>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12">
              <Kpis dados={dados} />
            </div>

            <Bloco className="col-span-12 h-full xl:col-span-9">
              <CabecalhoBloco titulo="Evolução acumulada" />
              <EvolucaoAcumulada serie={dados.serie} className="mt-1" />
            </Bloco>
            <div className="col-span-12 grid grid-rows-[auto_1fr] gap-3 xl:col-span-3">
              <MetaCompacta meta={dados.meta} />
              <PrecisaDeAtencao atencao={dados.atencao} className="h-full" />
            </div>

            <TabelaFunil dados={dados} className="col-span-12 h-full xl:col-span-7" />
            <TabelaNumeros dados={dados} className="col-span-12 h-full xl:col-span-5" />

            {dados.indisponiveis.length > 0 && (
              <p className="col-span-12 text-[11px] text-muted-foreground">
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
