"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { FiltrosBoard } from "./filtros";
import { FILTROS_VAZIOS, filtrarCards, haFiltro, type FiltrosFunil } from "@/lib/dados/funil-filtros";
import type { Mencionavel } from "@/lib/conversas/mencao";
import type { TipoTarefa } from "@/lib/tarefa-tipos";
import { CarimboVivo } from "@/components/dashboard/carimbo-vivo";
import { useProjecaoViva } from "@/components/projecao-viva";
import { novosIds } from "@/lib/tempo-real";
import { INTERVALOS, PISO_SEM_TEMPO_REAL } from "@/lib/intervalos-vivos";
import { cn } from "@/lib/utils";

/*
 * Board do FUNIL — redesign R9 (mockup r9-funil.html): colunas de 236px com cabeçalho
 * uppercase + contador mono em pill; etapas "faltou" em âmbar; GANHO/PERDIDO viram tiles
 * TERMINAIS compactos (fora do fluxo operacional, ainda droppáveis — a mecânica de
 * drag-and-drop/escrita pela porta é INTOCADA). O trilho colapsável da v2 morreu (os
 * terminais cobrem o caso). Board vivo da fase 1 preservado (polling + pulso-novo).
 */

function somaValor(cards: CardLead[]): number {
  return cards.reduce((s, c) => s + (c.valor ?? 0), 0);
}
function brl(v: number): string {
  return "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function ehAlerta(etapa: EtapaFunil): boolean {
  return /faltou/i.test(etapa.chave) || /faltou/i.test(etapa.nome);
}

// ─────────────── coluna aberta (r9) ───────────────

function Coluna({
  etapa,
  cards,
  agora,
  selecionadoId,
  arrastando,
  pulsando,
  onAbrir,
  onResolverSugestao,
}: {
  etapa: EtapaFunil;
  cards: CardLead[];
  agora: number;
  selecionadoId: string | null;
  arrastando: boolean;
  pulsando: ReadonlySet<string>;
  onAbrir: (id: string) => void;
  onResolverSugestao: (leadId: string, decisao: "aprovada" | "descartada") => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${etapa.chave}` });
  const soma = somaValor(cards);
  return (
    <div className="flex h-full w-coluna shrink-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-2.5 pt-1.5">
        <span
          className={cn(
            "truncate text-[12.5px] font-semibold uppercase tracking-[0.05em]",
            ehAlerta(etapa) ? "text-amarelo" : "text-suave",
          )}
          title={soma > 0 ? `${etapa.nome} · ${brl(soma)} em aberto` : etapa.nome}
        >
          {etapa.nome}
        </span>
        <span className="ml-auto rounded-full border border-linha bg-branco px-2 py-px font-mono text-[11.5px] tabular-nums text-suave">
          {cards.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-[10px] px-0.5 pb-8 pt-px transition-colors",
          isOver && "bg-hover",
        )}
      >
        {cards.map((c) => (
          <div key={c.lead_id} className={cn(pulsando.has(c.lead_id) && "pulso-novo")}>
            <CartaoLead
              card={c}
              agora={agora}
              selecionado={c.lead_id === selecionadoId}
              onAbrir={onAbrir}
              onResolverSugestao={onResolverSugestao}
            />
          </div>
        ))}
        {isOver && arrastando && (
          <div className="h-16 shrink-0 rounded-[10px] border border-dashed border-linha-forte" aria-hidden />
        )}
        {cards.length === 0 && !isOver && (
          <p className="rounded-lg border border-dashed border-linha px-1.5 py-3.5 text-center text-[12px] text-mute">
            Nenhum lead nesta etapa
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────── terminal compacto (ganho/perdido) ───────────────

function Terminal({ etapa, quantidade }: { etapa: EtapaFunil; quantidade: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${etapa.chave}` });
  const ganho = etapa.tipo === "ganho";
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-[10px] border bg-branco px-3.5 py-3 transition-colors",
        isOver ? "border-laranja bg-laranja-cl" : "border-linha",
      )}
      title={`${etapa.nome} — arraste um card aqui pra fechar`}
    >
      <div
        className={cn(
          "text-[12.5px] font-semibold uppercase tracking-[0.05em]",
          ganho ? "text-verde" : "text-vermelho",
        )}
      >
        {etapa.nome}
      </div>
      <div className="mt-1 text-2xl font-[650] tracking-[-0.02em] tabular-nums text-tinta">
        {quantidade.toLocaleString("pt-BR")}
      </div>
      <div className="mt-1 font-mono text-[10.5px] text-mute">snapshot · sync futuro</div>
    </div>
  );
}

// ─────────────── board ───────────────

export function Quadro({
  dados,
  geradoEm,
  abrirLead = null,
  autorEmail = null,
  autorId = null,
  mencionaveis = [],
  tiposTarefa = [],
}: {
  dados: DadosFunil;
  /** hora da renderização server — carimbo "ao vivo · atualizado há Xs" */
  geradoEm: string;
  /** deep-link ?lead=<id> (vindo do painel da conversa): abre o drawer deste card ao montar */
  abrirLead?: string | null;
  autorEmail?: string | null;
  autorId?: string | null;
  mencionaveis?: Mencionavel[];
  tiposTarefa?: TipoTarefa[];
}) {
  const [cards, setCards] = useState<CardLead[]>(dados.cards);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [cardAberto, setCardAberto] = useState<string | null>(
    abrirLead && dados.cards.some((c) => c.lead_id === abrirLead) ? abrirLead : null,
  );
  const [selecionadoId, setSelecionadoId] = useState<string | null>(cardAberto);
  const [agora, setAgora] = useState<number>(() => Date.now());
  const [aviso, setAviso] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosFunil>(FILTROS_VAZIOS);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // ── board VIVO (Rodada 9): dica realtime (estado_lead/lead) + polling → router.refresh().
  // A publication supabase_realtime TEM as 6 tabelas core.* (conferido na fonte em 26/07); o
  // comentário anterior, que a dava como vazia, era falso e desviou o diagnóstico por 4 dias
  // (E-008). F4: o intervalo vem do módulo único e cai para o piso enquanto o tempo real não
  // estiver confirmado.
  const tempoRealBoard = useProjecaoViva(
    [
      { tabela: { schema: "core", table: "estado_lead" } },
      { tabela: { schema: "core", table: "lead" } },
    ],
    { intervaloMs: INTERVALOS.funil, pisoSemTempoRealMs: PISO_SEM_TEMPO_REAL },
  );

  // refresh → dados.cards novos: re-sincroniza o estado local (a VERDADE é a projeção) e faz
  // o card recém-chegado pulsar 1x. Move otimista em voo NÃO é sobrescrito (guarda movendoRef);
  // o próximo tick re-sincroniza.
  const movendoRef = useRef(0);
  const idsVistosRef = useRef<Set<string> | null>(null);
  const [pulsando, setPulsando] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (movendoRef.current > 0) return;
    setCards(dados.cards);
    const ids = dados.cards.map((c) => c.lead_id);
    const novos = novosIds(idsVistosRef.current ?? new Set(), ids, idsVistosRef.current === null);
    idsVistosRef.current = new Set(ids);
    if (novos.length > 0) {
      setPulsando(new Set(novos));
      const t = setTimeout(() => setPulsando(new Set()), 1600);
      return () => clearTimeout(t);
    }
  }, [dados.cards]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // filtros da paridade Kommo (busca + responsável/etapa/tags/período + meus) — lógica pura testada
  const cardsFiltrados = useMemo(() => filtrarCards(cards, filtros, autorId), [cards, filtros, autorId]);
  const filtroAtivo = haFiltro(filtros);

  const porEtapa = useMemo(() => {
    const m = new Map<string, CardLead[]>();
    for (const e of dados.etapas) m.set(e.chave, []);
    for (const c of cardsFiltrados) {
      if (!m.has(c.etapa)) m.set(c.etapa, []);
      m.get(c.etapa)!.push(c);
    }
    return m;
  }, [cardsFiltrados, dados.etapas]);

  // filtro de etapa esconde as colunas fora da seleção (terminais incluídos) — como no Kommo
  const etapasVisiveis =
    filtros.etapas.length > 0 ? dados.etapas.filter((e) => filtros.etapas.includes(e.chave)) : dados.etapas;
  const abertas = etapasVisiveis.filter((e) => e.tipo === "aberto");
  const terminais = etapasVisiveis.filter((e) => e.tipo !== "aberto");

  const chavesAbertas = useMemo(
    () => new Set(dados.etapas.filter((e) => e.tipo === "aberto").map((e) => e.chave)),
    [dados.etapas],
  );
  const leadsAtivos = useMemo(
    () => cards.filter((c) => chavesAbertas.has(c.etapa)).length,
    [cards, chavesAbertas],
  );
  const leadsAtivosFiltrados = useMemo(
    () => cardsFiltrados.filter((c) => chavesAbertas.has(c.etapa)).length,
    [cardsFiltrados, chavesAbertas],
  );

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

    movendoRef.current += 1;
    let res;
    try {
      res = await moverCardEtapa(leadId, etapaDe, etapaAlvo);
    } finally {
      movendoRef.current -= 1;
    }
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
    <div className="flex h-screen flex-col bg-board">
      {/* ── cab do board (r9): título + total mono + busca + ao vivo ── */}
      <div className="flex flex-shrink-0 flex-wrap items-baseline gap-x-3.5 gap-y-2 px-5 pb-3 pt-4">
        <h1 className="text-[20px] font-[650] tracking-[-0.01em] text-tinta">Funil de vendas</h1>
        <span className="font-mono text-[12px] text-suave">
          {filtroAtivo
            ? `${leadsAtivosFiltrados.toLocaleString("pt-BR")} de ${leadsAtivos.toLocaleString("pt-BR")} leads ativos`
            : `${leadsAtivos.toLocaleString("pt-BR")} leads ativos`}
        </span>
        {dados.corte && (
          <span
            className="rounded-full bg-laranja-cl px-2.5 py-0.5 text-[11.5px] font-medium text-laranja-esc"
            title="O board bateu no teto de leitura — paginação vem em rodada futura."
          >
            mostrando os {dados.cards.length} mais recentes
          </span>
        )}
        {aviso && (
          <span className="rounded-full bg-vermelho-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-vermelho">{aviso}</span>
        )}
        <div className="ml-auto flex items-center gap-3.5 self-center">
          {/* meus leads (0060): corte por dono_id === auth.uid — o gesto diário do vendedor no Kommo */}
          {autorId && (
            <button
              type="button"
              onClick={() => setFiltros((f) => ({ ...f, meus: !f.meus }))}
              aria-pressed={filtros.meus}
              className={cn(
                "rounded-full border px-3 py-1 text-[12.5px] transition-colors",
                filtros.meus
                  ? "border-laranja bg-laranja-cl font-medium text-laranja-esc"
                  : "border-linha bg-branco text-suave hover:border-linha-forte",
              )}
            >
              Meus leads
            </button>
          )}
          <label className="flex w-52 items-center gap-2 rounded-[6px] border border-linha bg-branco px-2.5 py-1.5 transition-colors focus-within:border-linha-forte">
            <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" className="h-3.5 w-3.5 shrink-0 stroke-mute" fill="none">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={filtros.busca}
              onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
              placeholder="Buscar lead, telefone"
              className="w-full bg-transparent text-[13px] text-tinta outline-none placeholder:text-mute"
            />
          </label>
          <FiltrosBoard
            cards={cards}
            etapas={dados.etapas}
            filtros={filtros}
            onChange={setFiltros}
            qtdFiltrada={cardsFiltrados.length}
          />
          <CarimboVivo
            geradoEm={geradoEm}
            revalidar={false}
            intervaloMs={INTERVALOS.funil}
            aoVivo={tempoRealBoard.aoVivo}
            falhas={tempoRealBoard.falhas}
          />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex flex-1 items-stretch gap-3 overflow-x-auto px-5 pb-5">
          {abertas.map((etapa) => (
            <Coluna
              key={etapa.chave}
              etapa={etapa}
              cards={porEtapa.get(etapa.chave) ?? []}
              agora={agora}
              selecionadoId={selecionadoId}
              arrastando={arrastando != null}
              pulsando={pulsando}
              onAbrir={abrirCard}
              onResolverSugestao={resolverSugestao}
            />
          ))}
          {/* terminais: fora do fluxo operacional; seguem droppáveis (fechar = arrastar) */}
          {terminais.length > 0 && (
            <div className="flex w-[200px] min-w-[200px] flex-col gap-2 pt-9">
              {terminais.map((etapa) => (
                <Terminal key={etapa.chave} etapa={etapa} quantidade={(porEtapa.get(etapa.chave) ?? []).length} />
              ))}
            </div>
          )}
        </div>
        {/* card fantasma no arraste */}
        <DragOverlay>
          {cardArrastado ? (
            <div className="w-coluna rotate-[1.5deg] opacity-50 shadow-[0_14px_40px_rgba(31,35,40,.18)]">
              <CartaoLead card={cardArrastado} agora={agora} selecionado={false} onAbrir={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <DrawerCard
        lead={leadAberto}
        etapa={etapaAberta}
        autorEmail={autorEmail}
        autorId={autorId}
        mencionaveis={mencionaveis}
        tiposTarefa={tiposTarefa}
        onFechar={() => setCardAberto(null)}
      />

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-[6px] border border-linha-forte bg-branco px-4 py-2.5 text-sm text-navy shadow-forte">
          {toast}
        </div>
      )}
    </div>
  );
}
