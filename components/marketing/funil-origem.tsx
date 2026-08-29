import {
  inteiro,
  MARCOS,
  pct,
  ROTULO_MARCO,
  type LinhaFunilOrigem,
  type MarcosResolvidos,
} from "@/lib/dados/marketing-calculos";
import { corDe } from "./marcas";
import { Vazio } from "./vazio";

/**
 * Funil por origem: de cada origem, quantos chegaram a Qualificado / Consulta / Venda.
 * Le a etapa ATUAL do lead (quem esta em Proposta ja passou por Qualificado). A barra de
 * cada celula e a fracao dos leads da origem — a mesma escala em todas as linhas.
 */

export function FunilOrigem({ linhas, marcos }: { linhas: LinhaFunilOrigem[]; marcos: MarcosResolvidos }) {
  if (linhas.length === 0) return <Vazio texto="Nenhum lead com origem neste periodo." />;
  const marcosAtivos = MARCOS.filter((m) => marcos.ordem[m] != null);
  const faltando = MARCOS.filter((m) => marcos.ordem[m] == null);
  const temPerdidos = linhas.some((l) => l.perdidos > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-linha font-mono text-[10px] uppercase tracking-[0.04em] text-mute">
            <th className="pb-1.5 text-left font-normal">Origem</th>
            <th className="pb-1.5 text-right font-normal">Leads</th>
            {marcosAtivos.map((m) => (
              <th key={m} className="pb-1.5 pl-4 text-left font-normal" title={`Etapa: ${marcos.nome[m] ?? ""}`}>
                {marcos.nome[m] ?? ROTULO_MARCO[m]}
              </th>
            ))}
            {temPerdidos && <th className="pb-1.5 text-right font-normal">Perdidos</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const cor = corDe(l.balde, l.plataforma);
            return (
              <tr key={l.chave} className="border-b border-linha/70 last:border-0">
                <td className="py-2 pr-2">
                  <span className="flex items-center gap-2">
                    <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: cor }} aria-hidden />
                    <span className="font-medium text-tinta">{l.rotulo}</span>
                  </span>
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-tinta">{inteiro(l.leads)}</td>
                {marcosAtivos.map((m) => {
                  const v = l.marcos[m];
                  const t = l.taxas[m];
                  return (
                    <td key={m} className="py-2 pl-4">
                      <div className="flex items-center gap-2">
                        <span className="w-8 text-right font-mono tabular-nums text-tinta">{inteiro(v)}</span>
                        <span className="h-[6px] w-[64px] overflow-hidden rounded-[2px] bg-fundo" aria-hidden>
                          <span className="block h-full rounded-[2px]" style={{ width: `${t == null ? 0 : Math.max(t > 0 ? 2 : 0, t * 100)}%`, background: cor }} />
                        </span>
                        <span className="w-9 font-mono text-[11px] tabular-nums text-mute">{pct(t)}</span>
                      </div>
                    </td>
                  );
                })}
                {temPerdidos && <td className="py-2 text-right font-mono tabular-nums text-suave">{inteiro(l.perdidos)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {faltando.length > 0 && (
        <p className="mt-2 text-[11.5px] text-mute">
          O funil vigente nao tem etapa de {faltando.map((m) => ROTULO_MARCO[m].toLowerCase()).join(" nem ")}.
        </p>
      )}
    </div>
  );
}
