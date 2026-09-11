import Link from "next/link";
import { BellRingIcon, ChevronRightIcon } from "lucide-react";
import type { Atencao, ItemAtencao, TipoAtencao } from "@/lib/dados/dashboard-dono-calculos";
import { fmtInt } from "@/lib/dados/dashboard-ceo-calculos";
import { cn } from "@/lib/utils";
import { SecaoTabela } from "./relatorio";

/**
 * "Precisa de atenção" — a resposta à primeira metade da pergunta das 8h. É uma lista VIVA (o
 * estado de agora, não do período) e cada linha é um link para a tela onde a coisa se resolve, já
 * filtrada. A ordem é por gravidade e depois por quantidade: o que grita primeiro vem primeiro.
 *
 * Vazio honesto: "nada pendente" só é dito quando TODAS as leituras responderam. Leitura que não
 * veio aparece nomeada no rodapé — "sem leitura de canais" — para ninguém confundir silêncio com
 * paz.
 */

const ROTULO_TIPO: Record<TipoAtencao, string> = {
  sem_resposta: "conversas",
  tarefas_vencidas: "tarefas",
  leads_parados: "funil",
  canal: "canais",
  propostas_jarvis: "fila do Jarvis",
};

function PontoGravidade({ g }: { g: ItemAtencao["gravidade"] }) {
  return (
    <span
      aria-hidden
      className={cn("mt-[7px] size-2 shrink-0 rounded-full", g === "alta" ? "bg-danger-ink" : g === "media" ? "bg-warning-ink" : "bg-muted-foreground/40")}
    />
  );
}

function Linha({ item }: { item: ItemAtencao }) {
  return (
    <li className="group">
      <Link
        href={item.href}
        className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <PontoGravidade g={item.gravidade} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-ui-13 font-medium text-foreground">{item.titulo}</span>
          {item.detalhe ? <span className="text-ui-12 text-muted-foreground">{item.detalhe}</span> : null}
          {item.quebra.length > 0 ? (
            <span className="mt-0.5 flex flex-wrap gap-1.5">
              {item.quebra.map((q) => (
                <span key={q.rotulo} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-px text-ui-11 text-muted-foreground">
                  <span className="truncate">{q.rotulo}</span>
                  <span className="font-medium text-foreground tabular-nums">{q.valor}</span>
                </span>
              ))}
            </span>
          ) : null}
        </span>
        <ChevronRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

export function PrecisaDeAtencao({ atencao, className }: { atencao: Atencao; className?: string }) {
  const total = atencao.itens.reduce((s, i) => s + i.quantidade, 0);
  const semLeitura = atencao.indisponiveis.map((t) => ROTULO_TIPO[t]);
  return (
    <SecaoTabela
      titulo="Precisa de atenção"
      descricao="Agora, não no período. Cada linha abre a tela onde se resolve."
      icone={BellRingIcon}
      meta={atencao.itens.length > 0 ? `${fmtInt(total)} ${total === 1 ? "item" : "itens"}` : undefined}
      dica="Cinco leituras, todas do estado de agora: conversas do cliente sem resposta nossa há mais de 2 h, tarefas pendentes com prazo passado, leads parados além do prazo da etapa (a mesma régua que pinta o funil), números desconectados ou lentos, e propostas de agente esperando decisão humana."
      rodape="A ordem é por gravidade e depois por quantidade. Leitura que não respondeu aparece nomeada no rodapé — silêncio não é paz."
      className={className}
    >
      {atencao.itens.length === 0 ? (
        <div className="px-2 py-6 text-center">
          <p className="text-ui-13 font-medium text-foreground">{semLeitura.length > 0 ? "Nada pendente no que foi lido" : "Nada pendente agora"}</p>
          <p className="mt-1 text-ui-12 text-muted-foreground">Sem conversa esperando, tarefa vencida, lead estourado ou proposta parada.</p>
        </div>
      ) : (
        <ul className="-mx-2 flex flex-col divide-y divide-border/70">
          {atencao.itens.map((item) => (
            <Linha key={item.tipo} item={item} />
          ))}
        </ul>
      )}
      {semLeitura.length > 0 ? (
        <p className="mt-3 border-t border-border/70 pt-2.5 text-ui-11 text-muted-foreground">Sem leitura de {semLeitura.join(", ")}.</p>
      ) : null}
    </SecaoTabela>
  );
}
