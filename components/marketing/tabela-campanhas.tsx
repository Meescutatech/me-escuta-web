import Link from "next/link";
import { brl, inteiro, ROTULO_PLATAFORMA, type EstadoCusto, type LinhaCampanha } from "@/lib/dados/marketing-calculos";
import { corDe } from "./marcas";
import { TEXTO_SEM_CUSTO, Vazio } from "./vazio";

/** CPL por campanha: gasto ÷ leads, ordenado por gasto. Sem custo ingerido, a coluna e "—". */
export function TabelaCampanhas({ linhas, estadoCusto }: { linhas: LinhaCampanha[]; estadoCusto: EstadoCusto }) {
  if (linhas.length === 0) return <Vazio texto="Nenhuma campanha com lead ou gasto neste periodo." />;
  const maxCpl = Math.max(0, ...linhas.map((l) => l.cpl ?? 0));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-linha text-ui-11 font-medium text-muted-foreground">
            <th className="pb-2 text-left font-medium">Campanha</th>
            <th className="pb-2 text-right font-medium">Leads</th>
            <th className="pb-2 text-right font-medium">Investido</th>
            <th className="pb-2 pl-4 text-left font-medium">CPL</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const cor = corDe("pago", l.plataforma);
            return (
              <tr key={`${l.plataforma}-${l.campanhaId}`} className="border-b border-linha/70 last:border-0">
                <td className="max-w-[320px] py-2 pr-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: cor }} aria-hidden />
                    <span className="truncate font-medium text-tinta">{l.rotulo}</span>
                    <span className="shrink-0 text-[11px] text-mute">{ROTULO_PLATAFORMA[l.plataforma]}</span>
                  </span>
                  {l.cidades.length > 0 && <span className="block truncate pl-[17px] text-[11px] text-mute">{l.cidades.join(" · ")}</span>}
                </td>
                <td className="py-2 text-right tabular-nums text-tinta">{inteiro(l.leads)}</td>
                <td className="py-2 text-right tabular-nums text-tinta">{brl(l.gasto)}</td>
                <td className="py-2 pl-4">
                  {l.cpl != null ? (
                    <span className="flex items-center gap-2">
                      <span className="w-16 tabular-nums text-tinta">{brl(l.cpl)}</span>
                      <span className="h-[6px] w-[72px] overflow-hidden rounded-[2px] bg-fundo" aria-hidden>
                        <span className="block h-full rounded-[2px]" style={{ width: `${maxCpl > 0 ? (l.cpl / maxCpl) * 100 : 0}%`, background: cor }} />
                      </span>
                    </span>
                  ) : l.gasto != null && l.leads === 0 ? (
                    <span className="text-[11.5px] text-amarelo">gasto sem lead</span>
                  ) : (
                    <span className="text-mute">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {estadoCusto === "sem_ingestao" && (
        <p className="mt-2.5 text-[12px] text-suave">
          {TEXTO_SEM_CUSTO}{" "}
          <Link href="/configuracoes" className="font-medium text-navy underline-offset-2 hover:underline">
            Configuracoes
          </Link>
        </p>
      )}
    </div>
  );
}
