"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { DadosFunil, CardLead, EtapaFunil } from "@/lib/dados/funil";
import { moverCardEtapa } from "@/app/(app)/funil/actions";
import { CartaoLead } from "./card-lead";
import { DrawerCard } from "./drawer-card";
import { cn } from "@/lib/utils";

function somaValor(cards: CardLead[]): number {
  return cards.reduce((s, c) => s + (c.valor ?? 0), 0);
}

function Coluna({
  etapa,
  cards,
  agora,
  onAbrir,
}: {
  etapa: EtapaFunil;
  cards: CardLead[];
  agora: number;
  onAbrir: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${etapa.chave}` });
  const soma = somaValor(cards);
  return (
    <div className="flex h-full w-72 shrink-0 flex-col">
      <div className="flex items-center gap-2.5 px-1 pb-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: etapa.cor }} />
        <span className="text-sm font-semibold text-navy">{etapa.nome}</span>
        <span className="rounded-full border border-borda-forte bg-branco px-2 py-0.5 text-xs font-semibold text-suave">
          {cards.length}
        </span>
        {soma > 0 && (
          <span className="ml-auto font-mono text-xs text-mute">
            R$ {soma.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
          </span>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto rounded-lg p-1 pb-10 transition-colors",
          isOver && "bg-laranja-cl shadow-[inset_0_0_0_2px_#f4c4a8]",
        )}
      >
        {cards.map((c) => (
          <CartaoLead key={c.lead_id} card={c} corEtapa={etapa.cor} agora={agora} onAbrir={onAbrir} />
        ))}
        {cards.length === 0 && (
          <div className="m-1 rounded-lg border-[1.5px] border-dashed border-borda-forte px-3 py-6 text-center text-xs text-mute">
            Nenhum lead nesta etapa
          </div>
        )}
      </div>
    </div>
  );
}

export function Quadro({ dados }: { dados: DadosFunil }) {
  const [cards, setCards] = useState<CardLead[]>(dados.cards);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [cardAberto, setCardAberto] = useState<string | null>(null);
  const [agora, setAgora] = useState<number>(() => Date.now());
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const cardsFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) => (c.nome ?? "").toLowerCase().includes(q) || (c.telefone ?? "").toLowerCase().includes(q),
    );
  }, [cards, busca]);

  const porEtapa = useMemo(() => {
    const m = new Map<string, CardLead[]>();
    for (const e of dados.etapas) m.set(e.chave, []);
    for (const c of cardsFiltrados) {
      if (!m.has(c.etapa)) m.set(c.etapa, []);
      m.get(c.etapa)!.push(c);
    }
    return m;
  }, [cardsFiltrados, dados.etapas]);

  const totalNegociacao = useMemo(() => somaValor(cards), [cards]);
  const cardArrastado = cards.find((c) => c.lead_id === arrastando) ?? null;
  const etapaDoArrastado = dados.etapas.find((e) => e.chave === cardArrastado?.etapa);

  function onDragStart(ev: DragStartEvent) {
    setArrastando(String(ev.active.id).replace(/^card:/, ""));
  }

  async function onDragEnd(ev: DragEndEvent) {
    setArrastando(null);
    const { active, over } = ev;
    if (!over) return;

    const leadId = String(active.id).replace(/^card:/, "");
    const overId = String(over.id);
    const etapaAlvo = overId.startsWith("col:")
      ? overId.slice(4)
      : cards.find((c) => c.lead_id === overId.replace(/^card:/, ""))?.etapa;
    if (!etapaAlvo) return;

    const atual = cards.find((c) => c.lead_id === leadId);
    if (!atual || atual.etapa === etapaAlvo) return;

    const etapaDe = atual.etapa;
    setCards((prev) =>
      prev.map((c) =>
        c.lead_id === leadId ? { ...c, etapa: etapaAlvo, entrou_etapa_em: new Date().toISOString() } : c,
      ),
    );

    if (dados.fonte === "mock") return; // mock não persiste — move só visual

    const res = await moverCardEtapa(leadId, etapaDe, etapaAlvo);
    if (!res.ok) {
      setCards((prev) =>
        prev.map((c) =>
          c.lead_id === leadId ? { ...c, etapa: etapaDe, entrou_etapa_em: atual.entrou_etapa_em } : c,
        ),
      );
      setAviso(`Não foi possível mover: ${res.motivo ?? "erro"}`);
      setTimeout(() => setAviso(null), 5000);
    }
  }

  const leadAberto = cards.find((c) => c.lead_id === cardAberto) ?? null;
  const etapaAberta = dados.etapas.find((e) => e.chave === leadAberto?.etapa) ?? null;

  return (
    <div className="flex h-[calc(100vh-58px)] flex-col">
      {/* toolbar do funil */}
      <div className="flex flex-shrink-0 items-center gap-4 border-b border-borda bg-branco px-6 py-3">
        <div>
          <h1 className="font-serif text-xl font-semibold leading-none text-navy">Funil de vendas</h1>
          <div className="mt-1 text-xs text-mute">
            {cards.length} leads ativos
            {totalNegociacao > 0 && ` · R$ ${totalNegociacao.toLocaleString("pt-BR")} em negociação`}
          </div>
        </div>
        <label className="ml-4 flex w-72 items-center gap-2 rounded-md border-[1.5px] border-borda-forte bg-creme px-3 py-2 focus-within:border-laranja focus-within:bg-branco">
          <svg viewBox="0 0 24 24" strokeWidth={2} className="h-4 w-4 shrink-0 stroke-mute" fill="none">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar lead, telefone…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-mute"
          />
        </label>
        {dados.fonte === "mock" && (
          <span className="rounded-full bg-laranja-cl px-3 py-1 text-xs font-semibold text-laranja-esc">
            dados de exemplo · aguardando funil real (0009)
          </span>
        )}
        {aviso && (
          <span className="rounded-full bg-vermelho-bg px-3 py-1 text-xs font-semibold text-vermelho">
            {aviso}
          </span>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex flex-1 gap-4 overflow-x-auto px-6 pb-6 pt-4">
          {dados.etapas.map((etapa) => (
            <Coluna
              key={etapa.chave}
              etapa={etapa}
              cards={porEtapa.get(etapa.chave) ?? []}
              agora={agora}
              onAbrir={setCardAberto}
            />
          ))}
        </div>
        <DragOverlay>
          {cardArrastado ? (
            <div className="w-72 rotate-2 opacity-90">
              <CartaoLead
                card={cardArrastado}
                corEtapa={etapaDoArrastado?.cor ?? "#a3a0a8"}
                agora={agora}
                onAbrir={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <DrawerCard lead={leadAberto} etapa={etapaAberta} fonte={dados.fonte} onFechar={() => setCardAberto(null)} />

      <div className="pointer-events-none fixed bottom-3 right-6 z-20 rounded-md border border-borda bg-branco px-4 py-2 text-xs text-mute shadow-suave">
        Todo agente <span className="font-semibold text-laranja">propõe</span>; um humano nomeado{" "}
        <span className="font-semibold text-navy">valida</span>; só então vira{" "}
        <span className="font-semibold text-azul">evento</span>.
      </div>
    </div>
  );
}
