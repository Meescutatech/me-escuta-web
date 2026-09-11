"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeftIcon, ArrowUpRightIcon, CalendarClockIcon, CheckIcon, SkipForwardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListaDeAcoes, type ItemAcao } from "@/components/jarvis/lista-de-acoes";
import { useMovimento } from "@/components/jarvis/movimento";
import type { Mencionavel } from "@/lib/conversas/mencao";
import type { TipoTarefa } from "@/lib/tarefa-tipos";
import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import type { ContextoFoco } from "@/lib/ensaio/tarefas-foco";
import { dataHoraCurta } from "@/lib/dados/tarefa-calculos";
import { textoPrazoHumano } from "@/lib/tarefas/dia";
import { presetsAdiar } from "@/lib/tarefas/adiar";
import { destinoDaTarefa } from "@/lib/tarefas/destino";
import { desfechoDaConclusao } from "./regras/conclusao";
import { aplicarEscritas, comEvento, escritasVazias, idNovoEnsaio, type EscritasEnsaio } from "@/lib/tarefas/ensaio-local";
import { depoisDe, filaDoFoco, fracaoFeita, ordemInicial, posicaoNoFoco, rotuloProgresso } from "@/lib/tarefas/foco";
import {
  ESTADO_TAREFAS_VAZIO,
  escritasDoCookie,
  type EstadoTarefasEnsaio,
  type SessaoFocoCookie,
} from "@/lib/tarefas/sessao-foco";
import { concluirTarefaLead, criarTarefaLead, repactuarPrazoTarefaLead } from "@/app/(app)/lead/actions";
import { concluirTarefaNotificacao } from "@/app/(app)/notificacoes/actions";
import { gravarEnsaioTarefas, iniciarTarefa } from "@/app/(app)/tarefas/actions";
import { cn } from "@/lib/utils";
import { ResumoJarvisBloco } from "./resumo-jarvis";
import { ConversaDoFoco, type EnvioDoFoco } from "./foco-conversa";
import { CorpoEAgora, type ConcluidaAgora } from "./e-agora";
import type { PessoaAtiva } from "./acoes-tarefa";
import type { NovaTarefa } from "./executor";
import type { ResultadoEvento } from "@/app/(app)/funil/actions";

/*
 * MODO FOCO — uma tarefa por vez, com a conversa do lead ao lado (W-T, 10/09/2026 noite).
 *
 * O pedido é literal e é de agosto: *"Não quero que você abra múltiplas telas."* (workshop 12/08,
 * R8). E o custo que ele evita também está medido: *"Ela tá gastando metade do tempo dela pra
 * poder priorizar e a outra metade pra poder escrever a tarefa"* (Rodolfo, §4). A lista resolve a
 * primeira metade — a ordem já vem decidida. Esta tela resolve a segunda: a tarefa, o resumo, a
 * conversa e o campo de resposta cabem juntos, e a pessoa não sai do lugar entre um lead e outro.
 *
 * ── O DESENHO, e a única coisa grande da tela ─────────────────────────────────────────────────
 * A lista é densa de propósito (13-15px, tudo do mesmo tamanho, a ordem é que hierarquiza). Aqui é
 * o oposto: UMA coisa em 26px — o título da tarefa — e todo o resto abaixo de 15. É o que separa
 * "estou varrendo a fila" de "estou nesta". Nada mais na tela cresce: o progresso é um filete de
 * 2px na faixa de cima (barra grossa vira o assunto, e o assunto é o lead), a ficha é uma linha de
 * 12px, e o fio usa exatamente as bolhas de /conversas.
 *
 * A conversa fica com MAIS da metade porque a decisão mora nela: a tarefa diz o que fazer, a
 * conversa diz se ainda faz sentido fazer.
 *
 * ── O que é evento e o que é só tela ──────────────────────────────────────────────────────────
 * Concluir e adiar são os eventos de sempre (`tarefa_concluida` com resultado obrigatório,
 * `tarefa_prazo_repactuado` com motivo). Entrar numa tarefa chama `iniciarTarefa` quando ele
 * existe (F8, `tarefa_iniciada`) — é o único lugar do sistema em que "comecei esta" é um fato e
 * não um palpite. PULAR não tem evento: não muda prazo nem dono, é "agora não, hoje sim", e vive
 * na sessão (cookie no ensaio). O candidato `tarefa_pulada` está registrado em
 * `pesquisa/TAREFAS-MODO-FOCO-E-RESUMO-DO-JARVIS-2026-09-10.md` §5 — e não se inventa evento na
 * tela.
 */

export interface DadosModoFoco {
  tarefas: TarefaVisao[];
  meuId: string | null;
  mencionaveis: Mencionavel[];
  tiposTarefa: TipoTarefa[];
  /** por id de tarefa: o fio, o canal e a ficha do lead (ensaio). Vazio = coluna direita honesta. */
  contexto: Record<string, ContextoFoco>;
  ensaio: boolean;
  estadoCookie: EstadoTarefasEnsaio | null;
  /** F8: `tarefa_iniciada` existe neste ambiente? sem ele, entrar na tarefa não grava nada */
  podeIniciar: boolean;
}

type Painel = "concluir" | "adiar" | null;

export function ModoFoco({ dados }: { dados: DadosModoFoco }) {
  const router = useRouter();
  const mov = useMovimento();
  const { tarefas: base, meuId, mencionaveis, tiposTarefa, contexto, ensaio, estadoCookie, podeIniciar } = dados;

  const [agora] = useState(() => Date.now());
  const nomes = useMemo(() => new Map(mencionaveis.map((m) => [m.id, m.nome])), [mencionaveis]);
  const pessoas = useMemo<PessoaAtiva[]>(() => mencionaveis.map((m) => ({ id: m.id, nome: m.nome })), [mencionaveis]);

  // ── o estado da sessão: escritas locais (ensaio) + a fila congelada ──
  const [escritas, setEscritas] = useState<EscritasEnsaio>(() => {
    if (!ensaio || !estadoCookie) return escritasVazias();
    return escritasDoCookie(estadoCookie, nomes);
  });
  const tarefas = useMemo(() => (ensaio ? aplicarEscritas(base, escritas, agora) : base), [ensaio, base, escritas, agora]);

  const [sessao, setSessao] = useState<SessaoFocoCookie>(() => {
    const guardada = estadoCookie?.sessao;
    // a ordem só é reaproveitada se ainda sobrar alguma tarefa dela: sessão de ontem no cookie
    // devolveria uma fila vazia num dia cheio.
    if (guardada && guardada.ordem.some((id) => base.some((t) => t.id === id && t.status === "pendente"))) return guardada;
    return { iniciada_em: new Date(agora).toISOString(), ordem: ordemInicial(base, agora), puladas: [], iniciadas: [] };
  });

  const cookieRef = useRef<EstadoTarefasEnsaio>(estadoCookie ?? ESTADO_TAREFAS_VAZIO);
  const persistir = useCallback(
    (muda: (e: EstadoTarefasEnsaio) => EstadoTarefasEnsaio) => {
      if (!ensaio) return;
      cookieRef.current = muda(cookieRef.current);
      void gravarEnsaioTarefas(cookieRef.current);
    },
    [ensaio],
  );

  const fila = useMemo(() => filaDoFoco(tarefas, sessao, agora), [tarefas, sessao, agora]);
  const [atualId, setAtualId] = useState<string | null>(null);
  const { atual, indice, feitas } = posicaoNoFoco(fila, atualId);

  // ── o log do percurso: é o que a tela "zero por hoje" mostra ──
  const [log, setLog] = useState<ItemAcao[]>([]);
  const [painel, setPainel] = useState<Painel>(null);
  const [eAgora, setEAgora] = useState<ConcluidaAgora | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // entrar numa tarefa é um fato: `tarefa_iniciada` (F8). Uma vez por tarefa por sessão.
  const jaIniciadas = useRef(new Set<string>());
  useEffect(() => {
    if (!atual || jaIniciadas.current.has(atual.id)) return;
    jaIniciadas.current.add(atual.id);
    setSessao((s) => (s.iniciadas.includes(atual.id) ? s : { ...s, iniciadas: [...s.iniciadas, atual.id] }));
    if (ensaio) {
      setEscritas((e) => comEvento({ ...e, iniciadas: new Set(e.iniciadas).add(atual.id) }, atual.id, { quando: new Date().toISOString(), tipo: "iniciada", texto: "aberta no modo foco" }));
      persistir((c) => ({ ...c, sessao: c.sessao ? { ...c.sessao, iniciadas: [...new Set([...c.sessao.iniciadas, atual.id])] } : null }));
    } else if (podeIniciar) {
      void iniciarTarefa(atual.id, atual.lead_id);
    }
  }, [atual, ensaio, podeIniciar, persistir]);

  // a sessão inteira vai para o cookie sempre que a ordem/puladas mudam
  useEffect(() => {
    persistir((c) => ({ ...c, sessao }));
  }, [sessao, persistir]);

  function registrar(t: TarefaVisao, estado: ItemAcao["estado"], badge: string) {
    setLog((l) => [...l.filter((x) => x.id !== t.id), { id: t.id, titulo: t.titulo, estado, badge, detalhe: t.lead_nome ?? undefined }]);
  }

  function avancar(deId: string) {
    setAtualId(depoisDe(fila.pendentes, deId));
    setPainel(null);
    setErro(null);
  }

  // ── as escritas: ensaio = local + cookie; produção = as mesmas server actions da lista ──
  async function concluir(t: TarefaVisao, resultado: string): Promise<ResultadoEvento> {
    if (ensaio) {
      setEscritas((e) => ({ ...e, concluidas: new Map(e.concluidas).set(t.id, resultado) }));
      persistir((c) => ({ ...c, concluidas: { ...c.concluidas, [t.id]: { resultado, em: new Date().toISOString() } } }));
      return { ok: true };
    }
    return t.lead_id ? concluirTarefaLead(t.lead_id, t.id, resultado) : concluirTarefaNotificacao(t.id, resultado);
  }

  async function adiar(t: TarefaVisao, prazoIso: string, motivo: string): Promise<ResultadoEvento> {
    const texto = `${motivo} · novo prazo ${dataHoraCurta(prazoIso)}`;
    if (ensaio) {
      setEscritas((e) => comEvento({ ...e, prazos: new Map(e.prazos).set(t.id, prazoIso) }, t.id, { quando: new Date().toISOString(), tipo: "adiada", texto }));
      persistir((c) => ({ ...c, prazos: { ...c.prazos, [t.id]: { prazo: prazoIso, motivo: texto, em: new Date().toISOString() } } }));
      return { ok: true };
    }
    if (!t.lead_id) return { ok: false, motivo: "tarefa sem lead não tem prazo repactuável por aqui" };
    return repactuarPrazoTarefaLead(t.lead_id, t.id, prazoIso, motivo);
  }

  async function criar(d: NovaTarefa): Promise<ResultadoEvento> {
    if (!ensaio) return criarTarefaLead(d.leadId, { titulo: d.titulo, tipo: d.tipo, responsavelId: d.responsavelId, prazoIso: d.prazoIso, mencoes: [] });
    const nova: TarefaVisao = {
      id: idNovoEnsaio(escritas.criadas.length + 1),
      lead_id: d.leadId,
      lead_nome: d.leadNome,
      titulo: d.titulo,
      descricao: null,
      tipo: d.tipo,
      responsavel: null,
      responsavel_id: d.responsavelId,
      prazo: d.prazoIso,
      status: "pendente",
      resultado: null,
      motivo_arquivo: null,
      criado_em: new Date().toISOString(),
      concluida_em: null,
      vencida: false,
      por_que: null,
      fazer: null,
      trecho: null,
      origem: null,
      prioridade: d.prioridade ?? null,
      historico: [{ quando: new Date().toISOString(), tipo: "criada", texto: "criada ao concluir a anterior (“e agora?”)" }],
    };
    setEscritas((e) => ({ ...e, criadas: [...e.criadas, nova] }));
    persistir((c) => ({
      ...c,
      criadas: [
        ...c.criadas,
        { id: nova.id, lead_id: nova.lead_id, lead_nome: nova.lead_nome, titulo: nova.titulo, tipo: nova.tipo, responsavel_id: nova.responsavel_id, prazo: nova.prazo, prioridade: nova.prioridade ?? null, criado_em: nova.criado_em, depois_de: eAgora?.tarefa.id ?? null },
      ],
    }));
    return { ok: true };
  }

  // ── as três saídas de uma tarefa ──
  async function aoConcluir(resultado: string) {
    if (!atual) return;
    const d = desfechoDaConclusao(resultado);
    if (!d.ok) {
      setErro(d.motivo);
      return;
    }
    const r = await concluir(atual, d.desfecho);
    if (!r.ok) {
      setErro(r.motivo ?? "não foi possível concluir");
      return;
    }
    registrar(atual, "feito", horaCurta());
    setPainel(null);
    setErro(null);
    if (atual.lead_id) setEAgora({ tarefa: atual, resultado: d.desfecho });
    else avancar(atual.id);
  }

  async function aoAdiar(prazoIso: string, motivo: string) {
    if (!atual) return;
    const r = await adiar(atual, prazoIso, motivo);
    if (!r.ok) {
      setErro(r.motivo ?? "não foi possível adiar");
      return;
    }
    registrar(atual, "pendente", "adiada");
    avancar(atual.id);
  }

  function aoPular() {
    if (!atual) return;
    const id = atual.id;
    registrar(atual, "atencao", "pulada");
    setSessao((s) => (s.puladas.includes(id) ? s : { ...s, puladas: [...s.puladas, id] }));
    avancar(id);
  }

  function abrirConversa() {
    const t = eAgora?.tarefa ?? atual;
    if (!t) return;
    const d = destinoDaTarefa(t);
    if (d) router.push(d);
  }

  function sair() {
    router.push("/tarefas");
  }

  // ── ATALHOS: ⏎ concluir · A adiar · P pular · J composer · ↑/↓ anda · Esc sai ──
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const emCampo = !!alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      if (e.key === "Escape") {
        if (emCampo) return; // o próprio campo devolve o teclado
        if (eAgora) {
          const id = eAgora.tarefa.id;
          setEAgora(null);
          avancar(id);
          return;
        }
        if (painel) {
          setPainel(null);
          return;
        }
        sair();
        return;
      }
      if (emCampo || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[data-slot="dialog-content"],[data-slot="dropdown-menu-content"],[data-slot="select-content"]')) return;
      if (!atual) return;
      switch (e.key) {
        case "Enter":
          e.preventDefault();
          setPainel((p) => (p === "concluir" ? null : "concluir"));
          break;
        case "a":
        case "A":
          e.preventDefault();
          setPainel((p) => (p === "adiar" ? null : "adiar"));
          break;
        case "p":
        case "P":
          e.preventDefault();
          aoPular();
          break;
        case "j":
        case "J":
          e.preventDefault();
          composerRef.current?.focus();
          break;
        case "ArrowDown":
        case "ArrowRight":
          e.preventDefault();
          setAtualId(fila.pendentes[indice + 1]?.id ?? atual.id);
          setPainel(null);
          break;
        case "ArrowUp":
        case "ArrowLeft":
          e.preventDefault();
          setAtualId(fila.pendentes[indice - 1]?.id ?? atual.id);
          setPainel(null);
          break;
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual, indice, fila.pendentes, painel, eAgora]);

  /*
   * ENQUANTO O "E AGORA?" ESTÁ ABERTO, A TELA NÃO ANDA.
   *
   * `atual` é derivado da fila viva, e concluir tira a tarefa dela — então, no instante do ⏎, a
   * próxima já era `pendentes[0]` e a tela trocava de lead por baixo da pergunta: a coluna da
   * esquerda perguntava "e agora com a Maria?" e a conversa ao lado já era da Cleusa (medido no
   * print `/tmp/wt-foco-eagora.png`, primeira versão). A pergunta é sobre o lead com quem você
   * ACABOU de falar — a conversa dele tem de continuar à vista até ela ser respondida.
   */
  const naTela = eAgora?.tarefa ?? atual;
  const posicao = eAgora ? Math.max(1, feitas) : Math.min(feitas + indice + 1, fila.total);
  const progresso = naTela ? posicao / Math.max(1, fila.total) : 1;

  // no ensaio, responder daqui acrescenta a mensagem ao fio local — em produção o envio não sai
  // desta tela (o composer diz isso e oferece a conversa).
  const [enviadas, setEnviadas] = useState<Record<string, ContextoFoco["fio"]>>({});
  const ctxBase = naTela ? (contexto[naTela.id] ?? null) : null;
  const ctx = useMemo<ContextoFoco | null>(() => {
    if (!ctxBase) return null;
    const extra = enviadas[ctxBase.lead_id];
    return extra?.length ? { ...ctxBase, fio: [...ctxBase.fio, ...extra] } : ctxBase;
  }, [ctxBase, enviadas]);

  const enviar = ensaio && ctxBase
    ? async ({ texto, interna }: EnvioDoFoco) => {
        const leadId = ctxBase.lead_id;
        setEnviadas((m) => ({
          ...m,
          [leadId]: [
            ...(m[leadId] ?? []),
            { id: `foco-${leadId}-${(m[leadId]?.length ?? 0) + 1}`, de: "nos" as const, autor: interna ? "nota interna" : (nomes.get(meuId ?? "") ?? "você"), corpo: texto, em: new Date().toISOString(), tipo: interna ? "nota" : "texto" },
          ],
        }));
      }
    : null;

  return (
    <div className="flex h-[calc(100vh-var(--altura-topo))] flex-col bg-board">
      <Faixa
        rotulo={naTela ? `${posicao} de ${fila.total}` : `${fila.total} de ${fila.total}`}
        progresso={progresso}
        log={log}
        onSair={sair}
      />

      {naTela ? (
        <div className="grid min-h-0 flex-1 gap-4 px-6 pb-6 pt-4 xl:grid-cols-[minmax(380px,0.85fr)_minmax(0,1.15fr)]">
          {/* ── A TAREFA ── */}
          <div className="flex max-h-full min-h-0 flex-col self-start overflow-y-auto rounded-lg border border-linha bg-branco px-6 py-5">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={naTela.id} variants={mov.lista} initial="hidden" animate="visible" className="flex min-h-0 flex-col">
                {/* a fila do foco é sempre em primeira pessoa — o responsável não se repete aqui */}
                <p className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-mute">
                  {naTela.lead_nome && <span className="font-medium text-suave">{naTela.lead_nome}</span>}
                  {naTela.lead_nome && naTela.tipo && <span aria-hidden className="text-linha-forte">·</span>}
                  {naTela.tipo && <span>{tiposTarefa.find((x) => x.chave === naTela.tipo)?.rotulo ?? naTela.tipo}</span>}
                </p>

                {/* a ÚNICA coisa grande da tela */}
                <h1 className="mt-1 text-[26px] font-semibold leading-[1.22] tracking-[-0.011em] text-tinta">{naTela.titulo}</h1>
                <p className={cn("mt-1.5 text-[13px]", naTela.vencida ? "font-medium text-vermelho" : "text-mute")}>{textoPrazoHumano(naTela, agora)}</p>

                {naTela.resumo && (
                  <ResumoJarvisBloco
                    resumo={naTela.resumo}
                    t={naTela}
                    tamanho="foco"
                    caixa
                    onVerNoFio={destinoDaTarefa(naTela) ? abrirConversa : undefined}
                    className="mt-4"
                  />
                )}
                {!naTela.resumo && naTela.descricao && <p className="mt-4 max-w-[70ch] whitespace-pre-line text-[14px] leading-[1.55] text-suave">{naTela.descricao}</p>}

                <div className="mt-5">
                  <AnimatePresence initial={false} mode="wait">
                    {eAgora ? (
                      <motion.div key="e-agora" variants={mov.abrir} initial="hidden" animate="visible" exit="exit">
                        <div className="rounded-md border border-linha bg-board px-4 py-3.5">
                          <CorpoEAgora
                            compacto
                            concluida={eAgora}
                            pessoas={pessoas}
                            tiposTarefa={tiposTarefa}
                            meuId={meuId}
                            agora={agora}
                            criar={criar}
                            onFechar={() => {
                              const id = eAgora.tarefa.id;
                              setEAgora(null);
                              avancar(id);
                            }}
                          />
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div key="acoes" variants={mov.abrir} initial="hidden" animate="visible" exit="exit">
                        <Acoes
                          painel={painel}
                          agora={agora}
                          temConversa={destinoDaTarefa(naTela) != null}
                          onPainel={(p) => {
                            setPainel(p);
                            setErro(null);
                          }}
                          onConcluir={aoConcluir}
                          onAdiar={aoAdiar}
                          onPular={aoPular}
                          onAbrirConversa={abrirConversa}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {erro && <p className="mt-2 text-[12.5px] font-medium text-vermelho">{erro}</p>}
                </div>

                <Atalhos />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── A CONVERSA ── */}
          <ConversaDoFoco
            contexto={ctx}
            agoraMs={agora}
            onAbrirConversa={destinoDaTarefa(naTela) ? abrirConversa : null}
            onEnviar={enviar}
            composerRef={composerRef}
            className="min-h-0"
          />
        </div>
      ) : (
        <Zero log={log} puladas={fila.puladas} onSair={sair} />
      )}
    </div>
  );
}

function horaCurta(): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date());
}

/**
 * A faixa de cima: sair, onde estou, e um filete de progresso. 2px de altura — barra grossa vira
 * o assunto da tela, e o assunto é o lead.
 */
function Faixa({ rotulo, progresso, log, onSair }: { rotulo: string; progresso: number; log: ItemAcao[]; onSair: () => void }) {
  const feitas = log.filter((i) => i.estado === "feito").length;
  const adiadas = log.filter((i) => i.badge === "adiada").length;
  const puladas = log.filter((i) => i.badge === "pulada").length;
  const resumo = [feitas > 0 && `${feitas} ${feitas === 1 ? "concluída" : "concluídas"}`, adiadas > 0 && `${adiadas} ${adiadas === 1 ? "adiada" : "adiadas"}`, puladas > 0 && `${puladas} ${puladas === 1 ? "pulada" : "puladas"}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <header className="flex-shrink-0 border-b border-linha bg-branco">
      <div className="flex items-center gap-3 px-6 py-2.5">
        <button type="button" onClick={onSair} className="inline-flex items-center gap-1.5 text-[13px] text-mute transition-colors hover:text-tinta">
          <ArrowLeftIcon className="size-3.5" aria-hidden />
          Tarefas
        </button>
        <p className="text-[13px] text-suave">
          <span className="font-medium tabular-nums text-tinta">{rotulo}</span> · Hoje
        </p>
        {resumo && <p className="text-[12.5px] text-mute">{resumo}</p>}
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-mute">
          Sair
          <kbd className="rounded border border-linha-forte px-1 font-mono text-[10px]">Esc</kbd>
        </span>
      </div>
      <div className="h-[2px] w-full bg-linha" role="progressbar" aria-valuenow={Math.round(progresso * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Posição na fila do dia">
        <div className="h-full bg-laranja transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${progresso * 100}%` }} />
      </div>
    </header>
  );
}

/** as ações grandes — e o painel que cada uma abre, no lugar, sem diálogo */
function Acoes({
  painel,
  agora,
  temConversa,
  onPainel,
  onConcluir,
  onAdiar,
  onPular,
  onAbrirConversa,
}: {
  painel: Painel;
  agora: number;
  temConversa: boolean;
  onPainel: (p: Painel) => void;
  onConcluir: (resultado: string) => Promise<void>;
  onAdiar: (prazoIso: string, motivo: string) => Promise<void>;
  onPular: () => void;
  onAbrirConversa: () => void;
}) {
  const [resultado, setResultado] = useState("");
  const [outroMotivo, setOutroMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const presets = useMemo(() => presetsAdiar(agora), [agora]);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (painel === "concluir") campo.current?.focus();
    if (painel === null) {
      setResultado("");
      setOutroMotivo("");
    }
  }, [painel]);

  async function confirmar() {
    if (ocupado) return;
    setOcupado(true);
    await onConcluir(resultado);
    setOcupado(false);
    setResultado("");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => onPainel(painel === "concluir" ? null : "concluir")} aria-pressed={painel === "concluir"}>
          <CheckIcon aria-hidden />
          Concluir
          <kbd className="ml-0.5 font-mono text-[10px] opacity-70">⏎</kbd>
        </Button>
        <Button variant="outline" onClick={() => onPainel(painel === "adiar" ? null : "adiar")} aria-pressed={painel === "adiar"}>
          <CalendarClockIcon aria-hidden />
          Adiar
          <kbd className="ml-0.5 font-mono text-[10px] text-mute">A</kbd>
        </Button>
        <Button variant="ghost" onClick={onPular} className="text-suave">
          <SkipForwardIcon aria-hidden />
          Pular
          <kbd className="ml-0.5 font-mono text-[10px] text-mute">P</kbd>
        </Button>
        {temConversa && (
          <Button variant="ghost" onClick={onAbrirConversa} className="ml-auto text-suave">
            Abrir conversa
            <ArrowUpRightIcon aria-hidden />
          </Button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {painel === "concluir" && (
          <motion.div key="concluir" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex items-center gap-2 pt-0.5">
              <input
                ref={campo}
                value={resultado}
                onChange={(e) => setResultado(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void confirmar();
                  if (e.key === "Escape") onPainel(null);
                }}
                placeholder="Resultado — o que aconteceu?"
                aria-label="Resultado da tarefa (obrigatório)"
                className="min-w-0 flex-1 rounded-md border border-linha-forte bg-branco px-3 py-2 text-[14px] outline-none focus:border-laranja"
              />
              <Button onClick={() => void confirmar()} disabled={ocupado || resultado.trim() === ""}>
                {ocupado ? "Concluindo…" : "Concluir"}
              </Button>
            </div>
            <p className="mt-1.5 text-[12px] text-mute">Sem resultado a tarefa não fecha — é o que separa “ligou” de “ligou e ela remarcou”.</p>
          </motion.div>
        )}
        {painel === "adiar" && (
          <motion.div key="adiar" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {presets.map((p) => (
                <Button key={p.chave} variant="outline" size="sm" onClick={() => void onAdiar(p.prazoIso, outroMotivo.trim() || p.motivo)} className="text-[13px]">
                  {p.rotulo}
                </Button>
              ))}
            </div>
            <input
              value={outroMotivo}
              onChange={(e) => setOutroMotivo(e.target.value)}
              placeholder="Motivo (opcional — o preset já serve de motivo)"
              aria-label="Motivo do adiamento"
              className="mt-2 w-full rounded-md border border-linha bg-branco px-3 py-1.5 text-[13px] outline-none focus:border-laranja"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Atalhos() {
  const itens: [string, string][] = [["⏎", "concluir"], ["A", "adiar"], ["P", "pular"], ["J", "responder"], ["↑↓", "andar"], ["Esc", "sair"]];
  return (
    <ul className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-linha pt-3 text-[11.5px] text-mute">
      {itens.map(([tecla, o]) => (
        <li key={tecla} className="inline-flex items-center gap-1">
          <kbd className="rounded border border-linha-forte px-1 font-mono text-[10px]">{tecla}</kbd>
          {o}
        </li>
      ))}
    </ul>
  );
}

/**
 * "Zero por hoje" — o fim do percurso. Não é uma celebração: é a prestação de contas do que foi
 * feito (riscado, com a hora) e do que ficou (as puladas, que continuam pendentes e ninguém
 * adiou). A lista é a `ListaDeAcoes` do W-J, para o fim do dia se parecer com o percurso.
 */
function Zero({ log, puladas, onSair }: { log: ItemAcao[]; puladas: TarefaVisao[]; onSair: () => void }) {
  const feitas = log.filter((i) => i.estado === "feito").length;
  const restantes: ItemAcao[] = puladas.map((t) => ({ id: `pulada-${t.id}`, titulo: t.titulo, estado: "atencao", badge: "pulada", detalhe: t.lead_nome ?? undefined }));

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-[640px]">
        <h1 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.011em] text-tinta">
          {log.length === 0 ? "Nada na fila de hoje." : "Zero por hoje."}
        </h1>
        <p className="mt-1.5 text-[14px] text-suave">
          {log.length === 0
            ? "Nada vencido e nada com prazo para hoje. O que vem depois está na aba Semana."
            : `${feitas} ${feitas === 1 ? "tarefa concluída" : "tarefas concluídas"}${puladas.length > 0 ? ` · ${puladas.length} ${puladas.length === 1 ? "pulada" : "puladas"} continuam abertas` : ""}. O que vem depois está na aba Semana.`}
        </p>

        {log.length > 0 && (
          <div className="mt-6 rounded-lg border border-linha bg-branco px-5 py-4">
            <ListaDeAcoes itens={log} rotulo="O que você fez" />
          </div>
        )}
        {restantes.length > 0 && (
          <div className="mt-3 rounded-lg border border-linha bg-branco px-5 py-4">
            <ListaDeAcoes itens={restantes} rotulo="Puladas — voltam amanhã se ninguém mexer" />
          </div>
        )}

        <div className="mt-6 flex items-center gap-2">
          <Button onClick={onSair}>Voltar para as tarefas</Button>
        </div>
      </div>
    </div>
  );
}
