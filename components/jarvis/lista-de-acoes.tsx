import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LISTA DE AÇÕES COM ESTADO (W-J, 10/09/2026 23:10 — a partir do print do 21st.dev que o Diogo
 * mandou). Cada linha: um anel de estado à esquerda, o título, e à direita um selo discreto em
 * texto; subitens aninhados com uma linha vertical fina.
 *
 *   feito      ✓ dentro de um círculo cheio (`success-ink`), título riscado e muted
 *   andamento  anel PONTILHADO (`foreground`), título em foreground
 *   pendente   círculo vazio, hairline (`muted-foreground/50`), título muted
 *   atencao    "!" num anel âmbar (`warning-ink`), título em foreground
 *
 * Só tokens semânticos (claro e escuro): `foreground`, `muted-foreground`, `border`,
 * `success-ink`, `warning-ink`. Sem fundo, sem borda externa — a lista vive dentro do bloco que a
 * chama ("Jarvis diz", a resposta do /jarvis, "Precisa de atenção" do dashboard, o percurso
 * "Começar as tarefas" de /tarefas).
 */

export type EstadoAcao = "feito" | "andamento" | "pendente" | "atencao";

export interface ItemAcao {
  id: string;
  titulo: string;
  estado: EstadoAcao;
  /** texto discreto à direita: "em andamento", "pendente", "2 de 5", "Sara" */
  badge?: string | null;
  href?: string | null;
  /** segunda linha, muted, opcional */
  detalhe?: string | null;
  filhos?: ItemAcao[];
}

export function Anel({ estado, className }: { estado: EstadoAcao; className?: string }) {
  const base = "grid size-4 shrink-0 place-items-center rounded-full";
  if (estado === "feito") {
    return (
      <span aria-hidden className={cn(base, "bg-success-ink text-success-foreground", className)}>
        <CheckIcon className="size-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (estado === "andamento") {
    return <span aria-hidden className={cn(base, "border-[1.5px] border-dashed border-foreground", className)} />;
  }
  if (estado === "atencao") {
    return (
      <span aria-hidden className={cn(base, "border-[1.5px] border-warning-ink text-[10px] font-semibold leading-none text-warning-ink", className)}>
        !
      </span>
    );
  }
  return <span aria-hidden className={cn(base, "border-[1.5px] border-muted-foreground/50", className)} />;
}

const ROTULO_ESTADO: Record<EstadoAcao, string> = {
  feito: "feito",
  andamento: "em andamento",
  pendente: "pendente",
  atencao: "atenção",
};

function Linha({ item, nivel }: { item: ItemAcao; nivel: number }) {
  const feito = item.estado === "feito";
  const pendente = item.estado === "pendente";
  const titulo = (
    <span
      className={cn(
        "min-w-0 flex-1 leading-snug",
        nivel === 0 ? "text-[14px]" : "text-[13px]",
        feito && "text-muted-foreground line-through decoration-muted-foreground/60",
        pendente && "text-muted-foreground",
        !feito && !pendente && "text-foreground",
      )}
    >
      {item.titulo}
    </span>
  );
  return (
    <li>
      <div className="flex items-start gap-2.5 py-1">
        <Anel estado={item.estado} className="mt-[3px]" />
        {item.href ? (
          <Link href={item.href} className="min-w-0 flex-1 underline-offset-[3px] hover:underline">
            {titulo}
          </Link>
        ) : (
          titulo
        )}
        <span className="shrink-0 pt-px text-[11.5px] text-muted-foreground" aria-label={`estado: ${ROTULO_ESTADO[item.estado]}`}>
          {item.badge ?? (item.estado === "andamento" || item.estado === "pendente" ? ROTULO_ESTADO[item.estado] : "")}
        </span>
      </div>
      {item.detalhe && <p className="-mt-0.5 mb-1 pl-[26px] text-[12.5px] leading-normal text-muted-foreground">{item.detalhe}</p>}
      {item.filhos && item.filhos.length > 0 && (
        <ul className="ml-[7px] border-l border-border pl-[18px]">
          {item.filhos.map((f) => (
            <Linha key={f.id} item={f} nivel={nivel + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ListaDeAcoes({ itens, className, rotulo }: { itens: ItemAcao[]; className?: string; rotulo?: string }) {
  if (itens.length === 0) return null;
  return (
    <ul className={cn("m-0 list-none p-0", className)} aria-label={rotulo}>
      {itens.map((i) => (
        <Linha key={i.id} item={i} nivel={0} />
      ))}
    </ul>
  );
}
