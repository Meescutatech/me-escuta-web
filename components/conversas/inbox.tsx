"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ConversaResumo, Mensagem, ModoConversa, SugestaoMensagem } from "@/lib/dados/conversas";
import {
  assumirConversa,
  devolverConversa,
  enviarMensagem,
  validarSugestaoMensagem,
} from "@/app/(app)/conversas/actions";
import { EstadoEntregaIcone } from "@/components/conversas/estado-entrega";
import { useConversaViva } from "@/components/conversas/tempo-real";
import {
  fronteiraNaoLidas,
  montarBlocos,
  motivoErroPermanente,
  pendentesVivas,
  podeTentarDeNovo,
} from "@/lib/conversas/thread";
import { diasNaEtapa } from "@/lib/tempo";
import { cn } from "@/lib/utils";

/*
 * /conversas — redesign "Kommo minimalista" (fase 2) + thread real (rodada 4, SPEC RF-27..33).
 * Spec visual: Product_Management/Design/conversa-v2.html (3 zonas, tokens). Comportamento:
 * SPEC-PIPELINE-MENSAGENS — agrupamento de rajada 60s, checks de entrega da projeção da Trilha A
 * (check SOME quando não há status — nunca check mentiroso), separador de dia sticky, divider de
 * não-lidas + pill sem roubar scroll, lista viva, Realtime como dica + refetch como verdade,
 * optimistic UI que preserva o texto na falha. Lógica de escrita INTOCADA (actions/RPC-porta).
 */

const ORIGEM_ROTULO: Record<string, string> = {
  wa: "WhatsApp", whatsapp: "WhatsApp", ig: "Instagram", instagram: "Instagram",
  meta: "Meta Ads", "meta ads": "Meta Ads", facebook: "Meta Ads", ind: "Indicação", indicacao: "Indicação",
};

function fmtTelefone(t: string | null): string {
  if (!t) return "—";
  let d = t.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}
function iniciais(nome: string): string {
  const p = nome.replace(/→|·/g, " ").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1] ? p[1][0] : "")).toUpperCase();
}
/** nome null / lixo de anúncio → usa o telefone como título (mesma regra do funil). */
function nomeRuim(nome: string | null): boolean {
  if (!nome) return true;
  const n = nome.trim();
  if (n.length < 2) return true;
  if (/^(facebook|instagram|meta|whats?app|lead|cliente|contato|novo lead|sem nome)\b/i.test(n)) return true;
  if (/n[º°o]\s*\d/i.test(n)) return true;
  if (!/[a-zà-ú]/i.test(n)) return true;
  return false;
}
function hhmm(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** Hora da lista: hoje→hh:mm · ontem→"ontem" · <7d→dia da semana · senão dd/mm. */
function tempoLista(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const agora = new Date();
  const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const dia0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const difDias = Math.round((hoje0 - dia0) / 86400000);
  if (difDias <= 0) return hhmm(iso);
  if (difDias === 1) return "ontem";
  if (difDias < 7) return DIAS[d.getDay()];
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function moeda(v: number | null | undefined): string {
  return v == null ? "" : "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function textoNaEtapa(iso: string | null | undefined): string {
  const dd = diasNaEtapa(iso ?? null, Date.now());
  if (dd == null) return "—";
  return dd === 0 ? "hoje" : dd === 1 ? "1 dia" : `${dd} dias`;
}

type Aba = "todas" | "clara" | "humano" | "nao_lidas";

export function Inbox({
  conversas,
  fonte,
  selecionadaId,
  mensagens,
  sugestoes,
}: {
  conversas: ConversaResumo[];
  fonte: "real" | "mock";
  selecionadaId: string | null;
  mensagens: Mensagem[];
  sugestoes: SugestaoMensagem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selecionada = conversas.find((c) => c.id === selecionadaId) ?? null;

  // pendentes = bolhas otimistas locais (RF-32); a lista do servidor é sempre a verdade e a
  // reconciliação remove a pendente quando a projeção confirma a mensagem (match por corpo).
  const [pendentes, setPendentes] = useState<Mensagem[]>([]);
  const [props_, setProps] = useState<SugestaoMensagem[]>(sugestoes);
  const [mode, setMode] = useState<ModoConversa>(selecionada?.mode ?? "IA");
  const [rascunho, setRascunho] = useState("");
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<Aba>("todas");
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ctxColapsado, setCtxColapsado] = useState(false);
  const [novas, setNovas] = useState(0); // pill "N novas" quando o scroll está lá em cima (RF-30)
  const [fronteira, setFronteira] = useState<{ primeiraId: string; qtd: number } | null>(null);

  const rolagemRef = useRef<HTMLDivElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const divisorRef = useRef<HTMLDivElement>(null);
  const noFimRef = useRef(true);
  const totalAnteriorRef = useRef(-1); // -1 = próxima renderização é abertura de conversa

  // Realtime (dica) + polling (fallback) → refetch das projeções (RF-9/32)
  useConversaViva(selecionadaId, fonte === "real");

  // cada refetch re-sincroniza com o servidor (a verdade é a projeção; o rascunho/edição ficam)
  useEffect(() => {
    setProps(sugestoes);
    setMode(selecionada?.mode ?? "IA");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugestoes, selecionada?.mode]);

  // troca de conversa: zera estado local e calcula a fronteira de não-lidas UMA vez (RF-30)
  useEffect(() => {
    setPendentes([]);
    setEditando(null);
    setNovas(0);
    setFronteira(fronteiraNaoLidas(mensagens));
    noFimRef.current = true;
    totalAnteriorRef.current = -1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionadaId]);

  // poda pendentes confirmadas do ESTADO, não só do render: confirmação é irreversível — se a
  // linha confirmada depois virar 'falhou', a pendente não pode ressuscitar como bolha fantasma
  // "aguardando fila" ao lado da bolha de erro (nem inflar visiveis.length → pill "1 nova" falsa).
  useEffect(() => {
    setPendentes((p) => {
      const vivas = pendentesVivas(p, mensagens);
      return vivas.length === p.length ? p : vivas;
    });
  }, [mensagens]);

  // mensagens visíveis = servidor + pendentes ainda não confirmadas pela projeção
  const visiveis = useMemo(
    () => [...mensagens, ...pendentesVivas(pendentes, mensagens)],
    [mensagens, pendentes],
  );

  const blocos = useMemo(() => montarBlocos(visiveis), [visiveis]);

  // abertura → âncora no divider de não-lidas (ou no fim); mensagem nova → rola só se já estava
  // no fim, senão vira contador na pill — NUNCA rouba o scroll da Sara (RF-30)
  useEffect(() => {
    const total = visiveis.length;
    if (totalAnteriorRef.current === -1) {
      const alvo = divisorRef.current ?? fimRef.current;
      const centro = !!divisorRef.current;
      requestAnimationFrame(() => alvo?.scrollIntoView({ block: centro ? "center" : "end" }));
    } else if (total > totalAnteriorRef.current) {
      if (noFimRef.current) fimRef.current?.scrollIntoView({ behavior: "smooth" });
      else setNovas((v) => v + (total - totalAnteriorRef.current));
    }
    totalAnteriorRef.current = total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis.length]);

  function aoRolar() {
    const el = rolagemRef.current;
    if (!el) return;
    const nf = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    noFimRef.current = nf;
    if (nf) setNovas(0);
  }

  function irProFim() {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
    setNovas(0);
  }

  // painel de contexto auto-recolhe em tela estreita (thread respira) — spec §2
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1180) setCtxColapsado(true);
  }, []);

  function avisar(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  }

  // filtros da lista (RF-31): Todas · Clara conduz · Humano conduz · Não lidas
  const contagens = useMemo(
    () => ({
      todas: conversas.length,
      clara: conversas.filter((c) => c.mode === "IA").length,
      humano: conversas.filter((c) => c.mode === "HUMANO").length,
      nao_lidas: conversas.filter((c) => c.nao_lida).length,
    }),
    [conversas],
  );

  const conversasVisiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return conversas.filter((c) => {
      if (aba === "clara" && c.mode !== "IA") return false;
      if (aba === "humano" && c.mode !== "HUMANO") return false;
      if (aba === "nao_lidas" && !c.nao_lida) return false;
      if (!q) return true;
      return (c.nome ?? "").toLowerCase().includes(q) || (c.telefone ?? "").includes(q);
    });
  }, [conversas, busca, aba]);

  function abrir(id: string) {
    router.push(`/conversas?c=${id}`);
  }

  function trocarModo(alvo: ModoConversa) {
    if (!selecionada || alvo === mode) return;
    const assumir = alvo === "HUMANO";
    setMode(alvo); // otimista
    startTransition(async () => {
      const r = assumir ? await assumirConversa(selecionada.id) : await devolverConversa(selecionada.id);
      if (!r.ok) {
        setMode(assumir ? "IA" : "HUMANO");
        avisar(`Falha no transbordo: ${r.motivo ?? "erro"}`);
      } else {
        avisar(assumir ? "Você assumiu — Clara pausou nesta conversa." : "Devolvido — Clara retoma.");
        router.refresh();
      }
    });
  }

  /** Despacha texto pro backend com bolha otimista; falha NÃO descarta o texto (RF-32). */
  function despachar(texto: string, idPendente?: string) {
    if (!selecionada) return;
    const id = idPendente ?? `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (idPendente) {
      setPendentes((p) => p.map((m) => (m.id === id ? { ...m, falha_local: false } : m)));
    } else {
      setPendentes((p) => [
        ...p,
        {
          id,
          direcao: "saida",
          tipo_conteudo: "texto",
          corpo: texto,
          criado_em: new Date().toISOString(),
          pendente: true,
          autor: mode === "HUMANO" ? "sara" : "clara",
        },
      ]);
      requestAnimationFrame(() => fimRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
    startTransition(async () => {
      const r = await enviarMensagem(selecionada.id, texto);
      if (r.ok) {
        router.refresh();
      } else {
        setPendentes((p) => p.map((m) => (m.id === id ? { ...m, falha_local: true } : m)));
        avisar(`Falha ao enviar: ${r.motivo ?? "erro"}`);
      }
    });
  }

  function enviar() {
    const texto = rascunho.trim();
    if (!texto || !selecionada) return;
    setRascunho("");
    despachar(texto);
  }

  /**
   * RF-28: reenvio de mensagem que a PROJEÇÃO marcou 'falhou' — evento NOVO na porta com o
   * mesmo corpo (a porta gera novo dedup_id; a falhada fica no ledger, imutável). Sem bolha
   * otimista aqui: a verdade é a nova linha da projeção, que o refresh traz como 'na_fila'.
   */
  function reenviar(m: Mensagem) {
    if (!selecionada || !m.corpo) return;
    startTransition(async () => {
      const r = await enviarMensagem(selecionada.id, m.corpo!);
      if (r.ok) {
        avisar("Reenviado — nova tentativa na fila.");
        router.refresh();
      } else {
        avisar(`Falha ao reenviar: ${r.motivo ?? "erro"}`);
      }
    });
  }

  function aprovar(sug: SugestaoMensagem, textoFinal: string) {
    const editado = textoFinal.trim() !== sug.corpo.trim();
    setProps((p) => p.filter((s) => s.id !== sug.id));
    setEditando(null);
    setPendentes((p) => [
      ...p,
      {
        id: `apv-${sug.id}`,
        direcao: "saida",
        tipo_conteudo: "texto",
        corpo: textoFinal,
        criado_em: new Date().toISOString(),
        autor: "clara",
        pendente: true,
      },
    ]);
    startTransition(async () => {
      const r = editado
        ? await validarSugestaoMensagem(sug.id, "corrigida", { ...sug.payload, corpo: textoFinal })
        : await validarSugestaoMensagem(sug.id, "aprovada");
      if (r.ok) {
        avisar(editado ? "Resposta editada e aprovada — vai pra fila de envio." : "Resposta aprovada — vai pra fila de envio.");
        router.refresh();
      } else {
        setProps((p) => [sug, ...p]);
        setPendentes((p) => p.filter((m) => m.id !== `apv-${sug.id}`));
        avisar(`Falha ao validar: ${r.motivo ?? "erro"}`);
      }
    });
  }

  function descartar(sug: SugestaoMensagem) {
    setProps((p) => p.filter((s) => s.id !== sug.id));
    if (editando?.id === sug.id) setEditando(null);
    startTransition(async () => {
      const r = await validarSugestaoMensagem(sug.id, "rejeitada");
      if (r.ok) {
        avisar("Proposta descartada.");
        router.refresh();
      } else {
        setProps((p) => [sug, ...p]);
        avisar(`Falha ao descartar: ${r.motivo ?? "erro"}`);
      }
    });
  }

  const modoClara = mode === "IA";
  const titulo = selecionada
    ? nomeRuim(selecionada.nome)
      ? fmtTelefone(selecionada.telefone)
      : selecionada.nome!
    : "";
  const origemLabel = selecionada?.origem ? ORIGEM_ROTULO[selecionada.origem.toLowerCase()] ?? selecionada.origem : null;

  return (
    <div className="flex h-[calc(100vh-58px)] bg-board">
      {/* ═══════════ ZONA 1 · LISTA ═══════════ */}
      <aside className="flex w-[302px] shrink-0 flex-col border-r border-linha bg-branco">
        <div className="px-4 pb-2.5 pt-3.5">
          <h1 className="mb-2.5 font-serif text-[1.24rem] font-semibold leading-none text-navy">Conversas</h1>
          <label className="flex items-center gap-2 rounded-lg border border-linha bg-board px-2.5 py-1.5 focus-within:border-linha-forte">
            <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" className="h-[14px] w-[14px] shrink-0 stroke-mute" fill="none">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar conversa, telefone…"
              className="w-full bg-transparent text-[0.82rem] text-tinta outline-none placeholder:text-mute"
            />
          </label>
        </div>
        <div className="flex gap-3 px-4 pb-1.5 pt-2.5">
          {([
            ["todas", `Todas · ${contagens.todas}`],
            ["clara", `Clara · ${contagens.clara}`],
            ["humano", `Humano · ${contagens.humano}`],
            ["nao_lidas", `Não lidas · ${contagens.nao_lidas}`],
          ] as [Aba, string][]).map(([k, rot]) => (
            <button
              key={k}
              onClick={() => setAba(k)}
              className={cn(
                "border-b-[1.5px] pb-1.5 text-[0.8rem] transition-colors focus-visible:outline-none",
                aba === k ? "border-navy font-semibold text-navy" : "border-transparent text-mute hover:text-tinta",
              )}
            >
              {rot}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 pt-0.5">
          {conversasVisiveis.length === 0 && (
            <p className="px-3 pt-6 text-center text-[0.8rem] text-mute">
              {conversas.length === 0 ? "Nenhuma conversa ainda." : "Nenhuma conversa aqui."}
            </p>
          )}
          {conversasVisiveis.map((c) => {
            const ativa = c.id === selecionadaId;
            const ia = c.mode === "IA";
            const ruim = nomeRuim(c.nome);
            const rotulo = ruim ? fmtTelefone(c.telefone) : c.nome!;
            const org = c.origem ? ORIGEM_ROTULO[c.origem.toLowerCase()] ?? c.origem : null;
            const prev = c.previa
              ? (c.previa_saida ? "Você: " : "") + c.previa
              : org
                ? `Lead · ${org}`
                : "—";
            return (
              <button
                key={c.id}
                onClick={() => abrir(c.id)}
                className={cn(
                  "relative flex w-full gap-2.5 rounded-[9px] p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40",
                  ativa ? "bg-hover" : "hover:bg-hover",
                )}
              >
                {ativa && <span className="absolute inset-y-[9px] left-0 w-[2px] rounded bg-laranja" />}
                <span
                  className={cn(
                    "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-[0.72rem] font-semibold text-branco",
                    ia ? "bg-laranja" : "bg-navy",
                  )}
                  title={ia ? "Clara (IA)" : "Humano"}
                >
                  {ia ? "C" : c.nome ? iniciais(c.nome) : "S"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("flex-1 truncate text-[0.86rem] font-semibold text-navy", ruim && "tabular-nums")}>
                      {rotulo}
                    </span>
                    <span className="shrink-0 text-[0.72rem] text-mute">{tempoLista(c.atualizado_em)}</span>
                  </div>
                  <div className={cn("mt-0.5 truncate text-[0.78rem]", c.previa ? "text-suave" : "text-mute")}>
                    {prev}
                  </div>
                </div>
                {(c.nao_lidas_qtd ?? 0) > 0 ? (
                  <span className="mt-2.5 grid h-[17px] min-w-[17px] shrink-0 place-items-center self-start rounded-full bg-laranja px-1 text-[0.66rem] font-semibold leading-none text-branco">
                    {c.nao_lidas_qtd! > 9 ? "9+" : c.nao_lidas_qtd}
                  </span>
                ) : c.nao_lida ? (
                  <span className="mt-3 h-[7px] w-[7px] shrink-0 self-start rounded-full bg-laranja" />
                ) : null}
              </button>
            );
          })}
        </div>
      </aside>

      {/* ═══════════ ZONA 2 · THREAD ═══════════ */}
      <section className="flex min-w-0 flex-1 flex-col bg-board">
        {!selecionada ? (
          <div className="m-auto text-center text-sm text-mute">
            {conversas.length === 0
              ? "Nenhuma conversa ainda — a primeira mensagem recebida no WhatsApp abre aqui."
              : "Selecione uma conversa."}
            {fonte === "mock" && <div className="mt-1 text-xs">dados de exemplo</div>}
          </div>
        ) : (
          <>
            {/* header + posse */}
            <div className="flex flex-shrink-0 items-center gap-3.5 border-b border-linha bg-branco px-5 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-[0.98rem] font-semibold leading-tight text-navy">{titulo}</div>
                <div className="mt-px truncate text-[0.76rem] text-suave">
                  {fmtTelefone(selecionada.telefone)}
                  {selecionada.etapa_nome && ` · ${selecionada.etapa_nome}`}
                  {` · ${modoClara ? "Clara" : "Sara"}`}
                </div>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-linha bg-board px-3 py-1 text-[0.78rem] text-suave",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", modoClara ? "bg-laranja" : "bg-navy")} />
                  {modoClara ? "Clara conduz" : "Sara conduz"}
                </span>
                <button
                  onClick={() => trocarModo(modoClara ? "HUMANO" : "IA")}
                  disabled={pending}
                  className="rounded-lg border border-linha-forte px-3 py-1.5 text-[0.78rem] font-semibold text-navy transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40 disabled:opacity-60"
                >
                  {modoClara ? "Assumir" : "Devolver à Clara"}
                </button>
              </div>
            </div>

            {/* mensagens — thread real (RF-27..33) */}
            <div className="relative flex min-h-0 flex-1 flex-col">
            <div ref={rolagemRef} onScroll={aoRolar} className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-6 py-5">
              {visiveis.length === 0 && props_.length === 0 && (
                <div className="m-auto max-w-sm text-center text-sm text-mute">Sem mensagens ainda nesta conversa.</div>
              )}
              {blocos.map((bloco, bi) => (
                <div key={bi} className="flex flex-col gap-3.5">
                  {/* separador de dia — chip sticky durante o scroll (RF-29) */}
                  <span className="sticky top-0 z-10 my-1 self-center rounded-full border border-linha bg-branco px-3 py-0.5 text-[0.71rem] text-mute shadow-suave">
                    {bloco.dia}
                  </span>
                  {bloco.grupos.map((grupo, gi) => {
                    const saida = grupo.falante !== "cliente";
                    const comDivisor = fronteira && grupo.itens[0]?.id === fronteira.primeiraId;
                    return (
                      <div key={gi} className="flex flex-col gap-3.5">
                        {comDivisor && (
                          <div ref={divisorRef} className="my-1 flex items-center gap-3" aria-label="início das não lidas">
                            <span className="h-px flex-1 bg-linha-forte" />
                            <span className="rounded-full bg-laranja-cl px-3 py-0.5 text-[0.7rem] font-semibold text-laranja-esc">
                              {fronteira.qtd === 1 ? "1 não lida" : `${fronteira.qtd} não lidas`}
                            </span>
                            <span className="h-px flex-1 bg-linha-forte" />
                          </div>
                        )}
                        {/* grupo de rajada: mesmo falante + 60s → bolhas coladas (3px), meta só na última (RF-27) */}
                        <div className={cn("flex max-w-[66%] flex-col gap-[3px]", saida ? "self-end items-end" : "self-start items-start")}>
                          {grupo.itens.map((m, mi) => {
                            const primeira = mi === 0;
                            const ultima = mi === grupo.itens.length - 1;
                            const falhou = m.status_entrega === "falhou" || m.falha_local;
                            const motivo = motivoErroPermanente(m.erro_codigo);
                            const podeRetry = podeTentarDeNovo(m);
                            return (
                              <div key={m.id} className={cn("flex flex-col", saida ? "items-end" : "items-start")}>
                                <div
                                  className={cn(
                                    "whitespace-pre-wrap break-words px-3.5 py-2.5 text-[0.88rem] leading-relaxed",
                                    saida
                                      ? "rounded-[13px] rounded-br-[5px] border border-linha bg-bolha-out text-tinta"
                                      : "rounded-[13px] rounded-bl-[5px] bg-bolha-in text-tinta",
                                    saida && !primeira && "rounded-tr-[5px]",
                                    !saida && !primeira && "rounded-tl-[5px]",
                                    falhou && "border border-vermelho-bd bg-vermelho-bg",
                                  )}
                                >
                                  <ConteudoBolha m={m} />
                                </div>
                                {falhou ? (
                                  <div className="mt-[3px] flex items-center gap-2 px-1 text-[0.7rem] text-vermelho">
                                    <span>
                                      não entregue{motivo ? ` — ${motivo}` : m.falha_local ? " — falha ao enfileirar" : m.erro_codigo ? ` — erro ${m.erro_codigo}` : ""}
                                    </span>
                                    {podeRetry && (
                                      <button
                                        onClick={() => (m.falha_local ? despachar(m.corpo!, m.id) : reenviar(m))}
                                        disabled={pending}
                                        className="font-semibold underline underline-offset-2 hover:text-tinta disabled:opacity-50"
                                      >
                                        Tentar de novo
                                      </button>
                                    )}
                                  </div>
                                ) : ultima ? (
                                  <div className="mt-[3px] px-1 text-[0.68rem] tabular-nums text-mute">
                                    {saida && grupo.falante === "clara" && <b className="font-medium text-laranja">Clara</b>}
                                    {saida && grupo.falante === "sara" && <b className="font-medium text-navy">Você</b>}
                                    {saida ? " · " : ""}
                                    {hhmm(m.criado_em)}
                                    {saida && (
                                      <span className="ml-1.5">
                                        {m.pendente ? (
                                          <>
                                            <EstadoEntregaIcone estado="na_fila" />
                                            <span className="ml-1">aguardando fila</span>
                                          </>
                                        ) : (
                                          <EstadoEntregaIcone estado={m.status_entrega} />
                                        )}
                                      </span>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* sugestão da Clara — card branco, acento na borda esquerda (só no modo Clara) */}
              {modoClara &&
                props_.map((s) => {
                  const emEdicao = editando?.id === s.id;
                  return (
                    <div
                      key={s.id}
                      className="self-stretch rounded-[11px] border border-linha border-l-[3px] border-l-laranja bg-branco px-4 py-3.5 shadow-[0_1px_6px_rgba(37,47,99,.05)]"
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="text-[0.76rem] font-semibold text-laranja-esc">Clara sugere</span>
                        <span className="text-[0.72rem] text-mute">· resposta ao paciente · não enviada</span>
                      </div>
                      {emEdicao ? (
                        <textarea
                          autoFocus
                          value={editando!.texto}
                          onChange={(e) => setEditando({ id: s.id, texto: e.target.value })}
                          rows={4}
                          className="w-full resize-none rounded-md border border-linha-forte bg-board px-3 py-2 text-[0.9rem] leading-relaxed text-navy outline-none focus:border-foco-comp focus:bg-branco"
                        />
                      ) : (
                        <p className="text-[0.9rem] leading-relaxed text-navy">{s.corpo}</p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => aprovar(s, emEdicao ? editando!.texto : s.corpo)}
                          disabled={pending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-laranja px-4 py-2 text-[0.82rem] font-semibold text-branco transition-colors hover:bg-laranja-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/50 disabled:opacity-50"
                        >
                          <svg viewBox="0 0 24 24" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 stroke-current" fill="none">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                          {emEdicao ? "Salvar e enviar" : "Aprovar e enviar"}
                        </button>
                        {emEdicao ? (
                          <button
                            onClick={() => setEditando(null)}
                            className="rounded-lg px-3 py-2 text-[0.82rem] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
                          >
                            Cancelar
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditando({ id: s.id, texto: s.corpo })}
                            className="rounded-lg px-3 py-2 text-[0.82rem] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
                          >
                            Editar
                          </button>
                        )}
                        <button
                          onClick={() => descartar(s)}
                          disabled={pending}
                          className="rounded-lg px-3 py-2 text-[0.82rem] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta disabled:opacity-50"
                        >
                          Descartar
                        </button>
                      </div>
                    </div>
                  );
                })}
              <div ref={fimRef} />
            </div>

            {/* pill de novas mensagens — aparece quando o scroll está lá em cima; clique desce (RF-30) */}
            {novas > 0 && (
              <button
                onClick={irProFim}
                className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5 rounded-full bg-navy px-3.5 py-2 text-[0.78rem] font-semibold text-branco shadow-forte transition-colors hover:bg-navy-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
              >
                <svg viewBox="0 0 24 24" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 stroke-current" fill="none">
                  <path d="M12 5v14m0 0-6-6m6 6 6-6" />
                </svg>
                {novas === 1 ? "1 nova" : `${novas} novas`}
              </button>
            )}
            </div>

            {/* composer sensível ao modo */}
            <div className="flex-shrink-0 bg-board px-4 pb-4 pt-3">
              <div className="flex items-end gap-2.5 rounded-xl border border-linha-forte bg-branco py-2 pl-3.5 pr-2 focus-within:border-foco-comp">
                <textarea
                  rows={1}
                  value={rascunho}
                  onChange={(e) => setRascunho(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      enviar();
                    }
                  }}
                  placeholder={modoClara ? "Escreva para assumir a conversa…" : "Escreva como Sara…"}
                  className="max-h-28 flex-1 resize-none bg-transparent py-1 text-[0.9rem] leading-relaxed text-tinta outline-none placeholder:text-mute"
                />
                <button
                  onClick={enviar}
                  disabled={pending || !rascunho.trim()}
                  title="Enviar"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-navy text-branco transition-colors hover:bg-navy-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 stroke-current" fill="none">
                    <path d="M22 2 11 13" />
                    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </div>
              <p className="mt-2 text-center text-[0.72rem] text-mute">
                {modoClara ? (
                  <>
                    A Clara está conduzindo — <b className="font-medium text-suave">ao enviar, você assume a conversa</b>. Ou aprove a sugestão acima.
                  </>
                ) : (
                  <>
                    Você assumiu — escrevendo como <b className="font-medium text-suave">Sara</b>. A Clara volta quando você devolver.
                  </>
                )}
              </p>
            </div>
          </>
        )}
      </section>

      {/* ═══════════ ZONA 3 · CONTEXTO DO LEAD ═══════════ */}
      <aside
        className={cn(
          "flex shrink-0 flex-col border-l border-linha bg-branco transition-[width] duration-150",
          ctxColapsado ? "w-[46px]" : "w-[288px]",
        )}
      >
        <div className={cn("flex items-center gap-2 border-b border-linha px-4 py-3", ctxColapsado && "justify-center px-0")}>
          {!ctxColapsado && <span className="text-[0.8rem] font-semibold text-tinta">Contexto do lead</span>}
          <button
            onClick={() => setCtxColapsado((v) => !v)}
            title={ctxColapsado ? "Expandir" : "Recolher"}
            aria-label={ctxColapsado ? "Expandir contexto" : "Recolher contexto"}
            className={cn(
              "grid h-[26px] w-[26px] place-items-center rounded-md text-mute transition-colors hover:bg-hover hover:text-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40",
              !ctxColapsado && "ml-auto",
            )}
          >
            <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 stroke-current" fill="none">
              <path d={ctxColapsado ? "m11 17-5-5 5-5M18 17l-5-5 5-5" : "m13 17 5-5-5-5M6 17l5-5-5-5"} />
            </svg>
          </button>
        </div>

        {!ctxColapsado && selecionada && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="font-serif text-[1.16rem] font-semibold leading-tight text-navy">{titulo}</div>
            <div className="mt-0.5 text-[0.82rem] tabular-nums text-suave">{fmtTelefone(selecionada.telefone)}</div>

            <div className="mt-[18px] flex flex-col">
              <LinhaCtx k="Etapa">
                {selecionada.etapa_nome ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-navy">
                    <span className="h-1.5 w-1.5 rounded-full bg-laranja" />
                    {selecionada.etapa_nome}
                  </span>
                ) : (
                  <span className="text-mute">—</span>
                )}
              </LinhaCtx>
              <LinhaCtx k="Na etapa há">{textoNaEtapa(selecionada.entrou_etapa_em)}</LinhaCtx>
              <LinhaCtx k="Valor estimado">
                {selecionada.valor != null ? moeda(selecionada.valor) : <span className="font-normal text-mute">a definir</span>}
              </LinhaCtx>
              <LinhaCtx k="Origem">{origemLabel ?? <span className="font-normal text-mute">—</span>}</LinhaCtx>
              <LinhaCtx k="Idade">
                {selecionada.idade != null ? selecionada.idade : <span className="font-normal text-mute">—</span>}
              </LinhaCtx>
            </div>

            <p className="mt-[18px] border-t border-linha pt-3 text-[0.78rem] leading-relaxed text-mute">
              Sinais e anotações aparecem aqui quando registrados na conversa.
            </p>

            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={() => router.push(`/funil${selecionada.lead_id ? `?lead=${selecionada.lead_id}` : ""}`)}
                className="flex items-center gap-2.5 rounded-[9px] border border-linha bg-board px-3 py-2.5 text-[0.83rem] font-semibold text-navy transition-colors hover:border-linha-forte hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40"
              >
                <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 stroke-suave" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
                Abrir card no funil
              </button>
              <button
                onClick={() => router.push(`/funil${selecionada.lead_id ? `?lead=${selecionada.lead_id}` : ""}`)}
                className="flex items-center gap-2.5 rounded-[9px] border border-linha bg-board px-3 py-2.5 text-[0.83rem] font-semibold text-navy transition-colors hover:border-linha-forte hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40"
              >
                <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 stroke-suave" fill="none">
                  <path d="M3 3v18h18" />
                  <path d="m7 14 4-4 3 3 5-6" />
                </svg>
                Analisar crédito (Levindo)
              </button>
            </div>
          </div>
        )}
      </aside>

      {toast && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-md border border-linha-forte bg-branco px-4 py-2.5 text-sm text-navy shadow-[0_6px_26px_rgba(37,47,99,.12)]">
          {toast}
        </div>
      )}
    </div>
  );
}

function LinhaCtx({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-[5px] text-[0.83rem] text-tinta">
      <span className="text-suave">{k}</span>
      <span className="ml-auto font-medium tabular-nums">{children}</span>
    </div>
  );
}

/**
 * Conteúdo da bolha por tipo (RF-33, degradação HONESTA): a pipeline de mídia (container
 * me-escuta-midia) ainda não existe — áudio/imagem/documento aparecem nomeados, com a
 * transcrição/visualização anunciada como pendente em vez de player quebrado ou URL da Meta.
 */
function ConteudoBolha({ m }: { m: Mensagem }) {
  const tipo = (m.tipo_conteudo ?? "text").toLowerCase();
  if (tipo === "text" || tipo === "texto") {
    return m.corpo ? <>{m.corpo}</> : <span className="italic opacity-70">[mensagem vazia]</span>;
  }
  if (tipo === "audio" || tipo === "voice" || tipo === "ptt") {
    return (
      <span className="flex flex-col gap-1">
        <span className="flex items-center gap-2 font-medium">
          <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 stroke-suave" fill="none">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
          </svg>
          Mensagem de voz
        </span>
        {m.corpo ? (
          <span className="text-[0.84rem] text-suave">“{m.corpo}”</span>
        ) : (
          <span className="text-[0.76rem] italic text-mute">transcrição e player chegam com a pipeline de mídia</span>
        )}
      </span>
    );
  }
  const rotulo =
    tipo === "image" || tipo === "imagem"
      ? "Foto recebida"
      : tipo === "document" || tipo === "documento"
        ? "Documento recebido"
        : tipo === "video"
          ? "Vídeo recebido"
          : tipo === "sticker"
            ? "Figurinha"
            : `Mensagem (${tipo})`;
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2 font-medium">
        <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 stroke-suave" fill="none">
          <path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3z" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-4.5-4.5L7 20" />
        </svg>
        {rotulo}
      </span>
      {m.corpo ? (
        <span className="text-[0.84rem] text-suave">{m.corpo}</span>
      ) : (
        <span className="text-[0.76rem] italic text-mute">visualização chega com a pipeline de mídia</span>
      )}
    </span>
  );
}
