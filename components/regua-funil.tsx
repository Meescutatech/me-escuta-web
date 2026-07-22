import type { SegmentoRegua } from "@/lib/dados/funil-calculos";
import { cn } from "@/lib/utils";

/*
 * Régua do funil — assinatura visual R9 (r9-tokens §4): barra segmentada, 1 segmento por
 * etapa aberta, 3px de altura, raio 2, gap 2. Preenchidas = laranja .55 · atual = laranja-esc
 * · futuras/vazias = hairline. Aparece nas 3 telas; server-safe (sem estado).
 */
export function ReguaFunil({ segmentos, rotulo }: { segmentos: SegmentoRegua[]; rotulo?: string }) {
  if (segmentos.length === 0) return null;
  return (
    <div className="flex gap-[2px]" role="img" aria-label={rotulo ?? "Progresso no funil"}>
      {segmentos.map((s, i) => (
        <span
          key={i}
          className={cn(
            "h-[3px] flex-1 rounded-[2px]",
            s === "ok" && "bg-laranja opacity-55",
            s === "atual" && "bg-laranja-esc",
            (s === "futura" || s === "fraca") && "bg-linha",
          )}
        />
      ))}
    </div>
  );
}
