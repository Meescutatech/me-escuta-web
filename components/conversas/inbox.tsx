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
import { diasNaEtapa } from "@/lib/tempo";
import { cn } from "@/lib/utils";

/*
 * /conversas — redesign "Kommo minimalista" (fase 2). Spec: Product_Management/Design/conversa-v2.html.
 * 3 zonas: lista (302px) · thread · contexto do lead (288px, colapsável, auto-recolhe <1180px).
 * Overdose de laranja removida: bolhas neutras, posse como pill discreta, sugestão em card branco
 * com acento só na borda esquerda + ÚNICO CTA sólido (Aprovar e enviar). Lógica de dados INTOCADA
 * (assumir/devolver/enviar/validar_sugestao seguem as mesmas actions/RPC-porta).
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
function diaLabel(iso: string): string {
  const d = new Date(iso);
  const agora = new Date();
  const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const dia0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dif = Math.round((hoje0 - dia0) / 86400000);
  if (dif <= 0) return "hoje";
  if (dif === 1) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}
function moeda(v: number | null | undefined): string {
  return v == null ? "" : "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function textoNaEtapa(iso: string | null | undefined): string {
  const dd = diasNaEtapa(iso ?? null, Date.now());
  if (dd == null) return "—";
  return dd === 0 ? "hoje" : dd === 1 ? "1 dia" : `${dd} dias`;
}

type Aba = "todas" | "minhas" | "nao_lidas";

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

  const [msgs, setMsgs] = useState<Mensagem[]>(mensagens);
  const [props_, setProps] = useState<SugestaoMensagem[]>(sugestoes);
  const [mode, setMode] = useState<ModoConversa>(selecionada?.mode ?? "IA");
  const [rascunho, setRascunho] = useState("");
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<Aba>("todas");
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ctxColapsado, setCtxColapsado] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMsgs(mensagens);
    setProps(sugestoes);
    setMode(selecionada?.mode ?? "IA");
    setEditando(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionadaId, mensagens, sugestoes]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length, props_.length]);

  // painel de contexto auto-recolhe em tela estreita (thread respira) — spec §2
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1180) setCtxColapsado(true);
  }, []);

  function avisar(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  }

  const contagens = useMemo(
    () => ({
      todas: conversas.length,
      minhas: conversas.filter((c) => c.mode === "HUMANO").length,
      nao_lidas: conversas.filter((c) => c.nao_lida).length,
    }),
    [conversas],
  );

  const conversasVisiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return conversas.filter((c) => {
      if (aba === "minhas" && c.mode !== "HUMANO") return false;
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

  function enviar() {
    const texto = rascunho.trim();
    if (!texto || !selecionada) return;
    const otimista: Mensagem = {
      id: `tmp-${Date.now()}`,
      direcao: "saida",
      tipo_conteudo: "texto",
      corpo: texto,
      criado_em: new Date().toISOString(),
      pendente: true,
      autor: mode === "HUMANO" ? "sara" : "clara",
    };
    setMsgs((p) => [...p, otimista]);
    setRascunho("");
    startTransition(async () => {
      const r = await enviarMensagem(selecionada.id, texto);
      if (r.ok) {
        avisar("Mensagem enfileirada — sai no WhatsApp quando o token estiver plugado.");
        router.refresh();
      } else {
        setMsgs((p) => p.filter((m) => m.id !== otimista.id));
        avisar(`Falha ao enviar: ${r.motivo ?? "erro"}`);
      }
    });
  }

  function aprovar(sug: SugestaoMensagem, textoFinal: string) {
    const editado = textoFinal.trim() !== sug.corpo.trim();
    setProps((p) => p.filter((s) => s.id !== sug.id));
    setEditando(null);
    setMsgs((p) => [
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
        setMsgs((p) => p.filter((m) => m.id !== `apv-${sug.id}`));
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

  // agrupa mensagens por dia p/ separador
  const blocos = useMemo(() => {
    const out: { dia: string; itens: Mensagem[] }[] = [];
    for (const m of msgs) {
      const dia = diaLabel(m.criado_em);
      const ult = out[out.length - 1];
      if (ult && ult.dia === dia) ult.itens.push(m);
      else out.push({ dia, itens: [m] });
    }
    return out;
  }, [msgs]);

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
        <div className="flex gap-3.5 px-4 pb-1.5 pt-2.5">
          {([
            ["todas", `Todas · ${contagens.todas}`],
            ["minhas", `Minhas · ${contagens.minhas}`],
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
            <p className="px-3 pt-6 text-center text-[0.8rem] text-mute">Nenhuma conversa aqui.</p>
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
                {c.nao_lida && <span className="mt-3 h-[7px] w-[7px] shrink-0 self-start rounded-full bg-laranja" />}
              </button>
            );
          })}
        </div>
      </aside>

      {/* ═══════════ ZONA 2 · THREAD ═══════════ */}
      <section className="flex min-w-0 flex-1 flex-col bg-board">
        {!selecionada ? (
          <div className="m-auto text-center text-sm text-mute">
            Selecione uma conversa.
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

            {/* mensagens */}
            <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-6 py-5">
              {msgs.length === 0 && props_.length === 0 && (
                <div className="m-auto max-w-sm text-center text-sm text-mute">Sem mensagens ainda nesta conversa.</div>
              )}
              {blocos.map((bloco, bi) => (
                <div key={bi} className="flex flex-col gap-2.5">
                  <span className="my-1 self-center rounded-full border border-linha bg-branco px-3 py-0.5 text-[0.71rem] text-mute">
                    {bloco.dia}
                  </span>
                  {bloco.itens.map((m) => {
                    const saida = m.direcao === "saida";
                    const autor = saida ? (m.autor === "sara" ? "Você" : "Clara") : null;
                    return (
                      <div key={m.id} className={cn("flex max-w-[66%] flex-col", saida ? "self-end items-end" : "self-start items-start")}>
                        <div
                          className={cn(
                            "whitespace-pre-wrap break-words px-3.5 py-2.5 text-[0.88rem] leading-relaxed",
                            saida
                              ? "rounded-[13px] rounded-br-[5px] border border-linha bg-bolha-out text-tinta"
                              : "rounded-[13px] rounded-bl-[5px] bg-bolha-in text-tinta",
                          )}
                        >
                          {m.corpo ?? <span className="italic opacity-70">[{m.tipo_conteudo}]</span>}
                        </div>
                        <div className="mt-[3px] px-1 text-[0.68rem] tabular-nums text-mute">
                          {m.pendente ? (
                            saida && m.autor === "sara" ? "não enviado · aguardando fila" : "✓ aprovada · aguardando envio"
                          ) : (
                            <>
                              {autor === "Clara" && <b className="font-medium text-laranja">Clara</b>}
                              {autor === "Você" && <b className="font-medium text-navy">Você</b>}
                              {autor ? " · " : ""}
                              {hhmm(m.criado_em)}
                            </>
                          )}
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
