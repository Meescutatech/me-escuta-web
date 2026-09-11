import Link from "next/link";
import { CoinsIcon, TargetIcon, TrendingUpIcon, UsersIcon } from "lucide-react";
import { ArvoreOrigem } from "@/components/marketing/arvore-origem";
import { FunilOrigem } from "@/components/marketing/funil-origem";
import { corDe } from "@/components/marketing/marcas";
import { TabelaCampanhas } from "@/components/marketing/tabela-campanhas";
import { TEXTO_SEM_CAPTURA, TEXTO_SEM_CUSTO } from "@/components/marketing/vazio";
import type { VisaoMarketing } from "@/lib/dados/marketing";
import { brl, inteiro, nosDoNivel, pct, ROTULO_PLATAFORMA } from "@/lib/dados/marketing-calculos";
import { compactar } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";
import { LeadsPorDia } from "./graficos-marketing";
import { Kpi } from "./kpi";
import { Bloco, CabecalhoBloco, NumPct, Td, Th } from "./pecas";

/**
 * Aba Marketing — a tela do Fernando dentro do dashboard (o `/marketing` só redireciona). Mesma
 * leitura (`lerMarketing`, D68), agora no desenho do painel: KPIs "quanto", série por dia, e três
 * tabelas com TOTAL (custo por origem, até onde chegaram, campanhas) mais a árvore de origem.
 *
 * Única exceção à regra "zero cor": Meta azul e Google laranja nas marcas de plataforma — é
 * identidade de canal (par validado pela skill dataviz em 29/08), não decoração.
 */

function CustoPorOrigem({ visao }: { visao: VisaoMarketing }) {
  const pago = visao.arvore.find((n) => n.chave === "pago");
  const plataformas = pago ? nosDoNivel(pago.filhos, "plataforma") : [];
  const organico = visao.arvore.find((n) => n.chave === "organico");
  const linhas = [...plataformas, ...(organico ? [organico] : [])];
  const total = visao.resumo.leads;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse">
        <thead>
          <tr className="border-y border-border bg-muted/40">
            <Th direita={false} className="pl-5">Origem</Th>
            <Th>Leads</Th>
            <Th>Investido</Th>
            <Th className="pr-5">CPL</Th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border font-semibold">
            <Td direita={false} className="pl-5">Total</Td>
            <Td><NumPct n={inteiro(total)} pct="100%" /></Td>
            <Td>{brl(visao.resumo.gasto)}</Td>
            <Td className="pr-5">{brl(visao.resumo.cpl)}</Td>
          </tr>
          {linhas.map((l) => (
            <tr key={l.chave} className="border-b border-border/70 last:border-0 hover:bg-muted/30">
              <Td direita={false} className="pl-5">
                <span className="flex items-center gap-2 font-medium">
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: corDe(l.balde, l.plataforma) }} />
                  {l.nivel === "plataforma" && l.plataforma ? ROTULO_PLATAFORMA[l.plataforma] : l.rotulo}
                </span>
              </Td>
              <Td><NumPct n={inteiro(l.leads)} pct={pct(l.fracao)} /></Td>
              <Td>{l.gasto == null ? <span className="text-muted-foreground">—</span> : brl(l.gasto)}</Td>
              <Td className="pr-5 font-semibold">{l.cpl == null ? <span className="font-normal text-muted-foreground">—</span> : brl(l.cpl)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
      {visao.estadoCusto === "sem_ingestao" && <p className="px-5 py-2 text-[11px] text-muted-foreground">{TEXTO_SEM_CUSTO}</p>}
    </div>
  );
}

export function AbaMarketing({ visao, periodo }: { visao: VisaoMarketing; periodo: number }) {
  const semCaptura = visao.estado !== "com_dado";
  const textoVazio = visao.estado === "serie_nao_iniciada" || visao.estado === "antes_da_serie" ? TEXTO_SEM_CAPTURA : "Nenhum lead captado neste período.";
  const pagos = visao.arvore.find((n) => n.chave === "pago");
  const gastoNota = visao.resumo.gasto == null ? (visao.estadoCusto === "sem_ingestao" ? "sem custo ingerido" : "sem custo no período") : "Meta e Google";

  if (semCaptura) {
    return (
      <div className="flex flex-col gap-4">
        <Bloco>
          <p className="text-[13px] font-medium text-foreground">{textoVazio}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Os números de mídia aparecem aqui assim que o primeiro lead for captado.{" "}
            {visao.periodo.preset !== "90d" ? (
              <Link href="/?aba=marketing&periodo=90" className="font-medium text-foreground underline underline-offset-[3px]">
                Ver 90 dias
              </Link>
            ) : null}
          </p>
        </Bloco>
        {visao.campanhas.length > 0 && (
          <Bloco>
            <CabecalhoBloco titulo="Campanhas e custo" descricao="Gasto sem lead no período." />
            <div className="mt-3"><TabelaCampanhas linhas={visao.campanhas} estadoCusto={visao.estadoCusto} /></div>
          </Bloco>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {(visao.leituraFalhou || visao.parcial) && (
        <p className={cn("rounded-md px-3.5 py-2 text-[12px]", visao.leituraFalhou ? "bg-danger-tint text-danger-ink" : "bg-warning-tint text-warning-ink")}>
          {visao.leituraFalhou ? "Parte da leitura falhou. O que falhou aparece como “—”." : "Período grande demais: os números são de uma amostra."}{" "}
          <Link href={visao.leituraFalhou ? `/?aba=marketing&periodo=${periodo}` : "/?aba=marketing&periodo=7"} className="font-medium underline underline-offset-2">
            {visao.leituraFalhou ? "Recarregar" : "Ver 7 dias"}
          </Link>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icone={UsersIcon} rotulo="Leads captados" valor={inteiro(visao.resumo.leads)} base={visao.periodo.rotulo} trajetoria={compactar(visao.serie.map((p) => p.total), 30)} />
        <Kpi icone={TargetIcon} rotulo="Vieram de anúncio" valor={pct(visao.resumo.fracaoPaga)} base={pagos ? `${inteiro(pagos.leads)} / ${inteiro(visao.resumo.leads)} leads` : ""} />
        <Kpi icone={CoinsIcon} rotulo="Investido" valor={brl(visao.resumo.gasto)} base={gastoNota} />
        <Kpi icone={TrendingUpIcon} rotulo="Custo por lead" valor={brl(visao.resumo.cpl)} base={visao.resumo.cpl == null ? gastoNota : `${brl(visao.resumo.gasto)} / ${inteiro(pagos?.leads ?? 0)} leads pagos`} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Bloco>
          <CabecalhoBloco titulo="Leads por dia" descricao="Quantos entraram e por qual plataforma." />
          <div className="mt-3"><LeadsPorDia pontos={visao.serie} /></div>
        </Bloco>
        <Bloco denso>
          <CabecalhoBloco className="px-5 pt-4" titulo="Custo por origem" descricao="Quanto cada plataforma trouxe e custou." />
          <CustoPorOrigem visao={visao} />
        </Bloco>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Bloco>
          <CabecalhoBloco titulo="De onde vieram" descricao="Pago / orgânico → plataforma → campanha → anúncio." direita={!visao.vocabularioDisponivel ? <span className="text-[11px] text-muted-foreground">sem vocabulário de canais</span> : null} />
          <div className="mt-3">{visao.arvore.length === 0 ? <p className="text-[12.5px] text-muted-foreground">Nenhum lead com origem neste período.</p> : <ArvoreOrigem arvore={visao.arvore} total={visao.resumo.leads} />}</div>
        </Bloco>
        <div className="flex flex-col gap-4">
          <Bloco>
            <CabecalhoBloco titulo="Até onde chegaram" descricao="Etapa atual dos leads de cada origem." />
            <div className="mt-3"><FunilOrigem linhas={visao.funil} marcos={visao.marcos} /></div>
          </Bloco>
          <Bloco>
            <CabecalhoBloco titulo="Campanhas e custo" descricao="Custo por lead de cada campanha, ordenado por gasto." />
            <div className="mt-3"><TabelaCampanhas linhas={visao.campanhas} estadoCusto={visao.estadoCusto} /></div>
          </Bloco>
        </div>
      </div>
    </div>
  );
}
