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

/*
 * Board do FUNIL — redesign "Notion-minimalista" (fase 1). Spec: Product_Management/Design/kanban-v2.html.
 * Mecânica (drag-and-drop, leitura/escrita) INTOCADA (spec §7); mudou só a pele + o trilho colapsável.
 * Etapas quietas colapsam num trilho de 44px; estado aberto/recolhido por etapa vive em localStorage.
 *   TODO(spec): virar config do usuário PERSISTIDA no servidor (spec §8) — hoje é local ao navegador.
 */

const LS_RECOLHIDAS = "funil:etapas-recolhidas";

function somaValor(cards: CardLead[]): number {
  return cards.reduce((s, c) => s + (c.valor ?? 0), 0);
}
function brl(v: number): string {
  return "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Semente do estado colapsado: etapas terminais/quietas começam recolhidas (spec §8). */
function seedRecolhidas(etapas: EtapaFunil[]): string[] {
  return etapas.filter((e) => e.tipo === "perdido" || /faltou/i.test(e.chave)).map((e) => e.chave);
}

// ─────────────── coluna aberta ───────────────

function Coluna({
  etapa,
  cards,
  agora,
  selecionadoId,
  arrastando,
  onAbrir,
  onRecolher,
  onResolverSugestao,
}: {
  etapa: EtapaFunil;
  cards: CardLead[];
  agora: number;
  selecionadoId: string | null;
  arrastando: boolean;
  onAbrir: (id: string) => void;
  onRecolher: (chave: string) => void;
  onResolverSugestao: (leadId: string, decisao: "aprovada" | "descartada") => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${etapa.chave}` });
  const soma = somaValor(cards);
  const vazia = cards.length === 0;
  return (
    <div className="flex h-full w-coluna shrink-0 flex-col">
      <div className="group flex items-center gap-2 px-1.5 pb-2.5">
        <span className="truncate text-[0.82rem] font-semibold tracking-[0.01em] text-tinta">{etapa.nome}</span>
        <span className="font-serif text-[0.86rem] font-medium tabular-nums text-mute">{cards.length}</span>
        <div className="ml-auto flex items-center gap-2">
          {soma > 0 && <span className="text-[0.74rem] tabular-nums text-mute">{brl(soma)}</span>}
          <button
            type="button"
            onClick={() => onRecolher(etapa.chave)}
            title="Recolher etapa"
            aria-label={`Recolher etapa ${etapa.nome}`}
            className="grid h-5 w-5 place-items-center rounded text-mute opacity-0 transition-all hover:bg-hover hover:text-suave focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50 group-hover:opacity-100"
          >
            <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 stroke-current" fill="none">
              <path d="m11 17-5-5 5-5M18 17l-5-5 5-5" />
            </svg>
          </button>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-[7px] overflow-y-auto rounded-[9px] pb-10 pr-1 pt-px transition-colors",
          isOver && "bg-hover", // coluna-alvo ganha fundo --hover enquanto o card paira (spec A6)
        )}
      >
        {cards.map((c) => (
          <CartaoLead
            key={c.lead_id}
            card={c}
            agora={agora}
            selecionado={c.lead_id === selecionadoId}
            onAbrir={onAbrir}
            onResolverSugestao={onResolverSugestao}
          />
        ))}
        {/* placeholder de drop: retângulo tracejado na altura do card (spec A6) */}
        {isOver && arrastando && (
          <div className="h-16 shrink-0 rounded-[9px] border border-dashed border-linha-forte" aria-hidden />
        )}
        {vazia && !isOver && (
          <p className="px-2 pt-1 text-[0.74rem] text-mute">Nenhum lead nesta etapa</p>
        )}
        <button
          type="button"
          className="mt-px flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.8rem] text-mute transition-colors hover:bg-hover hover:text-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50"
        >
          <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" className="h-3.5 w-3.5 stroke-current" fill="none">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Adicionar lead
        </button>
      </div>
    </div>
  );
}

// ─────────────── coluna recolhida (trilho de 44px) ───────────────

function MiniColuna({
  etapa,
  quantidade,
  onExpandir,
}: {
  etapa: EtapaFunil;
  quantidade: number;
  onExpandir: (chave: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${etapa.chave}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onExpandir(etapa.chave)}
      title={`${etapa.nome} · ${quantidade} leads — etapa recolhida (clique p/ expandir)`}
      className={cn(
        "flex h-full w-trilho shrink-0 cursor-pointer flex-col items-center gap-[11px] rounded-[9px] border bg-branco py-[11px] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50",
        isOver ? "border-laranja bg-laranja-cl" : "border-linha hover:border-linha-forte hover:bg-hover",
      )}
    >
      <span className="font-serif text-[0.9rem] font-medium tabular-nums text-mute">{quantidade}</span>
      <span className="whitespace-nowrap text-[0.77rem] font-semibold tracking-[0.01em] text-suave [writing-mode:vertical-rl] rotate-180">
        {etapa.nome}
      </span>
    </button>
  );
}

// ─────────────── board ───────────────

export function Quadro({ dados }: { dados: DadosFunil }) {
  const [cards, setCards] = useState<CardLead[]>(dados.cards);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [cardAberto, setCardAberto] = useState<string | null>(null);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [agora, setAgora] = useState<number>(() => Date.now());
  const [aviso, setAviso] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  // Semente determinística (igual no SSR e no 1º render do cliente → sem mismatch de hidratação).
  const [recolhidas, setRecolhidas] = useState<Set<string>>(() => new Set(seedRecolhidas(dados.etapas)));

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Depois da hidratação, sobrescreve com a preferência local do usuário (se houver).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_RECOLHIDAS);
      if (raw) setRecolhidas(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* localStorage indisponível — mantém a semente */
    }
  }, []);

  function alternarRecolhida(chave: string) {
    setRecolhidas((prev) => {
      const n = new Set(prev);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      try {
        localStorage.setItem(LS_RECOLHIDAS, JSON.stringify([...n]));
      } catch {
        /* ignora — preferência não persiste neste navegador */
      }
      return n;
    });
  }

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

  // KPIs reais: leads ativos = etapas abertas; valor em aberto = soma dos valores nessas etapas.
  const { leadsAtivos, valorAberto } = useMemo(() => {
    const abertas = new Set(dados.etapas.filter((e) => e.tipo === "aberto").map((e) => e.chave));
    const ativos = cards.filter((c) => abertas.has(c.etapa));
    return { leadsAtivos: ativos.length, valorAberto: somaValor(ativos) };
  }, [cards, dados.etapas]);

  const cardArrastado = cards.find((c) => c.lead_id === arrastando) ?? null;

  function abrirCard(id: string) {
    setSelecionadoId(id);
    setCardAberto(id);
  }

  function resolverSugestao(_leadId: string, decisao: "aprovada" | "descartada") {
    setToast(
      decisao === "aprovada"
        ? "Sugestão aprovada — vira evento após a validação."
        : "Sugestão descartada.",
    );
    setTimeout(() => setToast(null), 3500);
  }

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
  const qtdRecolhidas = dados.etapas.filter((e) => recolhidas.has(e.chave)).length;

  return (
    <div className="flex h-[calc(100vh-58px)] flex-col bg-board">
      {/* ── sub-header: título Fraunces + KPIs reais + busca discreta ── */}
      <div className="flex flex-shrink-0 flex-wrap items-baseline gap-x-5 gap-y-2 border-b border-linha bg-branco px-6 pb-3 pt-4">
        <h1 className="font-serif text-2xl font-semibold leading-none text-navy">Funil</h1>
        <div className="flex items-baseline gap-5">
          <span className="flex items-baseline gap-1.5">
            <span className="font-serif text-[1.02rem] font-medium tabular-nums text-navy">{leadsAtivos}</span>
            <span className="text-[0.78rem] text-mute">leads ativos</span>
          </span>
          {valorAberto > 0 && (
            <span className="flex items-baseline gap-1.5">
              <span className="font-serif text-[1.02rem] font-medium tabular-nums text-navy">{brl(valorAberto)}</span>
              <span className="text-[0.78rem] text-mute">em aberto</span>
            </span>
          )}
          {qtdRecolhidas > 0 && (
            <span className="flex items-baseline gap-1.5">
              <span className="font-serif text-[1.02rem] font-medium tabular-nums text-navy">{qtdRecolhidas}</span>
              <span className="text-[0.78rem] text-mute">etapas recolhidas</span>
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3 self-center">
          <label className="flex w-56 items-center gap-2 rounded-lg border border-transparent bg-board px-2.5 py-1.5 transition-colors focus-within:border-linha-forte focus-within:bg-branco">
            <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" className="h-[15px] w-[15px] shrink-0 stroke-mute" fill="none">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar lead, telefone…"
              className="w-full bg-transparent text-[0.84rem] text-tinta outline-none placeholder:text-mute"
            />
          </label>
          {dados.fonte === "mock" && (
            <span className="rounded-full bg-laranja-cl px-3 py-1 text-xs font-semibold text-laranja-esc">
              dados de exemplo
            </span>
          )}
          {aviso && (
            <span className="rounded-full bg-vermelho-bg px-3 py-1 text-xs font-semibold text-vermelho">{aviso}</span>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex flex-1 gap-3 overflow-x-auto px-6 pb-5 pt-2">
          {dados.etapas.map((etapa) =>
            recolhidas.has(etapa.chave) ? (
              <MiniColuna
                key={etapa.chave}
                etapa={etapa}
                quantidade={(porEtapa.get(etapa.chave) ?? []).length}
                onExpandir={alternarRecolhida}
              />
            ) : (
              <Coluna
                key={etapa.chave}
                etapa={etapa}
                cards={porEtapa.get(etapa.chave) ?? []}
                agora={agora}
                selecionadoId={selecionadoId}
                arrastando={arrastando != null}
                onAbrir={abrirCard}
                onRecolher={alternarRecolhida}
                onResolverSugestao={resolverSugestao}
              />
            ),
          )}
        </div>
        {/* card fantasma no arraste: opacity .5, sombra forte, rotação ~1.5° (spec A6) */}
        <DragOverlay>
          {cardArrastado ? (
            <div className="w-coluna rotate-[1.5deg] opacity-50 shadow-[0_14px_40px_rgba(37,47,99,.22)]">
              <CartaoLead card={cardArrastado} agora={agora} selecionado={false} onAbrir={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <DrawerCard lead={leadAberto} etapa={etapaAberta} fonte={dados.fonte} onFechar={() => setCardAberto(null)} />

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-md border border-linha-forte bg-branco px-4 py-2.5 text-sm text-navy shadow-[0_6px_26px_rgba(37,47,99,.12)]">
          {toast}
        </div>
      )}
    </div>
  );
}
