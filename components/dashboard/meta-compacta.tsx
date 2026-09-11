import Link from "next/link";
import { fmtInt, fmtMoeda } from "@/lib/dados/dashboard-ceo-calculos";
import { ritmoMeta, type MetaMes } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * A meta do mês — card escuro compacto (≤ 180px), o "Primary Goal" do 21st.dev sem a gordura:
 * rótulo, valor / alvo, barra com a marca de "onde deveria estar hoje", uma linha de contexto.
 * É CONFIG (`core.config.meta_mensal`); sem ela o card pede para definir em vez de inventar.
 */
export function MetaCompacta({ meta, className }: { meta: MetaMes | null; className?: string }) {
  if (!meta) {
    return (
      <section className={cn("flex flex-col justify-between rounded-lg bg-foreground px-4 py-3.5 text-background", className)}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-background/50">Meta do mês</p>
        <p className="mt-1 text-[15px] font-semibold tracking-tight">Sem meta definida</p>
        <p className="mt-1 text-[11.5px] text-background/60">A meta é configuração, não código.</p>
        <Link href="/configuracoes" className="mt-3 self-start rounded-md border border-background/25 px-2 py-1 text-[11.5px] font-medium hover:bg-background/10">
          Definir meta
        </Link>
      </section>
    );
  }
  const r = ritmoMeta(meta);
  const mes = MESES[Number(meta.mes.slice(5, 7)) - 1] ?? meta.mes;
  const faltam = Math.max(0, meta.metaVendas - meta.vendas);
  const restantes = Math.max(0, meta.diasNoMes - meta.diasCorridos);
  const fracao = meta.metaValor && meta.metaValor > 0 ? Math.min(1, meta.valor / meta.metaValor) : r.fracao;
  const estado = r.estado === "batida" ? "meta batida" : r.estado === "no_ritmo" ? "no ritmo" : "abaixo do ritmo";

  return (
    <section className={cn("flex flex-col rounded-lg bg-foreground px-4 py-3.5 text-background", className)} aria-label={`Meta de ${mes}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-background/50">Meta de {mes}</p>
        <span className="text-[11px] font-semibold" style={{ color: r.estado === "abaixo" ? "var(--chart-5)" : "var(--chart-1)" }}>
          {estado}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[26px] font-semibold leading-none tracking-tight tabular-nums">{fmtMoeda(meta.valor)}</span>
        <span className="text-[11.5px] text-background/60 tabular-nums">{meta.metaValor != null ? `de ${fmtMoeda(meta.metaValor)}` : `alvo ${fmtInt(meta.metaVendas)} vendas`}</span>
      </div>
      <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background/20" role="img" aria-label={`${Math.round(fracao * 100)}% do alvo; esperado até hoje ${Math.round(r.fracaoTempo * 100)}%`}>
        <div className="h-full rounded-full bg-background" style={{ width: `${fracao * 100}%` }} />
        <div aria-hidden className="absolute inset-y-[-3px] w-px bg-background/70" style={{ left: `${Math.min(100, r.fracaoTempo * 100)}%` }} />
      </div>
      <p className="mt-2 text-[11.5px] text-background/60 tabular-nums">
        <b className="font-semibold text-background">{fmtInt(meta.vendas)}</b> de {fmtInt(meta.metaVendas)} vendas · dia {meta.diasCorridos}/{meta.diasNoMes}
        {faltam > 0 && r.ritmoNecessario != null ? (
          <>
            {" "}
            · faltam <b className="font-semibold text-background">{fmtInt(faltam)}</b> em {restantes} d ({r.ritmoNecessario.toFixed(1).replace(".", ",")}/d)
          </>
        ) : null}
      </p>
    </section>
  );
}
