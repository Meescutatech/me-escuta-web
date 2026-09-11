import Link from "next/link";
import { ABAS, montarHref, type Aba, type DepartamentoFiltro } from "@/lib/dados/dashboard-dono-calculos";
import type { PeriodoDias } from "@/lib/dados/dashboard-ceo-calculos";
import { cn } from "@/lib/utils";

/**
 * A faixa de abas do dashboard — LINKS, não estado de cliente: a aba mora na URL (`?aba=`) e é o
 * servidor que decide o que ler (a aba Marketing só é lida quando aberta — abrir o dashboard não
 * paga por um agregado que ninguém pediu, o mesmo desenho do relatório do LiderHub).
 *
 * Desenho da variante `line` do `Tabs` de components/ui, sem o componente: o sublinhado é um
 * `border-b-2` no próprio link, e nada no meio para deslocá-lo em 1px.
 */
export function AbasDashboard({
  aba,
  periodo,
  ator,
  departamento,
  ocultar = [],
}: {
  aba: Aba;
  periodo: PeriodoDias;
  ator: string | null;
  departamento: DepartamentoFiltro;
  /** abas que este papel não vê (marketing para membro) */
  ocultar?: Aba[];
}) {
  return (
    <nav aria-label="Seções do dashboard" className="flex w-full items-end gap-1 border-b border-border">
      {ABAS.filter((a) => !ocultar.includes(a.chave)).map((a) => {
        const ativa = a.chave === aba;
        return (
          <Link
            key={a.chave}
            href={montarHref({ periodo, ator, aba: a.chave, departamento })}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex h-9 items-center border-b-2 px-3 text-ui-13 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              ativa ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {a.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
