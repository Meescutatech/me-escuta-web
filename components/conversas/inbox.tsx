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
import { cn } from "@/lib/utils";

function fmtTelefone(t: string | null): string {
  if (!t) return "—";
  const d = t.replace(/\D/g, "");
  const n = d.startsWith("55") ? d.slice(2) : d;
  if (n.length >= 10) {
    const ddd = n.slice(0, 2);
    const resto = n.slice(2);
    const meio = resto.length > 8 ? resto.slice(0, 5) : resto.slice(0, 4);
    const fim = resto.length > 8 ? resto.slice(5) : resto.slice(4);
    return `(${ddd}) ${meio}-${fim}`;
  }
  return t;
}
function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return (p[0][0] + (p[1] ? p[1][0] : "")).toUpperCase();
}
function hhmm(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

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
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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

  function avisar(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  }

  const conversasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return conversas;
    return conversas.filter(
      (c) => (c.nome ?? "").toLowerCase().includes(q) || (c.telefone ?? "").includes(q),
    );
  }, [conversas, busca]);

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

  const titulo = selecionada?.nome ?? fmtTelefone(selecionada?.telefone ?? null);
  const modoClara = mode === "IA";

  return (
    <div className="flex h-[calc(100vh-58px)]">
      {/* ─── inbox list ─── */}
      <aside className="flex w-[308px] shrink-0 flex-col border-r border-borda bg-branco">
        <div className="px-4 pb-3 pt-4">
          <div className="font-serif text-lg font-semibold text-navy">Conversas</div>
          <div className="mt-0.5 text-xs text-mute">
            WhatsApp · {conversas.length} abertas
            {fonte === "mock" && " · exemplo"}
          </div>
        </div>
        <label className="mx-3.5 mb-2 flex items-center gap-2 rounded-md border-[1.5px] border-borda-forte bg-creme px-3 py-2 focus-within:border-laranja focus-within:bg-branco">
          <svg viewBox="0 0 24 24" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 stroke-mute" fill="none">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar conversa…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-mute"
          />
        </label>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {conversasFiltradas.map((c) => {
            const ativa = c.id === selecionadaId;
            const rotulo = c.nome ?? fmtTelefone(c.telefone);
            const sara = c.mode === "HUMANO";
            return (
              <button
                key={c.id}
                onClick={() => abrir(c.id)}
                className={cn(
                  "relative flex w-full gap-3 rounded-lg px-3 py-3 text-left transition-colors",
                  ativa ? "bg-laranja-cl" : "hover:bg-creme",
                )}
              >
                {ativa && <span className="absolute inset-y-2.5 left-0 w-[3px] rounded bg-laranja" />}
                <span
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold text-branco",
                    sara ? "bg-roxo" : "bg-navy",
                  )}
                >
                  {c.nome ? iniciais(c.nome) : "👤"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="truncate text-sm font-semibold text-navy">{rotulo}</span>
                    {c.atualizado_em && (
                      <span className="ml-auto shrink-0 text-[0.66rem] text-mute">{hhmm(c.atualizado_em)}</span>
                    )}
                  </div>
                  <span
                    className={cn(
                      "mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold",
                      sara ? "bg-roxo-bg text-roxo" : "bg-pessego text-laranja-esc",
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", sara ? "bg-roxo" : "bg-laranja")} />
                    {sara ? "Sara assumiu" : "Clara conduz"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ─── chat ─── */}
      <section className="flex min-w-0 flex-1 flex-col bg-creme">
        {!selecionada ? (
          <div className="m-auto text-center text-sm text-mute">Selecione uma conversa.</div>
        ) : (
          <>
            {/* header + toggle segmentado */}
            <div className="flex flex-shrink-0 items-center gap-3.5 border-b border-borda bg-branco px-6 py-3">
              <span
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-branco",
                  modoClara ? "bg-navy" : "bg-navy",
                )}
              >
                {selecionada.nome ? iniciais(selecionada.nome) : "👤"}
              </span>
              <div className="min-w-0">
                <div className="font-serif text-lg font-semibold leading-tight text-navy">{titulo}</div>
                <div className="flex items-center gap-1.5 text-xs text-suave">
                  <span className="h-1.5 w-1.5 rounded-full bg-verde" />
                  {fmtTelefone(selecionada.telefone)}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <div className="text-right text-[0.7rem] leading-tight text-mute">
                  quem responde
                  <b className="block text-[0.76rem] text-navy">{modoClara ? "Clara (IA)" : "Sara (você)"}</b>
                </div>
                <div className="flex gap-0.5 rounded-lg border-[1.5px] border-borda-forte bg-creme p-0.5">
                  <button
                    onClick={() => trocarModo("IA")}
                    disabled={pending}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60",
                      modoClara ? "bg-branco text-laranja-esc shadow-suave" : "text-suave hover:text-navy",
                    )}
                  >
                    <span className={cn("grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-[#F2803F] to-[#EC662E] text-[0.62rem] font-bold text-branco", !modoClara && "opacity-60 grayscale")}>
                      C
                    </span>
                    Clara
                  </button>
                  <button
                    onClick={() => trocarModo("HUMANO")}
                    disabled={pending}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60",
                      !modoClara ? "bg-branco text-roxo shadow-suave" : "text-suave hover:text-navy",
                    )}
                  >
                    <span className={cn("grid h-5 w-5 place-items-center rounded-full bg-roxo text-[0.62rem] font-bold text-branco", modoClara && "opacity-60 grayscale")}>
                      S
                    </span>
                    Sara
                  </button>
                </div>
              </div>
            </div>

            {/* ribbon */}
            <div
              className={cn(
                "flex flex-shrink-0 items-center gap-2.5 border-b border-borda px-6 py-2 text-[0.77rem]",
                modoClara ? "bg-laranja-cl text-laranja-esc" : "bg-roxo-bg text-roxo",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", modoClara ? "bg-laranja" : "bg-roxo")} />
              {modoClara ? (
                <span>
                  <b className="font-bold">Clara está conduzindo</b> — as respostas dela entram na fila e você
                  aprova antes de enviar. Assuma a qualquer momento.
                </span>
              ) : (
                <span>
                  <b className="font-bold">Você assumiu esta conversa</b> — a Clara está pausada e não responde.
                  Escreva direto pela Sara.
                </span>
              )}
            </div>

            {/* mensagens */}
            <div className="flex-1 space-y-3 overflow-y-auto px-6 py-6">
              {msgs.length === 0 && (
                <div className="mx-auto max-w-sm py-10 text-center text-sm text-mute">
                  Sem mensagens ainda nesta conversa.
                </div>
              )}
              {msgs.map((m) => {
                const sara = m.direcao === "saida" && m.autor === "sara";
                const clara = m.direcao === "saida" && !sara;
                return (
                  <div key={m.id} className={cn("flex", m.direcao === "saida" ? "justify-end" : "justify-start")}>
                    <div className="max-w-[74%]">
                      <div
                        className={cn(
                          "whitespace-pre-wrap break-words px-3.5 py-2.5 text-sm leading-relaxed shadow-suave",
                          m.direcao === "entrada" && "rounded-[16px_16px_16px_4px] border border-borda-forte bg-branco text-texto",
                          clara && "rounded-[16px_16px_4px_16px] bg-laranja text-branco",
                          sara && "rounded-[16px_16px_4px_16px] bg-roxo text-branco",
                        )}
                      >
                        {m.corpo ?? <span className="italic opacity-70">[{m.tipo_conteudo}]</span>}
                      </div>
                      <div className={cn("mt-1 text-[0.66rem] text-mute", m.direcao === "saida" && "text-right")}>
                        {m.pendente
                          ? sara
                            ? "não enviado · aguardando fila de saída"
                            : "✓ aprovada · aguardando envio"
                          : hhmm(m.criado_em)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* nota de sistema quando Sara assumiu */}
              {!modoClara && (
                <div className="mx-auto flex max-w-[80%] items-center gap-2 rounded-lg border border-roxo-bd bg-roxo-bg px-3.5 py-2 text-center text-xs text-roxo">
                  <svg viewBox="0 0 24 24" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 stroke-current" fill="none">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  </svg>
                  <span>
                    <b className="font-bold">Sara assumiu a conversa</b> · Clara pausada
                  </span>
                </div>
              )}
              <div ref={fimRef} />
            </div>

            {/* fila de aprovação (só no modo Clara) */}
            {modoClara &&
              props_.map((s) => {
                const emEdicao = editando?.id === s.id;
                return (
                  <div key={s.id} className="flex-shrink-0 px-6 pb-1">
                    <div className="overflow-hidden rounded-lg border border-azul-bd border-l-[3px] border-l-laranja bg-branco shadow-forte">
                      <div className="flex items-center gap-2.5 px-4 pb-2 pt-3">
                        <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-gradient-to-br from-[#F2803F] to-[#EC662E] text-[0.7rem] font-bold text-branco">
                          C
                        </span>
                        <span className="text-sm font-semibold text-navy">Clara sugere responder</span>
                        <span className="ml-auto rounded-full bg-laranja-cl px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wide text-laranja-esc">
                          propõe · aprove p/ enviar
                        </span>
                      </div>
                      {emEdicao ? (
                        <div className="px-4 pb-1">
                          <textarea
                            autoFocus
                            value={editando!.texto}
                            onChange={(e) => setEditando({ id: s.id, texto: e.target.value })}
                            rows={4}
                            className="w-full resize-none rounded-md border border-borda-forte bg-creme px-3 py-2 text-sm outline-none focus:border-laranja focus:bg-branco"
                          />
                        </div>
                      ) : (
                        <div className="relative mx-4 mb-5 rounded-[14px_14px_14px_4px] bg-laranja px-3.5 py-2.5 text-sm leading-relaxed text-branco">
                          {s.corpo}
                          <span className="absolute -bottom-4 right-2 text-[0.63rem] text-mute">
                            prévia — ainda não enviada
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 px-4 pb-3.5 pt-1.5">
                        <button
                          onClick={() => aprovar(s, emEdicao ? editando!.texto : s.corpo)}
                          disabled={pending}
                          className="inline-flex items-center gap-1.5 rounded-md bg-laranja px-4 py-2 text-sm font-semibold text-branco shadow-laranja hover:bg-laranja-esc disabled:opacity-50"
                        >
                          <svg viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 stroke-current" fill="none">
                            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
                          </svg>
                          Aprovar e enviar
                        </button>
                        {emEdicao ? (
                          <button
                            onClick={() => setEditando(null)}
                            className="rounded-md border-[1.5px] border-borda-forte bg-branco px-4 py-2 text-sm font-semibold text-suave hover:bg-creme"
                          >
                            Cancelar
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditando({ id: s.id, texto: s.corpo })}
                            className="inline-flex items-center gap-1.5 rounded-md border-[1.5px] border-borda-forte bg-branco px-4 py-2 text-sm font-semibold text-navy hover:bg-creme"
                          >
                            <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 stroke-current" fill="none">
                              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                            </svg>
                            Editar
                          </button>
                        )}
                        <button
                          onClick={() => descartar(s)}
                          disabled={pending}
                          className="rounded-md px-2 py-2 text-sm font-semibold text-mute hover:text-vermelho disabled:opacity-50"
                        >
                          Descartar
                        </button>
                        <span className="ml-auto text-xs text-mute">valida <b className="text-suave">você (Sara)</b></span>
                      </div>
                    </div>
                  </div>
                );
              })}

            {/* composer */}
            <div className="flex-shrink-0 border-t border-borda bg-branco px-6 py-3">
              <div className="mb-2 text-xs text-mute">
                {modoClara ? (
                  <span>💬 A Clara está no controle — aprove a sugestão acima, ou escreva aqui para <b className="text-suave">assumir a conversa</b>.</span>
                ) : (
                  <span>🙋‍♀️ Você assumiu — escrevendo como <b className="text-suave">Sara</b>. A Clara volta quando você devolver.</span>
                )}
              </div>
              <div
                className={cn(
                  "flex items-end gap-2 rounded-lg border-[1.5px] bg-creme py-2 pl-4 pr-2 focus-within:bg-branco",
                  modoClara ? "border-borda-forte focus-within:border-laranja" : "border-borda-forte focus-within:border-roxo",
                )}
              >
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
                  className="max-h-28 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-mute"
                />
                <button
                  onClick={enviar}
                  disabled={pending || !rascunho.trim()}
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-md text-branco disabled:opacity-50",
                    modoClara ? "bg-laranja hover:bg-laranja-esc" : "bg-roxo hover:opacity-90",
                  )}
                >
                  <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 stroke-current" fill="none">
                    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}

        {toast && (
          <div className="pointer-events-none fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-md border border-verde-bd bg-branco px-4 py-2.5 text-sm text-navy shadow-forte">
            {toast}
          </div>
        )}
      </section>
    </div>
  );
}
