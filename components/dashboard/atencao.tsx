import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import type { Atencao, ItemAtencao, TipoAtencao } from "@/lib/dados/dashboard-dono-calculos";
import { fmtInt } from "@/lib/dados/dashboard-ceo-calculos";
import { cn } from "@/lib/utils";
import { Bloco, CabecalhoBloco } from "./pecas";

/**
 * "Precisa de atenção" — o card de insight da coluna direita. Lista VIVA (o estado de agora, não do
 * período); cada linha é um link para a tela onde a coisa se resolve, já filtrada. Ordem: gravidade,
 * depois quantidade. Vazio honesto: "nada pendente" só quando TODAS as leituras responderam.
 */

const ROTULO_TIPO: Record<TipoAtencao, string> = {
  sem_resposta: "conversas",
  tarefas_vencidas: "tarefas",
  leads_parados: "funil",
  canal: "canais",
  propostas_jarvis: "fila do Jarvis",
};

function Linha({ item }: { item: ItemAtencao }) {
  return (
    <li>
      <Link href={item.href} className="group -mx-2 flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
        <span aria-hidden className={cn("mt-[6px] size-1.5 shrink-0 rounded-full", item.gravidade === "alta" ? "bg-danger-ink" : item.gravidade === "media" ? "bg-foreground" : "bg-muted-foreground/50")} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[12.5px] font-semibold text-foreground">{item.titulo}</span>
          {item.detalhe ? <span className="text-[11.5px] text-muted-foreground">{item.detalhe}</span> : null}
          {item.quebra.length > 0 ? (
            <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
              {item.quebra.map((q) => (
                <span key={q.rotulo}>
                  {q.rotulo} <b className="font-semibold text-foreground">{q.valor}</b>
                </span>
              ))}
            </span>
          ) : null}
        </span>
        <ChevronRightIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export function PrecisaDeAtencao({ atencao, className }: { atencao: Atencao; className?: string }) {
  const total = atencao.itens.reduce((s, i) => s + i.quantidade, 0);
  const semLeitura = atencao.indisponiveis.map((t) => ROTULO_TIPO[t]);
  return (
    <Bloco className={className}>
      <CabecalhoBloco titulo="Precisa de atenção" descricao="Agora, não no período. Cada linha abre a tela onde se resolve." direita={total > 0 ? <span className="text-[11px] text-muted-foreground tabular-nums">{fmtInt(total)} itens</span> : null} />
      {atencao.itens.length === 0 ? (
        <p className="mt-4 text-[12.5px] text-muted-foreground">{semLeitura.length > 0 ? "Nada pendente no que foi lido." : "Nada pendente: sem conversa esperando, tarefa vencida, lead estourado ou proposta parada."}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border/70">
          {atencao.itens.map((item) => (
            <Linha key={item.tipo} item={item} />
          ))}
        </ul>
      )}
      {semLeitura.length > 0 ? <p className="mt-3 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">Sem leitura de {semLeitura.join(", ")}.</p> : null}
    </Bloco>
  );
}
