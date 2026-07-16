"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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

const STATUS_ROTULO: Record<string, string> = {
  nova: "Nova",
  em_atendimento: "Em atendimento",
  aguardando: "Aguardando",
  resolvida: "Resolvida",
};

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
  const [toast, setToast] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  // ressincroniza quando muda a conversa selecionada ou os dados do servidor
  useEffect(() => {
    setMsgs(mensagens);
    setProps(sugestoes);
    setMode(selecionada?.mode ?? "IA");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionadaId, mensagens, sugestoes]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  function avisar(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  }

  function abrir(id: string) {
    router.push(`/conversas?c=${id}`);
  }

  function toggleTransbordo() {
    if (!selecionada) return;
    const assumir = mode === "IA";
    setMode(assumir ? "HUMANO" : "IA"); // otimista
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
    // Emite enviar_mensagem_humana → fila_saida. A bolha fica "aguardando" até o sender projetar
    // mensagem_enviada quando a msg SAIR de fato (envio real só com o token do WhatsApp).
    const otimista: Mensagem = {
      id: `tmp-${msgs.length}`,
      direcao: "saida",
      tipo_conteudo: "texto",
      corpo: texto,
      criado_em: new Date().toISOString(),
      pendente: true,
    };
    setMsgs((p) => [...p, otimista]);
    setRascunho("");
    startTransition(async () => {
      const r = await enviarMensagem(selecionada.id, texto);
      if (r.ok) {
        avisar("Mensagem da Sara enfileirada — sai no WhatsApp quando o token estiver plugado.");
        router.refresh();
      } else {
        setMsgs((p) => p.filter((m) => m.id !== otimista.id));
        avisar(`Falha ao enviar: ${r.motivo ?? "erro"}`);
      }
    });
  }

  function validar(sug: SugestaoMensagem, decisao: "aprovada" | "rejeitada") {
    setProps((p) => p.filter((s) => s.id !== sug.id)); // otimista
    if (decisao === "aprovada") {
      setMsgs((p) => [
        ...p,
        { id: `apv-${sug.id}`, direcao: "saida", tipo_conteudo: "texto", corpo: sug.corpo, criado_em: new Date().toISOString() },
      ]);
    }
    startTransition(async () => {
      const r = await validarSugestaoMensagem(sug.id, decisao);
      if (!r.ok) {
        setProps((p) => [sug, ...p]);
        avisar(`Falha ao validar: ${r.motivo ?? "erro"}`);
      } else {
        avisar(decisao === "aprovada" ? "Resposta aprovada — enviada pela borda." : "Proposta rejeitada.");
        router.refresh();
      }
    });
  }

  const titulo = selecionada?.nome ?? fmtTelefone(selecionada?.telefone ?? null);

  return (
    <div className="flex h-[calc(100vh-58px)]">
      {/* ─── inbox list ─── */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-borda bg-branco">
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h1 className="font-serif text-lg font-semibold text-navy">Conversas</h1>
          {fonte === "mock" && (
            <span className="rounded-full bg-laranja-cl px-2 py-0.5 text-[0.66rem] font-semibold text-laranja-esc">
              exemplo
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversas.map((c) => {
            const ativa = c.id === selecionadaId;
            const rotulo = c.nome ?? fmtTelefone(c.telefone);
            return (
              <button
                key={c.id}
                onClick={() => abrir(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-borda/60 px-4 py-3 text-left transition-colors",
                  ativa ? "bg-laranja-cl/60" : "hover:bg-creme",
                )}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-branco">
                  {c.nome ? iniciais(c.nome) : "👤"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-navy">{rotulo}</span>
                    {c.atualizado_em && (
                      <span className="ml-auto shrink-0 text-[0.66rem] text-mute">{hhmm(c.atualizado_em)}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold",
                        c.mode === "HUMANO" ? "bg-roxo/15 text-roxo" : "bg-laranja-cl text-laranja-esc",
                      )}
                    >
                      {c.mode === "HUMANO" ? "Sara" : "Clara"}
                    </span>
                    {c.status && (
                      <span className="text-[0.66rem] text-mute">{STATUS_ROTULO[c.status] ?? c.status}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ─── conversa ─── */}
      <section className="flex min-w-0 flex-1 flex-col bg-creme">
        {!selecionada ? (
          <div className="m-auto text-center text-sm text-mute">Selecione uma conversa.</div>
        ) : (
          <>
            {/* header */}
            <div className="flex flex-shrink-0 items-center gap-3.5 border-b border-borda bg-branco px-6 py-3">
              <span
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg text-branco",
                  mode === "HUMANO" ? "bg-roxo" : "bg-gradient-to-br from-[#F2803F] to-[#EC662E]",
                )}
              >
                {mode === "HUMANO" ? "S" : "C"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-serif text-lg font-semibold leading-tight text-navy">{titulo}</div>
                <div className="text-xs text-suave">
                  {mode === "HUMANO" ? (
                    <>Sara atendendo · <span className="text-mute">{fmtTelefone(selecionada.telefone)}</span></>
                  ) : (
                    <>Clara · pré-venda no WhatsApp · <span className="text-mute">{fmtTelefone(selecionada.telefone)}</span></>
                  )}
                </div>
              </div>
              <button
                onClick={toggleTransbordo}
                disabled={pending}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border-[1.5px] px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-50",
                  mode === "IA"
                    ? "border-roxo bg-roxo text-branco hover:opacity-90"
                    : "border-borda-forte bg-branco text-suave hover:bg-creme hover:text-navy",
                )}
              >
                {mode === "IA" ? "Assumir (Sara)" : "Devolver p/ Clara"}
              </button>
            </div>

            {/* mensagens */}
            <div className="flex-1 space-y-3 overflow-y-auto px-6 py-6">
              {msgs.length === 0 && (
                <div className="mx-auto max-w-sm py-10 text-center text-sm text-mute">
                  Sem mensagens ainda nesta conversa.
                </div>
              )}
              {msgs.map((m) => (
                <div key={m.id} className={cn("flex", m.direcao === "saida" ? "justify-end" : "justify-start")}>
                  <div className="max-w-[72%]">
                    <div
                      className={cn(
                        "whitespace-pre-wrap break-words px-3.5 py-2.5 text-sm leading-relaxed shadow-suave",
                        m.direcao === "saida"
                          ? "rounded-[16px_16px_4px_16px] bg-laranja text-branco"
                          : "rounded-[16px_16px_16px_4px] border border-borda-forte bg-branco text-texto",
                      )}
                    >
                      {m.corpo ?? <span className="italic opacity-70">[{m.tipo_conteudo}]</span>}
                    </div>
                    <div className={cn("mt-1 text-[0.66rem] text-mute", m.direcao === "saida" && "text-right")}>
                      {m.pendente ? "não enviado · aguardando fila de saída" : hhmm(m.criado_em)}
                    </div>
                  </div>
                </div>
              ))}

              {/* propostas da Clara aguardando aprovação */}
              {props_.map((s) => (
                <div key={s.id} className="mx-auto w-full max-w-xl">
                  <div className="overflow-hidden rounded-lg border border-azul-bd bg-branco shadow-forte">
                    <div className="flex items-baseline gap-2 px-4 pb-2 pt-3">
                      <span className="text-[0.62rem] font-bold uppercase tracking-wide text-laranja-esc">
                        Clara propõe responder
                      </span>
                      <span className="ml-auto text-[0.66rem] text-mute">valide para enviar</span>
                    </div>
                    <div className="px-4 pb-3">
                      <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-texto">{s.corpo}</p>
                      <div className="flex items-center gap-2 border-t border-borda pt-3">
                        <button
                          onClick={() => validar(s, "aprovada")}
                          disabled={pending}
                          className="inline-flex items-center gap-1.5 rounded-md bg-laranja px-4 py-2 text-sm font-semibold text-branco shadow-laranja hover:bg-laranja-esc disabled:opacity-50"
                        >
                          <svg viewBox="0 0 24 24" strokeWidth={2.4} strokeLinecap="round" className="h-4 w-4 stroke-current" fill="none">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                          Aprovar e enviar
                        </button>
                        <button
                          onClick={() => validar(s, "rejeitada")}
                          disabled={pending}
                          className="rounded-md border-[1.5px] border-borda-forte bg-branco px-4 py-2 text-sm font-semibold text-suave hover:bg-creme hover:text-navy disabled:opacity-50"
                        >
                          Rejeitar
                        </button>
                        <span className="ml-auto text-xs text-mute">
                          valida <b className="text-suave">você</b>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={fimRef} />
            </div>

            {/* composer */}
            <div className="flex-shrink-0 border-t border-borda bg-branco px-6 py-3">
              {mode === "IA" && (
                <div className="mb-2 text-xs text-mute">
                  Clara responde por proposta (você valida). <b className="text-suave">Assuma</b> pra falar como
                  humano.
                </div>
              )}
              <div className="flex items-end gap-2 rounded-lg border-[1.5px] border-borda-forte bg-creme py-2 pl-4 pr-2 focus-within:border-laranja focus-within:bg-branco">
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
                  placeholder={mode === "HUMANO" ? "Responder como Sara…" : "Escrever mensagem (envia como humano)…"}
                  className="max-h-28 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-mute"
                />
                <button
                  onClick={enviar}
                  disabled={pending || !rascunho.trim()}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-laranja text-branco hover:bg-laranja-esc disabled:opacity-50"
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
