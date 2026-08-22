import { cn } from "@/lib/utils";

/**
 * A ASSINATURA DA TELA DO MARKETING - e ela sai do requisito, nao do gosto.
 *
 * Todo numero desta tela nasce de uma populacao que foi PARTIDA em baldes, e a D21 existe
 * para que o pedaco nao-casado fique visivel em vez de diluido na soma. Um tile solto com
 * "1.240 leads" nao consegue dizer isso: some com os 89 que nao casaram, e some com o fato
 * de eles existirem.
 *
 * Entao a forma e uma barra proporcional com os segmentos NOMEADOS embaixo, e a soma dos
 * segmentos e a largura inteira. Quem olha 3 segundos ve o todo e ve o buraco; quem olha 10
 * le o nome do buraco. Nao ha versao desta tela em que o nao-casado precise de um clique.
 *
 * Server-safe: sem estado, sem efeito. Os tons vem dos tokens R9, sem cor nova:
 *   `ok`      laranja  - o acento da casa, reservado ao que casou;
 *   `alt`     azul-graf- a SEGUNDA categoria real, quando a barra existe para COMPARAR duas
 *                        (Meta x Google). Sem ele as duas saem laranja e a barra nao responde a
 *                        propria pergunta - defeito visto na primeira tela renderizada. O par
 *                        laranja/azul-graf e o mesmo ja validado pela bateria CVD no painel R19;
 *   `buraco`  ambar    - "algo nao esta de pe" (o token ja significa isso no app);
 *   `neutro`  cinza-az - ausencia legitima: nao e defeito, e tambem nao e sucesso;
 *   `morto`   hairline - contado e sem cor propria (ex.: fora do recorte).
 */
export type TomSegmento = "ok" | "alt" | "buraco" | "neutro" | "morto";

export interface Segmento {
  rotulo: string;
  valor: number;
  tom: TomSegmento;
  /** Uma frase dizendo o que este balde e. Vira o `title` e a legenda longa. */
  porque?: string;
}

const FUNDOS: Record<TomSegmento, string> = {
  ok: "bg-laranja",
  alt: "bg-azul-graf",
  buraco: "bg-amarelo",
  neutro: "bg-navy",
  morto: "bg-linha-forte",
};

export function BarraPopulacao({
  titulo,
  segmentos,
  formatar = (v: number) => v.toLocaleString("pt-BR"),
  vazioDiz,
}: {
  titulo: string;
  segmentos: Segmento[];
  formatar?: (v: number) => string;
  /** O que dizer quando o total e zero. Barra de largura zero nao existe - a frase existe. */
  vazioDiz: string;
}) {
  const comValor = segmentos.filter((s) => s.valor > 0);
  const total = comValor.reduce((s, x) => s + x.valor, 0);

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[12.5px] font-semibold uppercase tracking-[0.05em] text-suave">{titulo}</h3>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-tinta">
          {total > 0 ? formatar(total) : ""}
        </span>
      </div>

      {total === 0 ? (
        <p className="rounded-[7px] border border-dashed border-linha-forte px-3 py-2.5 text-[12.5px] text-suave">
          {vazioDiz}
        </p>
      ) : (
        <>
          <div className="flex h-2.5 gap-[2px] overflow-hidden" role="img" aria-label={titulo}>
            {comValor.map((s) => (
              <span
                key={s.rotulo}
                title={`${s.rotulo}: ${formatar(s.valor)}${s.porque ? ` — ${s.porque}` : ""}`}
                className={cn("h-full rounded-[2px]", FUNDOS[s.tom])}
                // minimo de 1,5%: um balde de 1 em 5.000 tem de continuar VISIVEL, senao a
                // barra passa a esconder exatamente o caso raro que ela existe para mostrar.
                style={{ width: `${Math.max(1.5, (s.valor / total) * 100)}%` }}
              />
            ))}
          </div>
          <ul className="mt-2.5 space-y-1">
            {comValor.map((s) => (
              <li key={s.rotulo} className="flex items-baseline gap-2 text-[12.5px]">
                <span className={cn("mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full", FUNDOS[s.tom])} aria-hidden />
                <span className="text-tinta">{s.rotulo}</span>
                {s.porque && <span className="hidden text-[11.5px] text-mute sm:inline">{s.porque}</span>}
                <span className="ml-auto font-mono tabular-nums text-tinta">{formatar(s.valor)}</span>
                <span className="w-11 text-right font-mono text-[11px] tabular-nums text-mute">
                  {((s.valor / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
