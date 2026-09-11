import Link from "next/link";
import { fmtInt, fmtMoeda } from "@/lib/dados/dashboard-ceo-calculos";
import { ritmoMeta, type MetaMes } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * O card ESCURO da meta (o "Primary Goal" da referência 21st.dev), em `bg-foreground text-background`:
 * rótulo em caixa alta espaçada, título, número grande, alvo à direita, barra branca de progresso
 * com a marca de "onde deveria estar hoje". É o único bloco escuro da tela — é o que o olho acha
 * primeiro depois dos KPIs, e é a pergunta do dono: "o mês fecha?".
 *
 * A meta é CONFIG (`core.config.meta_mensal`), não constante. Sem ela, o card pede para definir.
 */
export function MetaEscura({ meta, valorEmNegociacao, className }: { meta: MetaMes | null; valorEmNegociacao: number; className?: string }) {
  if (!meta) {
    return (
      <section className={cn("flex flex-col justify-between rounded-lg bg-foreground px-5 py-5 text-background", className)}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-background/50">Meta do mês</p>
          <h3 className="mt-1.5 text-lg font-semibold tracking-tight">Sem meta definida</h3>
          <p className="mt-2 text-[12.5px] leading-relaxed text-background/60">A meta é configuração, não código. Defina o número de vendas e o valor do mês e este card passa a medir o ritmo.</p>
        </div>
        <div className="mt-6 flex items-end justify-between gap-3">
          <span className="text-[11px] text-background/60">
            em negociação <b className="font-semibold text-background tabular-nums">{fmtMoeda(valorEmNegociacao)}</b>
          </span>
          <Link href="/configuracoes" className="rounded-md border border-background/25 px-2.5 py-1 text-[12px] font-medium text-background hover:bg-background/10">
            Definir meta
          </Link>
        </div>
      </section>
    );
  }

  const r = ritmoMeta(meta);
  const mes = MESES[Number(meta.mes.slice(5, 7)) - 1] ?? meta.mes;
  const faltam = Math.max(0, meta.metaVendas - meta.vendas);
  const restantes = Math.max(0, meta.diasNoMes - meta.diasCorridos);
  const fracaoValor = meta.metaValor && meta.metaValor > 0 ? Math.min(1, meta.valor / meta.metaValor) : r.fracao;
  const estado = r.estado === "batida" ? "meta batida" : r.estado === "no_ritmo" ? "no ritmo" : "abaixo do ritmo";

  return (
    <section className={cn("flex flex-col justify-between rounded-lg bg-foreground px-5 py-5 text-background", className)} aria-label={`Meta de ${mes}`}>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-background/50">Meta do mês</p>
        <h3 className="mt-1.5 text-lg font-semibold tracking-tight">Ganhos de {mes}</h3>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-end justify-between gap-3">
          <span className="text-3xl font-semibold leading-none tracking-tighter tabular-nums">{fmtMoeda(meta.valor)}</span>
          <span className="mb-0.5 text-[11.5px] font-medium text-background/60 tabular-nums">{meta.metaValor != null ? `Alvo: ${fmtMoeda(meta.metaValor)}` : `Alvo: ${fmtInt(meta.metaVendas)} vendas`}</span>
        </div>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-background/20" role="img" aria-label={`${Math.round(fracaoValor * 100)}% do alvo; esperado até hoje ${Math.round(r.fracaoTempo * 100)}%`}>
          <div className="h-full rounded-full bg-background" style={{ width: `${fracaoValor * 100}%` }} />
          <div aria-hidden className="absolute inset-y-[-3px] w-px bg-background/70" style={{ left: `${Math.min(100, r.fracaoTempo * 100)}%` }} />
        </div>
        <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11.5px] text-background/60 tabular-nums">
          <span>
            <b className="font-semibold text-background">{fmtInt(meta.vendas)}</b> de {fmtInt(meta.metaVendas)} vendas · dia {meta.diasCorridos} de {meta.diasNoMes}
          </span>
          {/* sobre o fundo escuro, o `-ink` da tríade some; o degrau de gráfico (`--chart-1/5`) é o que lê */}
          <span className="font-semibold" style={{ color: r.estado === "abaixo" ? "var(--chart-5)" : "var(--chart-1)" }}>
            {estado}
          </span>
        </div>
        {faltam > 0 && r.ritmoNecessario != null ? (
          <p className="mt-1 text-[11.5px] text-background/60 tabular-nums">
            faltam <b className="font-semibold text-background">{fmtInt(faltam)}</b> vendas em {restantes} dias — {r.ritmoNecessario.toFixed(1).replace(".", ",")} por dia
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-background/15 pt-3 text-[11.5px] text-background/60">
        <span>
          em negociação <b className="font-semibold text-background tabular-nums">{fmtMoeda(valorEmNegociacao)}</b>
        </span>
        <Link href="/funil" className="font-medium text-background underline decoration-background/40 underline-offset-[3px] hover:decoration-background">
          Abrir o funil
        </Link>
      </div>
    </section>
  );
}
