"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import {
  ATALHOS,
  COLUNAS,
  acaoPorTecla,
  agruparPorLead,
  colunaDe,
  distribuir,
  proximaColuna,
  proximoIndice,
  reconciliar,
  transicao,
  type ColunaStatus,
} from "@/lib/tarefas/quadro";
import { iniciarTarefa, reabrirTarefa } from "@/app/(app)/tarefas/actions";
import type { ResultadoEvento } from "@/app/(app)/funil/actions";
import { PainelConcluir } from "@/components/tarefas/concluir-tarefa";
import type { AcoesDaTarefa } from "@/components/tarefas/executor";
import { MetaTarefa, PorQueJarvis } from "@/components/tarefas/cartao-meta";
import { cn } from "@/lib/utils";
import { destinoDaTarefa } from "@/lib/tarefas/destino";

/*
 * QUADRO POR STATUS (`/tarefas?ver=quadro`, F8 · 27/08) — três colunas, A fazer · Em andamento ·
 * Concluída. A regra mora em lib/tarefas/quadro.ts (pura, testada); aqui só o desenho e o I/O.
 *
 * ARRASTAR É EMITIR EVENTO. Soltar o card noutra coluna vira `tarefa_iniciada` / `tarefa_reaberta`
 * pela porta (`api.registrar_evento`, via as server actions), e `tarefa_concluida` pelo painel que
 * já existia (concluir-tarefa.tsx) — porque concluir EXIGE resultado (0037) e o quadro não inventa
 * um. O card cai na coluna na hora (override otimista) e a verdade chega pela releitura: quando
 * `core.v_tarefa` já reflete a coluna, `reconciliar` apaga o override; se a porta recusar, o card
 * volta e o motivo aparece numa linha em cima do quadro.
 *
 * Tempo real: a assinatura de core.tarefa é da VisaoTarefas (useTarefasVivas) — o quadro é filho.
 *
 * Teclado (benchmark Linear/Pipedrive): J/K anda, H/L troca de coluna, E pega, C conclui, V volta,
 * Enter abre o lead, ? mostra a lista. O foco é visível (anel navy) e não depende do mouse.
 *
 * O que o quadro deliberadamente NÃO faz: ordenar à mão dentro da coluna (a ordem é vencida →
 * prazo → criação, a mesma do funil), mostrar arquivadas (a lista `?status=arquivadas` é o lugar),
 * e drag para fora do quadro.
 */

type Nomes = { membros: Map<string, string>; tipos: Map<string, string> };

export interface ExecutorQuadro {
  iniciar(t: TarefaVisao): Promise<ResultadoEvento>;
  reabrir(t: TarefaVisao): Promise<ResultadoEvento>;
  /** o painel de concluir do card — ausente = as ações de sempre */
  acoesDe?: (t: TarefaVisao) => AcoesDaTarefa;
}

export function QuadroStatus({
  tarefas,
  emAndamento,
  emAndamentoDisponivel,
  agora,
  nomes,
  aoMudar,
  executor,
  rank,
}: {
  /** pendentes + concluídas já filtradas pela barra (arquivadas não entram no quadro) */
  tarefas: TarefaVisao[];
  /** ids com `iniciada_em` (core.v_tarefa.em_andamento) */
  emAndamento: ReadonlySet<string>;
  /** false = a 0305 ainda não está no banco: tudo aberto cai em A fazer, e a coluna do meio avisa */
  emAndamentoDisponivel: boolean;
  agora: number;
  nomes: Nomes;
  aoMudar: () => void;
  /** v3 · quem escreve (ensaio = estado local). Ausente = `iniciarTarefa` / `reabrirTarefa` reais. */
  executor?: ExecutorQuadro;
  /** v4 · a ordem escolhida na barra (id → posição) — o quadro obedece o mesmo seletor da lista */
  rank?: ReadonlyMap<string, number> | null;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Map<string, ColunaStatus>>(() => new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [concluindoId, setConcluindoId] = useState<string | null>(null);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [sobre, setSobre] = useState<ColunaStatus | null>(null);
  const [focoId, setFocoId] = useState<string | null>(null);
  const [mostrarAtalhos, setMostrarAtalhos] = useState(false);
  const [agruparLead, setAgruparLead] = useState(false);
  const concluiuRef = useRef<Set<string>>(new Set());
  const raiz = useRef<HTMLDivElement>(null);

  // a verdade assume: override que o servidor já reflete sai do mapa (sem relógio)
  useEffect(() => {
    setOverrides((atual) => {
      const vivo = reconciliar(atual, tarefas, emAndamento);
      return vivo.size === atual.size && [...vivo].every(([k, v]) => atual.get(k) === v) ? atual : vivo;
    });
  }, [tarefas, emAndamento]);

  const colunas = useMemo(() => distribuir(tarefas, emAndamento, overrides, rank), [tarefas, emAndamento, overrides, rank]);
  const porId = useMemo(() => new Map(tarefas.map((t) => [t.id, t])), [tarefas]);

  function colunaAtual(t: TarefaVisao): ColunaStatus | null {
    return overrides.get(t.id) ?? colunaDe(t, emAndamento);
  }

  function tirarOverride(id: string) {
    setOverrides((m) => {
      if (!m.has(id)) return m;
      const n = new Map(m);
      n.delete(id);
      return n;
    });
  }

  const mover = useCallback(
    async (t: TarefaVisao, para: ColunaStatus) => {
      const de = overrides.get(t.id) ?? colunaDe(t, emAndamento);
      if (!de) return;
      const tr = transicao(de, para);
      if (!tr) return;
      setErro(null);
      setOverrides((m) => new Map(m).set(t.id, para));
      if (tr.pedeResultado) {
        // concluir não é imediato: o card já está na coluna, com o campo de resultado aberto
        setConcluindoId(t.id);
        return;
      }
      for (const ev of tr.eventos) {
        const r =
          ev === "tarefa_iniciada"
            ? await (executor ? executor.iniciar(t) : iniciarTarefa(t.id, t.lead_id))
            : await (executor ? executor.reabrir(t) : reabrirTarefa(t.id, t.lead_id));
        if (!r.ok) {
          tirarOverride(t.id);
          setErro(`${t.titulo}: ${r.motivo ?? "a porta recusou"}`);
          return;
        }
      }
      aoMudar();
    },
    [overrides, emAndamento, aoMudar, executor],
  );

  // ── concluir dentro do quadro (reaproveita PainelConcluir) ──
  function fecharConcluir(id: string) {
    setConcluindoId(null);
    // PainelConcluir chama onFechar ANTES de aoSucesso, no mesmo tick: só desfaz o override
    // se o sucesso não tiver sido marcado até o próximo microtask (cancelou com Esc / clique fora).
    queueMicrotask(() => {
      if (!concluiuRef.current.has(id)) tirarOverride(id);
    });
  }
  function concluiu(id: string) {
    concluiuRef.current.add(id);
    aoMudar();
  }

  // ── drag & drop nativo ──
  function aoSoltar(col: ColunaStatus, e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || arrastandoId;
    setSobre(null);
    setArrastandoId(null);
    const t = id ? porId.get(id) : undefined;
    if (t) void mover(t, col);
  }

  // ── teclado ──
  function aoTeclar(e: React.KeyboardEvent) {
    const alvo = e.target as HTMLElement;
    if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT") return;
    const k = e.key;
    if (k === "?") {
      e.preventDefault();
      setMostrarAtalhos((v) => !v);
      return;
    }
    const foco = focoId ? porId.get(focoId) : undefined;
    const colFoco: ColunaStatus = (foco && colunaAtual(foco)) || "a_fazer";
    const lista = colunas[colFoco];
    const idx = foco ? lista.findIndex((t) => t.id === foco.id) : -1;

    if (k === "ArrowDown" || k === "j" || k === "J" || k === "ArrowUp" || k === "k" || k === "K") {
      e.preventDefault();
      const delta = k === "ArrowDown" || k === "j" || k === "J" ? 1 : -1;
      const i = proximoIndice(idx, delta, lista.length);
      if (i >= 0) focar(lista[i].id);
      return;
    }
    if (k === "ArrowRight" || k === "l" || k === "L" || k === "ArrowLeft" || k === "h" || k === "H") {
      e.preventDefault();
      const delta = k === "ArrowRight" || k === "l" || k === "L" ? 1 : -1;
      const col = proximaColuna(colFoco, delta);
      const primeira = colunas[col][0];
      if (primeira) focar(primeira.id);
      return;
    }
    if (!foco) return;
    if (k === "Enter") {
      const d = destinoDaTarefa(foco);
      if (d) router.push(d);
      return;
    }
    if (k === "Escape") {
      setFocoId(null);
      setMostrarAtalhos(false);
      return;
    }
    const para = acaoPorTecla(k, colFoco);
    if (para) {
      e.preventDefault();
      void mover(foco, para);
    }
  }
  function focar(id: string) {
    setFocoId(id);
    raiz.current?.querySelector<HTMLElement>(`[data-tarefa="${id}"]`)?.scrollIntoView({ block: "nearest" });
  }

  const total = colunas.a_fazer.length + colunas.em_andamento.length + colunas.concluida.length;

  return (
    <div
      ref={raiz}
      tabIndex={0}
      onKeyDown={aoTeclar}
      aria-label="Quadro de tarefas por status"
      className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col outline-none"
    >
      {/* linha de instrumentos do quadro: erro da porta, agrupar por lead, atalhos */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-5 pb-2 text-[12px]">
        {erro ? (
          <span role="alert" className="font-semibold text-vermelho">
            Não moveu — {erro}
          </span>
        ) : !emAndamentoDisponivel ? (
          <span className="text-mute">Em andamento ainda não está ativo no banco — tudo aberto aparece em A fazer.</span>
        ) : (
          <span className="text-mute">Arraste entre colunas ou use o teclado.</span>
        )}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-suave">
          <input
            type="checkbox"
            checked={agruparLead}
            onChange={(e) => setAgruparLead(e.target.checked)}
            className="h-3.5 w-3.5 accent-navy"
          />
          Agrupar por lead
        </label>
        <button
          type="button"
          onClick={() => setMostrarAtalhos((v) => !v)}
          aria-expanded={mostrarAtalhos}
          className="rounded-[6px] border border-linha bg-branco px-2 py-0.5 font-mono text-[11px] text-suave hover:bg-hover hover:text-tinta"
        >
          ?
        </button>
      </div>

      {mostrarAtalhos && (
        <dl className="mx-5 mb-2 grid flex-shrink-0 grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-[10px] border border-linha bg-branco px-3.5 py-2.5 text-[12px] sm:grid-cols-[auto_1fr_auto_1fr]">
          {ATALHOS.map((a) => (
            <div key={a.teclas} className="contents">
              <dt className="font-mono text-[11px] text-tinta">{a.teclas}</dt>
              <dd className="text-suave">{a.faz}</dd>
            </div>
          ))}
        </dl>
      )}

      {total === 0 ? (
        <div className="grid flex-1 place-items-center px-5 pb-16">
          <p className="text-[13.5px] text-suave">
            Nada no quadro.{" "}
            <button type="button" onClick={() => router.push("/conversas")} className="font-semibold text-navy underline-offset-2 hover:underline">
              Criar na conversa
            </button>
          </p>
        </div>
      ) : (
        <div className="flex flex-1 items-stretch gap-4 overflow-x-auto px-6 pb-6">
          {COLUNAS.map((c) => {
            const lista = colunas[c.chave];
            const alvo = sobre === c.chave && arrastandoId != null;
            return (
              <section
                key={c.chave}
                aria-label={c.rotulo}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (sobre !== c.chave) setSobre(c.chave);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre((s) => (s === c.chave ? null : s));
                }}
                onDrop={(e) => aoSoltar(c.chave, e)}
                className="flex h-full min-w-[300px] flex-1 flex-col"
              >
                <div className="flex items-baseline gap-2 px-1 pb-2 pt-1">
                  <span className={cn("truncate text-[13px] font-medium", c.chave === "em_andamento" ? "text-tinta" : "text-suave")}>
                    {c.rotulo}
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-mute">{lista.length}</span>
                </div>
                <div
                  className={cn(
                    "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-[10px] px-0.5 pb-8 pt-px transition-colors",
                    alvo && "bg-bolha-out/60 outline-dashed outline-1 outline-offset-[-1px] outline-laranja",
                  )}
                >
                  {lista.length === 0 ? (
                    <VazioColuna coluna={c.chave} texto={c.vazio} />
                  ) : agruparLead ? (
                    agruparPorLead(lista).map((g) => (
                      <div key={g.chave || "sem-lead"} className="flex flex-col gap-2">
                        <div className="truncate px-1 pt-1 text-[11px] font-semibold text-mute">{g.rotulo}</div>
                        {g.tarefas.map((t) => (
                          <Cartao key={t.id} t={t} coluna={c.chave} {...propsCartao(t)} />
                        ))}
                      </div>
                    ))
                  ) : (
                    lista.map((t) => <Cartao key={t.id} t={t} coluna={c.chave} {...propsCartao(t)} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );

  function propsCartao(t: TarefaVisao) {
    return {
      agora,
      nomes,
      focado: focoId === t.id,
      arrastando: arrastandoId === t.id,
      pendenteNaPorta: overrides.has(t.id) && concluindoId !== t.id,
      concluindo: concluindoId === t.id,
      onFocar: () => setFocoId(t.id),
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData("text/plain", t.id);
        e.dataTransfer.effectAllowed = "move";
        setArrastandoId(t.id);
        setFocoId(t.id);
      },
      onDragEnd: () => {
        setArrastandoId(null);
        setSobre(null);
      },
      onMover: (para: ColunaStatus) => void mover(t, para),
      onFecharConcluir: () => fecharConcluir(t.id),
      onConcluiu: () => concluiu(t.id),
      acoes: executor?.acoesDe?.(t),
    };
  }
}

/** Estado vazio de UMA linha, com a ação que faz a coluna deixar de estar vazia. */
function VazioColuna({ coluna, texto }: { coluna: ColunaStatus; texto: string }) {
  const router = useRouter();
  return (
    <p className="rounded-lg border border-dashed border-linha px-1.5 py-3.5 text-center text-[12px] text-mute">
      {texto}
      {coluna === "a_fazer" && (
        <>
          {" · "}
          <button type="button" onClick={() => router.push("/conversas")} className="font-semibold text-navy underline-offset-2 hover:underline">
            criar na conversa
          </button>
        </>
      )}
      {coluna === "em_andamento" && <> · arraste um card ou tecle E</>}
    </p>
  );
}

function Cartao({
  t,
  coluna,
  agora,
  nomes,
  focado,
  arrastando,
  pendenteNaPorta,
  concluindo,
  onFocar,
  onDragStart,
  onDragEnd,
  onMover,
  onFecharConcluir,
  onConcluiu,
  acoes,
}: {
  t: TarefaVisao;
  coluna: ColunaStatus;
  agora: number;
  nomes: Nomes;
  focado: boolean;
  arrastando: boolean;
  pendenteNaPorta: boolean;
  concluindo: boolean;
  onFocar: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMover: (para: ColunaStatus) => void;
  onFecharConcluir: () => void;
  onConcluiu: () => void;
  acoes?: AcoesDaTarefa;
}) {
  const router = useRouter();
  const fechada = coluna === "concluida";
  return (
    <div
      id={`tarefa-${t.id}`}
      data-tarefa={t.id}
      draggable={!concluindo}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onFocar}
      onDoubleClick={() => { const d = destinoDaTarefa(t); if (d) router.push(d); }}
      aria-current={focado ? "true" : undefined}
      className={cn(
        "rounded-lg border border-linha bg-branco px-3.5 py-3 transition-[opacity,box-shadow,border-color] cursor-grab active:cursor-grabbing hover:bg-[#FBFAF7]",
        focado && "ring-1 ring-inset ring-navy",
        arrastando && "opacity-40",
        pendenteNaPorta && "opacity-70",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            {!fechada && t.prioridade === "alta" && <span className="size-1.5 shrink-0 self-center rounded-full bg-primary" title="prioridade alta" aria-label="prioridade alta" />}
            <span className={cn("min-w-0 flex-1 text-[14px] font-medium leading-snug", fechada ? "text-mute line-through decoration-mute/60" : "text-tinta")}>
              {t.titulo}
            </span>
          </div>
          {t.lead_nome && <div className="mt-0.5 truncate text-[12.5px] text-mute">{t.lead_nome}</div>}
          {t.descricao && !fechada && (
            <div className="mt-0.5 whitespace-pre-line text-[12.5px] leading-snug text-mute">{t.descricao}</div>
          )}
          <PorQueJarvis t={t} apagada={fechada} />
          {fechada && t.resultado && <div className="mt-0.5 text-[12.5px] leading-snug text-mute">{t.resultado}</div>}
        </div>
        {/* ação inline por coluna — o mesmo que o arrastar faz, para quem não arrasta */}
        {coluna === "a_fazer" && <BotaoMover rotulo="Pegar" titulo="Mover para Em andamento (E)" onClick={() => onMover("em_andamento")} />}
        {coluna === "em_andamento" && <BotaoMover rotulo="Concluir" titulo="Concluir com resultado (C)" onClick={() => onMover("concluida")} />}
        {coluna === "concluida" && <BotaoMover rotulo="Reabrir" titulo="Voltar para A fazer (V)" onClick={() => onMover("a_fazer")} />}
      </div>
      <div className="mt-1.5">
        <MetaTarefa t={t} agora={agora} nomes={nomes} apagada={fechada} />
      </div>
      {concluindo && (
        <PainelConcluir leadId={t.lead_id} tarefaId={t.id} executor={acoes} aoSucesso={onConcluiu} onFechar={onFecharConcluir} />
      )}
    </div>
  );
}

function BotaoMover({ rotulo, titulo, onClick }: { rotulo: string; titulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-medium text-mute hover:bg-hover hover:text-tinta"
    >
      {rotulo}
    </button>
  );
}
