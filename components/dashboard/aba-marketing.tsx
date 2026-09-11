import Link from "next/link";
import { CoinsIcon, GitBranchIcon, MegaphoneIcon, TargetIcon, TrendingUpIcon, UsersIcon } from "lucide-react";
import { ArvoreOrigem } from "@/components/marketing/arvore-origem";
import { FunilOrigem } from "@/components/marketing/funil-origem";
import { corDe } from "@/components/marketing/marcas";
import { SerieLeads } from "@/components/marketing/serie-leads";
import { TabelaCampanhas } from "@/components/marketing/tabela-campanhas";
import { TEXTO_SEM_CAPTURA, TEXTO_SEM_CUSTO } from "@/components/marketing/vazio";
import type { VisaoMarketing } from "@/lib/dados/marketing";
import { brl, inteiro, nosDoNivel, pct, ROTULO_PLATAFORMA } from "@/lib/dados/marketing-calculos";
import { compactar } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";
import { Acao, Th } from "./pecas";
import { BarraNaCelula, BlocoVazio, CartaoGrafico, CartaoIndicador, SecaoTabela } from "./relatorio";

/**
 * Aba Marketing — a tela do Fernando dentro do dashboard do dono (o `/marketing` só redireciona
 * para cá). Mesma leitura (`lerMarketing`, D68: as consultas que o MCP do Fernando também lê),
 * mesmos blocos, agora no kit de relatório: quanto (KPIs) → quando (série) → de onde (árvore) →
 * até onde (funil por origem) → quanto custou (por plataforma e por campanha).
 */

function CustoPorPlataforma({ visao }: { visao: VisaoMarketing }) {
  const pago = visao.arvore.find((n) => n.chave === "pago");
  const plataformas = pago ? nosDoNivel(pago.filhos, "plataforma") : [];
  const organico = visao.arvore.find((n) => n.chave === "organico");
  const linhas = [...plataformas, ...(organico ? [organico] : [])];
  if (linhas.length === 0) return <BlocoVazio titulo="Nenhum lead com origem no período" />;
  const maxLeads = Math.max(1, ...linhas.map((l) => l.leads));
  const semCusto = visao.estadoCusto === "sem_ingestao";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse">
        <thead>
          <tr>
            <Th direita={false}>Origem</Th>
            <Th>Leads</Th>
            <Th>Do total</Th>
            <Th>Investido</Th>
            <Th>CPL</Th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave} className="border-t border-border/70">
              <td className="py-2 pr-2">
                <span className="flex items-center gap-2 text-ui-13 font-medium text-foreground">
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: corDe(l.balde, l.plataforma) }} />
                  {l.nivel === "plataforma" && l.plataforma ? ROTULO_PLATAFORMA[l.plataforma] : l.rotulo}
                </span>
              </td>
              <td className="px-2 py-2 text-right text-ui-13 tabular-nums text-foreground">
                <span className="inline-flex items-center gap-2">
                  {inteiro(l.leads)}
                  <BarraNaCelula valor={l.leads} max={maxLeads} cor={corDe(l.balde, l.plataforma)} />
                </span>
              </td>
              <td className="px-2 py-2 text-right text-ui-12 tabular-nums text-muted-foreground">{pct(l.fracao)}</td>
              <td className="px-2 py-2 text-right text-ui-13 tabular-nums text-foreground">{l.gasto == null ? <span className="text-muted-foreground">—</span> : brl(l.gasto)}</td>
              <td className="px-2 py-2 text-right text-ui-13 tabular-nums text-foreground">{l.cpl == null ? <span className="text-muted-foreground">—</span> : brl(l.cpl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {semCusto && <p className="mt-2 text-ui-11 text-muted-foreground">{TEXTO_SEM_CUSTO}</p>}
    </div>
  );
}

export function AbaMarketing({ visao, periodo }: { visao: VisaoMarketing; periodo: number }) {
  const semCaptura = visao.estado !== "com_dado";
  const textoVazio = visao.estado === "serie_nao_iniciada" || visao.estado === "antes_da_serie" ? TEXTO_SEM_CAPTURA : "Nenhum lead captado neste período.";
  const trajetoria = compactar(visao.serie.map((p) => p.total));
  const pagos = visao.arvore.find((n) => n.chave === "pago");
  const gastoNota = visao.resumo.gasto == null ? (visao.estadoCusto === "sem_ingestao" ? "sem custo ingerido" : "sem custo no período") : "Meta e Google";

  return (
    <div className="flex flex-col gap-4">
      {(visao.leituraFalhou || visao.parcial) && (
        <p className={cn("rounded-lg px-3.5 py-2 text-ui-12", visao.leituraFalhou ? "bg-danger-tint text-danger-ink" : "bg-warning-tint text-warning-ink")}>
          {visao.leituraFalhou ? "Parte da leitura falhou. O que falhou aparece como “—”." : "Período grande demais: os números são de uma amostra."}{" "}
          <Link href={visao.leituraFalhou ? `/?aba=marketing&periodo=${periodo}` : "/?aba=marketing&periodo=7"} className="font-medium underline underline-offset-2">
            {visao.leituraFalhou ? "Recarregar" : "Ver 7 dias"}
          </Link>
        </p>
      )}

      {semCaptura ? (
        <>
          <div className="rounded-xl bg-card ring-1 ring-foreground/10">
            <BlocoVazio titulo={textoVazio} descricao="Os números de mídia aparecem aqui assim que o primeiro lead for captado." acao={visao.periodo.preset !== "90d" ? <Acao href="/?aba=marketing&periodo=90">Ver 90 dias</Acao> : undefined} />
          </div>
          {visao.campanhas.length > 0 && (
            <SecaoTabela titulo="Campanhas e custo" descricao="Gasto sem lead no período." icone={MegaphoneIcon}>
              <TabelaCampanhas linhas={visao.campanhas} estadoCusto={visao.estadoCusto} />
            </SecaoTabela>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <CartaoIndicador rotulo="Leads captados" dica="Leads distintos com origem registrada no período — pelo primeiro toque de cada um." icone={UsersIcon} acento="var(--chart-3)" valor={inteiro(visao.resumo.leads)} detalhe={`${visao.periodo.rotulo}`} trajetoria={trajetoria} corTrajetoria="var(--chart-3)" />
            <CartaoIndicador rotulo="Vieram de anúncio" dica="Fração dos leads cujo primeiro toque foi pago (Meta ou Google). O resto é orgânico ou não classificado." icone={TargetIcon} acento="var(--chart-2)" valor={pct(visao.resumo.fracaoPaga)} detalhe={pagos ? `${inteiro(pagos.leads)} leads pagos` : ""} />
            <CartaoIndicador rotulo="Investido" dica="Soma do custo de mídia ingerido no período (Meta e Google). Nunca é zero quando ninguém ingeriu custo — é “—”, e o rodapé diz por quê." icone={CoinsIcon} acento="var(--chart-4)" valor={brl(visao.resumo.gasto)} detalhe={gastoNota} />
            <CartaoIndicador rotulo="Custo por lead" dica="Investido ÷ leads pagos. Só existe quando há custo ingerido e lead pago no mesmo período." icone={TrendingUpIcon} acento="var(--chart-1)" valor={brl(visao.resumo.cpl)} detalhe={visao.resumo.cpl == null ? gastoNota : "por lead pago"} />
          </div>

          <CartaoGrafico titulo="Leads por dia" descricao="Quantos entraram e por qual plataforma." icone={TrendingUpIcon} dica="Colunas empilhadas por dia: Meta, Google, orgânico e outros. A legenda está no topo do gráfico." alturaConteudo={200}>
            <SerieLeads pontos={visao.serie} />
          </CartaoGrafico>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <SecaoTabela titulo="De onde vieram" descricao="Pago / orgânico → plataforma → campanha → anúncio." icone={GitBranchIcon} dica="Cada linha é um nó da origem: nome, cidades da segmentação, barra proporcional ao total de leads do período, leads e custo por lead. Campanha com anúncios abre e fecha." meta={!visao.vocabularioDisponivel ? "sem vocabulário de canais" : undefined}>
              {visao.arvore.length === 0 ? <BlocoVazio titulo="Nenhum lead com origem neste período" /> : <ArvoreOrigem arvore={visao.arvore} total={visao.resumo.leads} />}
            </SecaoTabela>
            <div className="flex flex-col gap-4">
              <SecaoTabela titulo="Custo por origem" descricao="Quanto cada plataforma trouxe e custou." icone={CoinsIcon} dica="Leads e custo por plataforma paga, mais o orgânico para comparação. CPL é investido ÷ leads da própria plataforma.">
                <CustoPorPlataforma visao={visao} />
              </SecaoTabela>
              <SecaoTabela titulo="Até onde chegaram" descricao="Etapa atual dos leads de cada origem." icone={TargetIcon} dica="De cada origem, quantos leads chegaram a Qualificado, Consulta e Venda — pela etapa ATUAL (quem está em Proposta já passou por Qualificado). Perdido não conta em marco nenhum.">
                <FunilOrigem linhas={visao.funil} marcos={visao.marcos} />
              </SecaoTabela>
            </div>
          </div>

          <SecaoTabela titulo="Campanhas e custo" descricao="Custo por lead de cada campanha, ordenado por gasto." icone={MegaphoneIcon} dica="Uma linha por campanha com lead ou gasto no período. Sem custo ingerido, a coluna CPL fica em “—”.">
            <TabelaCampanhas linhas={visao.campanhas} estadoCusto={visao.estadoCusto} />
          </SecaoTabela>
        </>
      )}
    </div>
  );
}
