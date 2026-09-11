"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { CheckCircle2, Circle, CircleAlert, CircleDotDashed, CircleX, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMovimento } from "./movimento";

/**
 * LISTA DE AÇÕES COM ESTADO — v2 com movimento (W-J, 10/09/2026 23:35), a partir da referência
 * "agent-plan" do 21st.dev. Cada linha: ícone de estado à esquerda (troca com scale/rotate), o
 * título, e à direita o selo de estado em texto muted (pulsa quando muda); subitens aninhados
 * atrás de uma LINHA VERTICAL TRACEJADA alinhada ao ícone; subitem expansível mostra `detalhe`
 * em 12px muted.
 *
 *   feito      CheckCircle2   `success-ink`      título riscado, muted
 *   andamento  CircleDotDashed `primary`
 *   pendente   Circle          `muted-foreground`
 *   atencao    CircleAlert     `warning-ink`
 *   falhou     CircleX         `destructive`
 *
 * SEM LAYOUT SHIFT: expand/recolher anima `height: 0 → auto` com `overflow` controlado e os
 * filhos entram em stagger; `layout` em `LayoutGroup` acomoda os vizinhos; `prefers-reduced-motion`
 * vira tween curto sem deslocamento (`useMovimento`). Só tokens semânticos — claro e escuro.
 */

export type EstadoAcao = "feito" | "andamento" | "pendente" | "atencao" | "falhou";

export interface ItemAcao {
  id: string;
  titulo: string;
  estado: EstadoAcao;
  /** texto discreto à direita: "em andamento", "2 de 5", "Sara", "09:12" */
  badge?: string | null;
  href?: string | null;
  /** aparece quando o item está aberto — 12px muted */
  detalhe?: string | null;
  filhos?: ItemAcao[];
  /** começa aberto (padrão: aberto se `andamento`) */
  aberto?: boolean;
}

const ICONE: Record<EstadoAcao, { Icone: typeof Circle; cor: string; rotulo: string }> = {
  feito: { Icone: CheckCircle2, cor: "text-success-ink", rotulo: "feito" },
  andamento: { Icone: CircleDotDashed, cor: "text-primary", rotulo: "em andamento" },
  pendente: { Icone: Circle, cor: "text-muted-foreground", rotulo: "pendente" },
  atencao: { Icone: CircleAlert, cor: "text-warning-ink", rotulo: "atenção" },
  falhou: { Icone: CircleX, cor: "text-destructive", rotulo: "falhou" },
};

export function IconeEstado({ estado, className }: { estado: EstadoAcao; className?: string }) {
  const { icone } = useMovimento();
  const { Icone, cor } = ICONE[estado];
  return (
    <span className={cn("relative grid size-4 shrink-0 place-items-center", className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={estado} className="grid place-items-center" {...icone}>
          <Icone className={cn("size-4", cor)} strokeWidth={estado === "feito" ? 2 : 1.75} aria-hidden />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Selo({ estado, texto }: { estado: EstadoAcao; texto: string | null | undefined }) {
  const { selo } = useMovimento();
  const t = texto ?? (estado === "andamento" || estado === "pendente" ? ICONE[estado].rotulo : "");
  if (!t) return null;
  return (
    <motion.span key={`${estado}-${t}`} {...selo} className="shrink-0 pt-px text-[11.5px] text-muted-foreground" aria-label={`estado: ${ICONE[estado].rotulo}`}>
      {t}
    </motion.span>
  );
}

function Linha({ item, nivel }: { item: ItemAcao; nivel: number }) {
  const mov = useMovimento();
  const expansivel = (item.filhos?.length ?? 0) > 0 || Boolean(item.detalhe);
  const [aberto, setAberto] = useState<boolean>(item.aberto ?? item.estado === "andamento");
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
    <motion.li layout="position" transition={mov.layout} variants={mov.item} className="relative">
      <div
        className={cn("group flex items-start gap-2.5 rounded-sm py-1", expansivel && "cursor-pointer")}
        onClick={expansivel ? () => setAberto((v) => !v) : undefined}
        role={expansivel ? "button" : undefined}
        aria-expanded={expansivel ? aberto : undefined}
        tabIndex={expansivel ? 0 : undefined}
        onKeyDown={
          expansivel
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setAberto((v) => !v);
                }
              }
            : undefined
        }
      >
        <IconeEstado estado={item.estado} className="mt-[2px]" />
        {item.href ? (
          <Link href={item.href} onClick={(e) => e.stopPropagation()} className="min-w-0 flex-1 underline-offset-[3px] hover:underline">
            {titulo}
          </Link>
        ) : (
          titulo
        )}
        <Selo estado={item.estado} texto={item.badge} />
        {expansivel && (
          <motion.span
            aria-hidden
            animate={{ rotate: aberto ? 180 : 0 }}
            transition={mov.layout}
            className="mt-[3px] shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground"
          >
            <ChevronDownIcon className="size-3.5" />
          </motion.span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expansivel && aberto && (
          <motion.div key="corpo" variants={mov.abrir} initial="hidden" animate="visible" exit="exit" className="relative">
            {/* a linha tracejada, alinhada ao centro do ícone (16px de ícone → 8px) */}
            <span aria-hidden className="absolute bottom-1 left-[7.5px] top-0 border-l border-dashed border-muted-foreground/30" />
            {item.detalhe && (
              <motion.p variants={mov.item} className="mb-1 pl-[26px] text-[12px] leading-normal text-muted-foreground">
                {item.detalhe}
              </motion.p>
            )}
            {item.filhos && item.filhos.length > 0 && (
              <ul className="m-0 list-none p-0 pl-[26px]">
                {item.filhos.map((f) => (
                  <Linha key={f.id} item={f} nivel={nivel + 1} />
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function ListaDeAcoes({ itens, className, rotulo }: { itens: ItemAcao[]; className?: string; rotulo?: string }) {
  const mov = useMovimento();
  if (itens.length === 0) return null;
  return (
    <LayoutGroup>
      <motion.ul variants={mov.lista} initial="hidden" animate="visible" className={cn("m-0 list-none p-0", className)} aria-label={rotulo}>
        {itens.map((i) => (
          <Linha key={i.id} item={i} nivel={0} />
        ))}
      </motion.ul>
    </LayoutGroup>
  );
}

/** nome antigo (v1) — mantido para quem já importou */
export const Anel = IconeEstado;
