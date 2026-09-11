import Link from "next/link";
import { CoinsIcon, TargetIcon, TrendingUpIcon, UsersIcon } from "lucide-react";
import { corDe } from "@/components/marketing/marcas";
import { TEXTO_SEM_CAPTURA, TEXTO_SEM_CUSTO } from "@/components/marketing/vazio";
import type { VisaoMarketing } from "@/lib/dados/marketing";
import { brl, inteiro, MARCOS, nosDoNivel, pct, ROTULO_MARCO, ROTULO_PLATAFORMA, SEM_CAMPANHA, type NoOrigem } from "@/lib/dados/marketing-calculos";
import { compactar } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";
import { LeadsPorDia } from "./graficos-marketing";
import { Kpi } from "./kpi";
import { Bloco, CabecalhoBloco, NumPct, Td, Th } from "./pecas";

/**
 * Aba Marketing — a MESMA dieta da Operação (Diogo 23:30): 4 KPIs enxutos, gráfico ≤ 240px, e
 * tabelas densas de 32px com TOTAL — custo por origem, de onde vieram (árvore sem barras), até
 * onde chegaram, campanhas. Pensada como material de apoio do Jarvis: são os números que o
 * "Jarvis diz" cita. Única cor além do verde/vermelho: as marcas Meta/Google (identidade de canal).
 */

function Marca({ no }: { no: Pick<NoOrigem, "balde" | "plataforma"> }) {
  return <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: corDe(no.balde, no.plataforma) }} />;
}

function CustoPorOrigem({ visao }: { visao: VisaoMarketing }) {
  const pago = visao.arvore.find((n) => n.chave === "pago");
  const plataformas = pago ? nosDoNivel(pago.filhos, "plataforma") : [];
  const organico = visao.arvore.find((n) => n.chave === "organico");
  const linhas = [...plataformas, ...(organico ? [organico] : [])];
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-border bg-muted/40">
            <Th direita={false} className="pl-3.5">Origem</Th>
            <Th>Leads</Th>
            <Th>Investido</Th>
            <Th className="pr-3.5">CPL</Th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border font-semibold">
            <Td direita={false} className="pl-3.5">Total</Td>
            <Td>{inteiro(visao.resumo.leads)}</Td>
            <Td>{brl(visao.resumo.gasto)}</Td>
            <Td className="pr-3.5">{brl(visao.resumo.cpl)}</Td>
          </tr>
          {linhas.map((l) => (
            <tr key={l.chave} className="border-b border-border/70 last:border-0 hover:bg-muted/30">
              <Td direita={false} className="pl-3.5">
                <span className="flex items-center gap-2 font-medium">
                  <Marca no={l} />
                  {l.nivel === "plataforma" && l.plataforma ? ROTULO_PLATAFORMA[l.plataforma] : l.rotulo}
                </span>
              </Td>
              <Td><NumPct n={inteiro(l.leads)} pct={pct(l.fracao)} /></Td>
              <Td>{l.gasto == null ? <span className="text-muted-foreground">—</span> : brl(l.gasto)}</Td>
              <Td className="pr-3.5 font-semibold">{l.cpl == null ? <span className="font-normal text-muted-foreground">—</span> : brl(l.cpl)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
      {visao.estadoCusto === "sem_ingestao" && <p className="px-3.5 py-1.5 text-[11px] text-muted-foreground">{TEXTO_SEM_CUSTO}</p>}
    </div>
  );
}

/** A árvore de origem como tabela densa: balde › plataforma › campanha, recuo por nível, sem barras. */
function DeOndeVieram({ visao }: { visao: VisaoMarketing }) {
  const linhas: Array<{ no: NoOrigem; nivel: number }> = [];
  const andar = (no: NoOrigem, nivel: number) => {
    if (no.chave === SEM_CAMPANHA && no.leads === 0) return;
    linhas.push({ no, nivel });
    if (no.nivel !== "campanha") for (const f of no.filhos) andar(f, nivel + 1);
  };
  visao.arvore.forEach((n) => andar(n, 0));
  if (linhas.length === 0) return <p className="px-3.5 py-6 text-center text-[12.5px] text-muted-foreground">Nenhum lead com origem neste período.</p>;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-border bg-muted/40">
            <Th direita={false} className="pl-3.5">Origem</Th>
            <Th>Leads</Th>
            <Th className="pr-3.5">CPL</Th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ no, nivel }) => (
            <tr key={`${nivel}-${no.chave}`} className={cn("border-b border-border/70 last:border-0 hover:bg-muted/30", nivel === 0 && "font-semibold")}>
              <Td direita={false} className="pl-3.5">
                <span className="flex items-center gap-2" style={{ paddingLeft: nivel * 16 }}>
                  <Marca no={no} />
                  <span className="truncate">{no.nivel === "plataforma" && no.plataforma ? ROTULO_PLATAFORMA[no.plataforma] : no.chave === SEM_CAMPANHA ? "sem campanha" : no.rotulo}</span>
                  {no.cidades.length > 0 && no.nivel === "campanha" ? <span className="truncate text-[11px] font-normal text-muted-foreground">{no.cidades.join(" · ")}</span> : null}
                </span>
              </Td>
              <Td><NumPct n={inteiro(no.leads)} pct={pct(no.fracao)} /></Td>
              <Td className="pr-3.5">{no.cpl == null ? <span className="text-muted-foreground">—</span> : brl(no.cpl)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Até onde chegaram: por origem, quantos chegaram a cada marco (n + %), sem barras. */
function AteOndeChegaram({ visao }: { visao: VisaoMarketing }) {
  const marcos = MARCOS.filter((m) => visao.marcos.ordem[m] != null);
  if (visao.funil.length === 0) return <p className="px-3.5 py-6 text-center text-[12.5px] text-muted-foreground">Nenhum lead com origem neste período.</p>;
  const total = { leads: 0, marcos: Object.fromEntries(marcos.map((m) => [m, 0])) as Record<string, number>, perdidos: 0 };
  for (const l of visao.funil) {
    total.leads += l.leads;
    total.perdidos += l.perdidos;
    for (const m of marcos) total.marcos[m] += l.marcos[m] ?? 0;
  }
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-border bg-muted/40">
            <Th direita={false} className="pl-3.5">Origem</Th>
            <Th>Leads</Th>
            {marcos.map((m) => (
              <Th key={m} title={`etapa: ${visao.marcos.nome[m] ?? ""}`}>{ROTULO_MARCO[m]}</Th>
            ))}
            <Th className="pr-3.5">Perdidos</Th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border font-semibold">
            <Td direita={false} className="pl-3.5">Total</Td>
            <Td>{inteiro(total.leads)}</Td>
            {marcos.map((m) => (
              <Td key={m}><NumPct n={inteiro(total.marcos[m])} pct={total.leads > 0 ? pct(total.marcos[m] / total.leads) : null} /></Td>
            ))}
            <Td className="pr-3.5 text-danger-ink">{inteiro(total.perdidos)}</Td>
          </tr>
          {visao.funil.map((l) => (
            <tr key={l.chave} className="border-b border-border/70 last:border-0 hover:bg-muted/30">
              <Td direita={false} className="pl-3.5">
                <span className="flex items-center gap-2 font-medium">
                  <Marca no={l} />
                  {l.rotulo}
                </span>
              </Td>
              <Td className="font-semibold">{inteiro(l.leads)}</Td>
              {marcos.map((m) => (
                <Td key={m}><NumPct n={inteiro(l.marcos[m])} pct={pct(l.taxas[m])} /></Td>
              ))}
              <Td className={cn("pr-3.5", l.perdidos > 0 && "text-danger-ink")}>{inteiro(l.perdidos)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Campanhas({ visao }: { visao: VisaoMarketing }) {
  if (visao.campanhas.length === 0) return <p className="px-3.5 py-6 text-center text-[12.5px] text-muted-foreground">Nenhuma campanha com lead ou gasto neste período.</p>;
  const totalLeads = visao.campanhas.reduce((s, l) => s + l.leads, 0);
  const totalGasto = visao.campanhas.reduce((s, l) => s + (l.gasto ?? 0), 0);
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-border bg-muted/40">
            <Th direita={false} className="pl-3.5">Campanha</Th>
            <Th>Leads</Th>
            <Th>Investido</Th>
            <Th className="pr-3.5">CPL</Th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border font-semibold">
            <Td direita={false} className="pl-3.5">Total</Td>
            <Td>{inteiro(totalLeads)}</Td>
            <Td>{visao.estadoCusto === "ingerido" ? brl(totalGasto) : "—"}</Td>
            <Td className="pr-3.5">{visao.estadoCusto === "ingerido" && totalLeads > 0 ? brl(totalGasto / totalLeads) : "—"}</Td>
          </tr>
          {visao.campanhas.map((l) => (
            <tr key={`${l.plataforma}-${l.campanhaId}`} className="border-b border-border/70 last:border-0 hover:bg-muted/30">
              <Td direita={false} className="pl-3.5">
                <span className="flex min-w-0 items-center gap-2">
                  <Marca no={{ balde: "pago", plataforma: l.plataforma }} />
                  <span className="truncate font-medium">{l.rotulo}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{ROTULO_PLATAFORMA[l.plataforma]}{l.cidades.length > 0 ? ` · ${l.cidades.join(", ")}` : ""}</span>
                </span>
              </Td>
              <Td className="font-semibold">{inteiro(l.leads)}</Td>
              <Td>{l.gasto == null ? <span className="text-muted-foreground">—</span> : brl(l.gasto)}</Td>
              <Td className="pr-3.5 font-semibold">{l.cpl != null ? brl(l.cpl) : l.gasto != null && l.leads === 0 ? <span className="font-normal text-warning-ink">gasto sem lead</span> : <span className="font-normal text-muted-foreground">—</span>}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AbaMarketing({ visao, periodo }: { visao: VisaoMarketing; periodo: number }) {
  const semCaptura = visao.estado !== "com_dado";
  const textoVazio = visao.estado === "serie_nao_iniciada" || visao.estado === "antes_da_serie" ? TEXTO_SEM_CAPTURA : "Nenhum lead captado neste período.";
  const pagos = visao.arvore.find((n) => n.chave === "pago");
  const gastoNota = visao.resumo.gasto == null ? (visao.estadoCusto === "sem_ingestao" ? "sem custo ingerido" : "sem custo no período") : undefined;

  if (semCaptura) {
    return (
      <div className="grid grid-cols-12 gap-3">
        <Bloco className="col-span-12">
          <p className="text-[13px] font-medium text-foreground">{textoVazio}</p>
          {visao.periodo.preset !== "90d" ? (
            <Link href="/?aba=marketing&periodo=90" className="mt-1 inline-block text-[12px] font-medium text-foreground underline underline-offset-[3px]">
              Ver 90 dias
            </Link>
          ) : null}
        </Bloco>
        {visao.campanhas.length > 0 && (
          <Bloco denso className="col-span-12">
            <CabecalhoBloco className="px-3.5 pt-2.5" titulo="Campanhas" />
            <Campanhas visao={visao} />
          </Bloco>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      {(visao.leituraFalhou || visao.parcial) && (
        <p className={cn("col-span-12 rounded-md px-3.5 py-2 text-[12px]", visao.leituraFalhou ? "bg-danger-tint text-danger-ink" : "bg-warning-tint text-warning-ink")}>
          {visao.leituraFalhou ? "Parte da leitura falhou. O que falhou aparece como “—”." : "Período grande demais: os números são de uma amostra."}{" "}
          <Link href={visao.leituraFalhou ? `/?aba=marketing&periodo=${periodo}` : "/?aba=marketing&periodo=7"} className="font-medium underline underline-offset-2">
            {visao.leituraFalhou ? "Recarregar" : "Ver 7 dias"}
          </Link>
        </p>
      )}

      <div className="col-span-12 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi icone={UsersIcon} rotulo="Leads captados" valor={inteiro(visao.resumo.leads)} trajetoria={compactar(visao.serie.map((p) => p.total), 30)} />
        <Kpi icone={TargetIcon} rotulo="Vieram de anúncio" valor={pct(visao.resumo.fracaoPaga)} base={pagos ? `${inteiro(pagos.leads)} de ${inteiro(visao.resumo.leads)}` : undefined} />
        <Kpi icone={CoinsIcon} rotulo="Investido" valor={brl(visao.resumo.gasto)} base={gastoNota} />
        <Kpi icone={TrendingUpIcon} rotulo="Custo por lead" valor={brl(visao.resumo.cpl)} base={visao.resumo.cpl == null ? gastoNota : "por lead pago"} />
      </div>

      <Bloco className="col-span-12 h-full xl:col-span-8">
        <CabecalhoBloco titulo="Leads por dia" />
        <div className="mt-2">
          <LeadsPorDia pontos={visao.serie} />
        </div>
      </Bloco>
      <Bloco denso className="col-span-12 h-full xl:col-span-4">
        <CabecalhoBloco className="px-3.5 pt-2.5" titulo="Custo por origem" />
        <CustoPorOrigem visao={visao} />
      </Bloco>

      <Bloco denso className="col-span-12 h-full xl:col-span-6">
        <CabecalhoBloco className="px-3.5 pt-2.5" titulo="De onde vieram" direita={!visao.vocabularioDisponivel ? <span className="text-[11px] text-muted-foreground">sem vocabulário de canais</span> : null} />
        <DeOndeVieram visao={visao} />
      </Bloco>
      <Bloco denso className="col-span-12 h-full xl:col-span-6">
        <CabecalhoBloco className="px-3.5 pt-2.5" titulo="Até onde chegaram" />
        <AteOndeChegaram visao={visao} />
      </Bloco>

      <Bloco denso className="col-span-12">
        <CabecalhoBloco className="px-3.5 pt-2.5" titulo="Campanhas" />
        <Campanhas visao={visao} />
      </Bloco>
    </div>
  );
}
