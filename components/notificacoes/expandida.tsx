"use client";

import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  agruparPorDia,
  contarNaoLidas,
  filtrar,
  type Filtro,
  type Notificacao,
} from "@/lib/notificacoes";
import { marcarTodasLidas } from "@/app/(app)/notificacoes/actions";
import { ItemNotificacao } from "./item";

/**
 * VISÃO EXPANDIDA (/notificacoes) — estado (c) do mockup notificacoes-sino-v3.html:
 * mesma lista do popover, sem corte, com filtro por tipo e agrupamento por dia.
 * A rota é nova: o item "Notificações" da sub-nav de Configurações é outra coisa (preferências).
 */
const FILTROS: { chave: Filtro; rotulo: string; contar?: boolean }[] = [
  { chave: "todas", rotulo: "Todas" },
  { chave: "nao_lidas", rotulo: "Não lidas", contar: true },
  { chave: "mencoes", rotulo: "Menções" },
  { chave: "tarefas", rotulo: "Tarefas" },
];

export function Expandida({ itens }: { itens: Notificacao[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [agoraMs, setAgoraMs] = useState(0);
  const [pendente, iniciar] = useTransition();

  useEffect(() => setAgoraMs(Date.now()), [itens]);

  const naoLidas = contarNaoLidas(itens);
  const grupos = agruparPorDia(filtrar(itens, filtro), agoraMs || Date.now());

  return (
    <div className="min-h-screen bg-branco">
      <div className="px-6 pt-5">
        <h1 className="text-[20px] font-[650] tracking-[-0.01em] text-tinta">Notificações</h1>
        <p className="mt-[5px] text-[13.5px] text-suave">
          Menções em notas e tarefas atribuídas a você.
        </p>
      </div>

      {/* no estreito a régua de filtros rola dentro de si — a página nunca rola na horizontal */}
      <div
        className="mt-4 flex items-center gap-0.5 overflow-x-auto border-b border-linha px-6"
        role="tablist"
      >
        {FILTROS.map((f) => (
          <button
            key={f.chave}
            role="tab"
            aria-selected={filtro === f.chave}
            onClick={() => setFiltro(f.chave)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-[7px] whitespace-nowrap border-b-2 border-transparent px-2.5 py-2 text-[13px] font-medium text-suave hover:text-tinta",
              filtro === f.chave && "border-navy font-[650] text-navy",
            )}
          >
            {f.rotulo}
            {f.contar && naoLidas > 0 && (
              <span className="rounded-full border border-linha bg-board px-1.5 font-mono text-[10.5px] tabular-nums text-suave">
                {naoLidas}
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          disabled={pendente || naoLidas === 0}
          onClick={() => iniciar(() => void marcarTodasLidas())}
          className="ml-auto shrink-0 whitespace-nowrap rounded-[6px] px-2 py-[5px] text-[12.5px] font-medium text-suave hover:bg-hover hover:text-tinta disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Marcar todas como lidas
        </button>
      </div>

      {grupos.length === 0 ? (
        <p className="px-6 py-12 text-[13.5px] text-suave">
          {filtro === "todas"
            ? "Nada por aqui. Quando alguém mencionar você numa nota ou atribuir uma tarefa, aparece nesta lista."
            : "Nenhuma notificação neste filtro."}
        </p>
      ) : (
        grupos.map((g) => (
          <div key={g.titulo}>
            <div className="px-6 pb-[7px] pt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
              {g.titulo}
            </div>
            {g.itens.map((n) => (
              <ItemNotificacao key={n.id} n={n} agoraMs={agoraMs || Date.now()} expandido />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
