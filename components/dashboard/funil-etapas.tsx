import Link from "next/link";
import { FilterIcon, TargetIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DadosDashboardDono } from "@/lib/dados/dashboard-dono";
import { fmtInt, fmtMoeda, fmtPct, type EtapaResumo } from "@/lib/dados/dashboard-ceo-calculos";
import { ritmoMeta, type MetaMes } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";
import { Acao, Th } from "./pecas";
import { DicaInfo, SecaoTabela, SeloVariacao, variacaoRelativa } from "./relatorio";

/**
 * O funil no período — entradas por etapa, conversão "até aqui" e "da anterior", tempo médio na
 * etapa e o estoque de agora — ao lado da meta do mês. Os dois respondem "como estamos indo" em
 * dinheiro: o funil diz por onde o lead escorre, a meta diz se o mês fecha.
 */

function fmtDias(d: number | null): string {
  if (d == null) return "—";
  if (d < 1) return `${Math.round(d * 24)} h`;
  return `${d.toFixed(1).replace(".", ",")} d`;
}

function LinhaEtapa({ e, max }: { e: EtapaResumo & { tempoMedioDias: number | null }; max: number }) {
  const terminal = e.tipo !== "aberto";
  const entrou = e.entradas.atual ?? 0;
  const cel = "py-2 text-right text-ui-12 tabular-nums";
  return (
    <tr className="border-t border-border/70">
      <td className="py-2 pr-3">
        <span className={cn("block truncate text-ui-13", terminal ? "text-muted-foreground" : "font-medium text-foreground")}>{e.nome}</span>
      </td>
      <td className="w-[22%] py-2 pr-3">
        <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
          {entrou > 0 && (
            <span
              className={cn("block h-full rounded-full", e.tipo === "ganho" ? "bg-success-ink" : e.tipo === "perdido" ? "bg-danger-ink" : "bg-navy/80")}
              style={{ width: `${Math.max(2, (entrou / max) * 100)}%` }}
            />
          )}
        </span>
      </td>
      <td className={cn(cel, "font-medium text-foreground")}>
        <span className="inline-flex items-center gap-1.5">
          {fmtInt(entrou)}
          <SeloVariacao delta={variacaoRelativa(e.entradas.atual, e.entradas.anterior)} tamanho="sm" menorEhMelhor={e.tipo === "perdido"} />
        </span>
      </td>
      <td className={cn(cel, "text-muted-foreground")}>{e.tipo === "aberto" ? fmtPct(e.pctAteAqui) : ""}</td>
      <td className={cn(cel, "text-muted-foreground")}>{e.tipo === "aberto" && e.pctDaAnterior != null ? fmtPct(e.pctDaAnterior) : ""}</td>
      <td className={cn(cel, "text-muted-foreground")}>{e.tipo === "aberto" ? fmtDias(e.tempoMedioDias) : ""}</td>
      <td className={cn(cel, "text-foreground")} title={e.valor > 0 ? `${fmtMoeda(e.valor)} em valor` : undefined}>
        {e.tipo === "aberto" ? fmtInt(e.estoque) : ""}
      </td>
    </tr>
  );
}

export function FunilEtapas({ dados }: { dados: DadosDashboardDono }) {
  const visiveis = dados.funilComTempo.filter((e) => e.tipo === "aberto" || (e.entradas.atual ?? 0) > 0 || e.estoque > 0);
  const max = Math.max(1, ...visiveis.map((e) => e.entradas.atual ?? 0));
  const semEntradas = visiveis.every((e) => (e.entradas.atual ?? 0) === 0);
  const temTempo = visiveis.some((e) => e.tempoMedioDias != null);
  const abertas = visiveis.filter((e) => e.tipo === "aberto");
  const base = abertas[0]?.entradas.atual ?? 0;
  const ganho = visiveis.find((e) => e.tipo === "ganho");
  const conversaoTotal = base > 0 && ganho ? (ganho.entradas.atual ?? 0) / base : null;

  return (
    <SecaoTabela
      titulo="Funil no período"
      descricao={`Entradas por etapa nos últimos ${dados.periodo} dias, e o que está parado em cada uma agora.`}
      icone={FilterIcon}
      meta={conversaoTotal != null ? `${fmtPct(conversaoTotal, 1)} de entrada a venda` : undefined}
      dica="Cada linha é uma etapa. 'Entrou' conta quantos leads chegaram nela no período; 'até aqui' divide pela primeira etapa; 'da anterior' divide pela etapa de cima — é onde o funil vaza. 'Tempo' é quanto um lead fica na etapa em média; 'agora' é o estoque, sem janela."
      rodape="Em negociação agora: o valor registrado nos leads das etapas abertas, no título de cada estoque."
    >
      {visiveis.length === 0 ? (
        <p className="py-4 text-ui-13 text-muted-foreground">
          Funil sem etapas configuradas. <Acao href="/configuracoes">Configurar</Acao>
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                <Th direita={false}>Etapa</Th>
                <Th />
                <Th>Entrou</Th>
                <Th title="entradas nesta etapa ÷ entradas na primeira etapa">Até aqui</Th>
                <Th title="entradas nesta etapa ÷ entradas na etapa anterior">Da anterior</Th>
                <Th title="permanência média na etapa">{temTempo ? "Tempo" : ""}</Th>
                <Th title="leads na etapa agora">Agora</Th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((e) => (
                <LinhaEtapa key={e.etapa} e={e} max={max} />
              ))}
            </tbody>
          </table>
          {semEntradas && (
            <p className="mt-2 text-ui-12 text-muted-foreground">
              Nenhum lead entrou ou mudou de etapa no período. <Acao href="/funil">Abrir funil</Acao>
            </p>
          )}
          {!temTempo && (
            <p className="mt-2 text-ui-11 text-muted-foreground">Tempo médio por etapa sem leitura — a view do funil ainda não mede permanência.</p>
          )}
        </div>
      )}
    </SecaoTabela>
  );
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * A meta do mês: vendas realizadas sobre a meta, com a marca de "onde deveríamos estar hoje" no
 * ritmo linear. É a única régua com meta na tela — e ela é CONFIG (`core.config.meta_mensal`),
 * não constante: sem a config publicada, o bloco pede para definir em vez de inventar.
 */
export function MetaDoMes({ meta, valorEmNegociacao }: { meta: MetaMes | null; valorEmNegociacao: number }) {
  if (!meta) {
    return (
      <Card data-slot="meta-mes">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
              <TargetIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </div>
            <CardTitle className="text-ui-14 font-semibold">Meta do mês</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-ui-13 text-muted-foreground">Nenhuma meta definida para este mês.</p>
          <p className="text-ui-12 text-muted-foreground">
            A meta é configuração, não código: <Acao href="/configuracoes">definir em Configurações</Acao>.
          </p>
          <p className="mt-2 border-t border-border/70 pt-2 text-ui-12 text-muted-foreground">
            Em negociação agora: <b className="font-semibold text-foreground tabular-nums">{fmtMoeda(valorEmNegociacao)}</b>
          </p>
        </CardContent>
      </Card>
    );
  }

  const r = ritmoMeta(meta);
  const mes = MESES[Number(meta.mes.slice(5, 7)) - 1] ?? meta.mes;
  const faltam = Math.max(0, meta.metaVendas - meta.vendas);
  const restantes = Math.max(0, meta.diasNoMes - meta.diasCorridos);
  const estado =
    r.estado === "batida"
      ? { texto: "meta batida", cor: "text-success-ink" }
      : r.estado === "no_ritmo"
        ? { texto: "no ritmo", cor: "text-success-ink" }
        : { texto: "abaixo do ritmo", cor: "text-danger-ink" };

  return (
    <Card data-slot="meta-mes">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
            <TargetIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-ui-14 font-semibold">Meta de {mes}</CardTitle>
            <p className="mt-0.5 truncate text-ui-11 text-muted-foreground">
              dia {meta.diasCorridos} de {meta.diasNoMes}
            </p>
          </div>
        </div>
        <DicaInfo
          titulo={`Meta de ${mes}`}
          dica="Vendas fechadas no mês sobre a meta. A marca fina na barra é onde a contagem deveria estar hoje se o mês fosse linear; 'no ritmo' é estar a menos de 10% dela."
          rodape="A meta vem de Configurações — mudar o número nunca exige código."
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-h1 font-semibold leading-none tracking-tight text-foreground tabular-nums">{fmtInt(meta.vendas)}</span>
          <span className="text-ui-14 text-muted-foreground tabular-nums">de {fmtInt(meta.metaVendas)} vendas</span>
          <span className={cn("ml-auto text-ui-12 font-medium", estado.cor)}>{estado.texto}</span>
        </div>

        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${fmtPct(r.fracao)} da meta; esperado até hoje ${fmtPct(r.fracaoTempo)}`}>
          <span className={cn("absolute inset-y-0 left-0 rounded-full", r.estado === "abaixo" ? "bg-danger-ink/80" : "bg-success-ink")} style={{ width: `${Math.min(100, r.fracao * 100)}%` }} />
          <span aria-hidden className="absolute inset-y-[-2px] w-px bg-foreground/60" style={{ left: `${Math.min(100, r.fracaoTempo * 100)}%` }} />
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-ui-12 text-muted-foreground">
          <span>
            esperado até hoje <b className="font-semibold text-foreground tabular-nums">{r.esperadoAteHoje.toFixed(0)}</b>
          </span>
          {faltam > 0 && r.ritmoNecessario != null ? (
            <span>
              faltam <b className="font-semibold text-foreground tabular-nums">{fmtInt(faltam)}</b> em {restantes} dias ·{" "}
              <b className="font-semibold text-foreground tabular-nums">{r.ritmoNecessario.toFixed(1).replace(".", ",")}</b>/dia
            </span>
          ) : faltam === 0 ? (
            <span>faltam 0</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border/70 pt-3 text-ui-12 text-muted-foreground">
          <span>
            faturado <b className="font-semibold text-foreground tabular-nums">{fmtMoeda(meta.valor)}</b>
            {meta.metaValor != null ? <span> de {fmtMoeda(meta.metaValor)}</span> : null}
          </span>
          <span>
            em negociação <b className="font-semibold text-foreground tabular-nums">{fmtMoeda(valorEmNegociacao)}</b>
          </span>
        </div>
        <Link href="/funil" className="text-ui-12 font-medium text-foreground underline decoration-foreground/30 underline-offset-[3px] hover:decoration-foreground">
          Abrir o funil
        </Link>
      </CardContent>
    </Card>
  );
}
