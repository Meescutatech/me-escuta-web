import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import type { Atencao, TipoAtencao } from "@/lib/dados/dashboard-dono-calculos";
import { fmtInt } from "@/lib/dados/dashboard-ceo-calculos";
import { cn } from "@/lib/utils";
import { Bloco } from "./pecas";

const ROTULO_TIPO: Record<TipoAtencao, string> = { sem_resposta: "conversas", tarefas_vencidas: "tarefas", leads_parados: "funil", canal: "canais", propostas_jarvis: "fila do Jarvis" };

/** "Precisa de atenção" como lista compacta lateral: linhas de 28px, sem descrição, cada uma um link. */
export function PrecisaDeAtencao({ atencao, className }: { atencao: Atencao; className?: string }) {
  const semLeitura = atencao.indisponiveis.map((t) => ROTULO_TIPO[t]);
  return (
    <Bloco denso className={cn("flex flex-col", className)}>
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <h2 className="text-[13px] font-semibold text-foreground">Precisa de atenção</h2>
        <span className="text-[11px] text-muted-foreground tabular-nums">agora</span>
      </div>
      {atencao.itens.length === 0 ? (
        <p className="px-3 pb-3 text-[12px] text-muted-foreground">{semLeitura.length > 0 ? "Nada pendente no que foi lido." : "Nada pendente."}</p>
      ) : (
        <ul className="divide-y divide-border/70 border-t border-border/70">
          {atencao.itens.map((i) => (
            <li key={i.tipo}>
              <Link href={i.href} className="group flex h-7 items-center gap-2 px-3 text-[12.5px] hover:bg-muted/60">
                <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", i.gravidade === "alta" ? "bg-danger-ink" : i.gravidade === "media" ? "bg-foreground" : "bg-muted-foreground/40")} />
                <span className="min-w-0 flex-1 truncate text-foreground">{i.titulo.replace(/^\d+\s/, "")}</span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">{fmtInt(i.quantidade)}</span>
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {semLeitura.length > 0 ? <p className="border-t border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground">sem leitura de {semLeitura.join(", ")}</p> : null}
    </Bloco>
  );
}
