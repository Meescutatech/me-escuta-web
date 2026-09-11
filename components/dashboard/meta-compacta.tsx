import Link from "next/link";
import { fmtInt, fmtMoeda } from "@/lib/dados/dashboard-ceo-calculos";
import { ritmoMeta, type MetaMes } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";
import { Bloco, CabecalhoBloco } from "./pecas";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * A meta do mês — card CLARO igual aos outros (Diogo 23:30: "do nada um card preto não faz
 * sentido"): valor / alvo, barra em `primary` com a marca de "onde deveria estar hoje", uma linha
 * de contexto e o estado em verde/vermelho. É CONFIG (`core.config.meta_mensal`); sem ela pede
 * para definir em vez de inventar.
 */
export function MetaCompacta({ meta, className }: { meta: MetaMes | null; className?: string }) {
  if (!meta) {
    return (
      <Bloco className={cn("flex flex-col", className)}>
        <CabecalhoBloco titulo="Meta do mês" />
        <p className="mt-2 text-[12.5px] text-muted-foreground">Sem meta definida — a meta é configuração, não código.</p>
        <Link href="/configuracoes" className="mt-2 self-start text-[12px] font-medium text-foreground underline underline-offset-[3px]">
          Definir meta
        </Link>
      </Bloco>
    );
  }
  const r = ritmoMeta(meta);
  const mes = MESES[Number(meta.mes.slice(5, 7)) - 1] ?? meta.mes;
  const faltam = Math.max(0, meta.metaVendas - meta.vendas);
  const restantes = Math.max(0, meta.diasNoMes - meta.diasCorridos);
  const fracao = meta.metaValor && meta.metaValor > 0 ? Math.min(1, meta.valor / meta.metaValor) : r.fracao;
  const estado = r.estado === "batida" ? "meta batida" : r.estado === "no_ritmo" ? "no ritmo" : "abaixo do ritmo";

  return (
    <Bloco className={cn("flex flex-col", className)} aria-label={`Meta de ${mes}`}>
      <CabecalhoBloco titulo={`Meta de ${mes}`} direita={<span className={cn("text-[11px] font-semibold", r.estado === "abaixo" ? "text-danger-ink" : "text-success-ink")}>{estado}</span>} />
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[22px] font-semibold leading-none tracking-tight tabular-nums text-foreground">{fmtMoeda(meta.valor)}</span>
        <span className="text-[11.5px] text-muted-foreground tabular-nums">{meta.metaValor != null ? `de ${fmtMoeda(meta.metaValor)}` : `alvo ${fmtInt(meta.metaVendas)} vendas`}</span>
      </div>
      <div className="relative mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(fracao * 100)}% do alvo; esperado até hoje ${Math.round(r.fracaoTempo * 100)}%`}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${fracao * 100}%` }} />
        <div aria-hidden className="absolute inset-y-[-3px] w-px bg-foreground/60" style={{ left: `${Math.min(100, r.fracaoTempo * 100)}%` }} />
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground tabular-nums">
        <b className="font-semibold text-foreground">{fmtInt(meta.vendas)}</b> de {fmtInt(meta.metaVendas)} vendas · dia {meta.diasCorridos}/{meta.diasNoMes}
        {faltam > 0 && r.ritmoNecessario != null ? (
          <>
            {" "}
            · faltam <b className="font-semibold text-foreground">{fmtInt(faltam)}</b> em {restantes} d
          </>
        ) : null}
      </p>
    </Bloco>
  );
}
