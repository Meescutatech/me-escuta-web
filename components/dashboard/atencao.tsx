import { ListaDeAcoes, type ItemAcao } from "@/components/jarvis/lista-de-acoes";
import type { Atencao, TipoAtencao } from "@/lib/dados/dashboard-dono-calculos";
import { fmtInt } from "@/lib/dados/dashboard-ceo-calculos";
import { cn } from "@/lib/utils";
import { Bloco, CabecalhoBloco } from "./pecas";

const ROTULO_TIPO: Record<TipoAtencao, string> = { sem_resposta: "conversas", tarefas_vencidas: "tarefas", leads_parados: "funil", canal: "canais", propostas_jarvis: "fila do Jarvis" };
const DESTINO: Record<TipoAtencao, string> = { sem_resposta: "conversas", tarefas_vencidas: "tarefas", leads_parados: "funil", canal: "canais", propostas_jarvis: "fila" };

/**
 * "Precisa de atenção" com a `ListaDeAcoes` do W-J (anel de estado, atenção em âmbar, href por
 * item). Os itens são os MESMOS que o resto da tela calcula — não a fixture estática de
 * `lib/ensaio/jarvis.ts` — para o número daqui bater com o KPI e com a tabela ao lado.
 */
export function PrecisaDeAtencao({ atencao, className }: { atencao: Atencao; className?: string }) {
  const semLeitura = atencao.indisponiveis.map((t) => ROTULO_TIPO[t]);
  const itens: ItemAcao[] = atencao.itens.map((i) => ({
    id: i.tipo,
    titulo: i.titulo,
    estado: i.gravidade === "baixa" ? "pendente" : "atencao",
    badge: DESTINO[i.tipo],
    href: i.href,
  }));
  const total = atencao.itens.reduce((s, i) => s + i.quantidade, 0);
  return (
    <Bloco className={cn("flex flex-col", className)}>
      <CabecalhoBloco titulo="Precisa de atenção" direita={total > 0 ? <span className="text-[11px] text-muted-foreground tabular-nums">{fmtInt(total)} agora</span> : null} />
      {itens.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-muted-foreground">{semLeitura.length > 0 ? "Nada pendente no que foi lido." : "Nada pendente."}</p>
      ) : (
        <ListaDeAcoes itens={itens} rotulo="Precisa de atenção" className="mt-1 [&_li>div>a>span]:!text-[12.5px] [&_li>div]:py-[3px]" />
      )}
      {semLeitura.length > 0 ? <p className="mt-2 border-t border-border/70 pt-1.5 text-[11px] text-muted-foreground">sem leitura de {semLeitura.join(", ")}</p> : null}
    </Bloco>
  );
}
