"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MarcaJarvis } from "@/components/jarvis/marca";
import {
  lerEventosSse,
  rotuloFerramenta,
  sugestoesPorContexto,
  type ContextoTela,
  type FerramentaUsada,
  type PapelUsuario,
} from "@/lib/jarvis/contrato";

/**
 * O CHAT DO JARVIS (F9) — uma superfície, dois recipientes: a página `/jarvis` (largura cheia) e o
 * painel lateral (`painel-lateral.tsx`). O componente não sabe onde está: `compacto` só muda
 * respiros.
 *
 * A ASSINATURA desta tela é o RASTRO DE CONSULTA. Antes do texto de cada resposta, os chips dizem
 * o que o agente consultou ("consultou o funil · 42 leads"), e enquanto ele consulta o chip pulsa.
 * É a regra "não inventa número" virada em interface: o número que aparece no texto tem uma
 * origem visível logo acima. Sem chip, sem número — e a pessoa vê isso.
 *
 * O que NÃO tem aqui, de propósito: bolha para o Jarvis (texto corrido, como documento — bolha é
 * para quem fala em 1ª pessoa; o Jarvis relata), avatar humano, timestamps por mensagem (a
 * conversa é de agora; o histórico auditável vive em `core.jarvis_conversa`), markdown pesado
 * (o prompt pede resposta curta; listas simples com "- " são respeitadas).
 *
 * Histórico: localStorage por pessoa (`jarvis:conversa:<uid>`), com `sessao_id` para o ledger
 * agrupar. "Nova conversa" zera os dois. O ledger é a fonte durável; isto é conveniência.
 */

interface Mensagem {
  papel: "usuario" | "jarvis";
  texto: string;
  ferramentas?: FerramentaUsada[];
  erro?: string;
}

interface Guardado {
  sessao_id: string | null;
  mensagens: Mensagem[];
}

const LIMITE_HISTORICO = 40;

function chaveHistorico(uid: string): string {
  return `jarvis:conversa:${uid}`;
}

function lerGuardado(uid: string): Guardado {
  try {
    const raw = window.localStorage.getItem(chaveHistorico(uid));
    if (!raw) return { sessao_id: null, mensagens: [] };
    const g = JSON.parse(raw) as Guardado;
    return { sessao_id: g.sessao_id ?? null, mensagens: Array.isArray(g.mensagens) ? g.mensagens : [] };
  } catch {
    return { sessao_id: null, mensagens: [] };
  }
}

function salvar(uid: string, g: Guardado): void {
  try {
    window.localStorage.setItem(chaveHistorico(uid), JSON.stringify({ ...g, mensagens: g.mensagens.slice(-LIMITE_HISTORICO) }));
  } catch {
    /* storage cheio/indisponível: o chat segue sem histórico */
  }
}

function novoUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Render mínimo: parágrafos, e linhas "- " viram lista. Nada de HTML vindo do modelo. */
function Texto({ texto }: { texto: string }) {
  const blocos = texto.split(/\n{2,}/);
  return (
    <div className="space-y-2 text-[14px] leading-[1.55] text-tinta">
      {blocos.map((b, i) => {
        const linhas = b.split("\n");
        const ehLista = linhas.length > 0 && linhas.every((l) => /^\s*[-•]\s+/.test(l) || l.trim() === "");
        if (ehLista) {
          return (
            <ul key={i} className="ml-4 list-disc space-y-1">
              {linhas.filter((l) => l.trim()).map((l, j) => (
                <li key={j}>{l.replace(/^\s*[-•]\s+/, "")}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap break-words">
            {b}
          </p>
        );
      })}
    </div>
  );
}

function Chips({ itens, consultando }: { itens: FerramentaUsada[]; consultando: boolean }) {
  if (itens.length === 0 && !consultando) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="O que o Jarvis consultou">
      {itens.map((f, i) => (
        <li
          key={i}
          className="inline-flex items-center gap-1.5 rounded-full border border-linha bg-board px-2.5 py-[3px] text-[11.5px] text-suave"
        >
          <span className="font-medium text-tinta">{rotuloFerramenta(f.nome)}</span>
          <span aria-hidden className="text-mute">·</span>
          <span className="font-mono text-[11px]">{f.resumo}</span>
        </li>
      ))}
      {consultando && (
        <li className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-linha-forte px-2.5 py-[3px] text-[11.5px] text-mute">
          <span className="pulso-ao-vivo inline-block h-1.5 w-1.5 rounded-full bg-laranja" aria-hidden />
          consultando
        </li>
      )}
    </ul>
  );
}

// 10/09 (W-J, pontual): o "J" em roundel navy saiu — o Diogo escolheu o arco como a marca do
// Jarvis ("nada de avatar circular com letra"). Mesmo lugar, mesma largura de coluna (24px).
function AvatarJarvis({ vivo }: { vivo?: boolean }) {
  return (
    <span aria-hidden className="grid h-6 w-6 flex-none place-items-center text-muted-foreground">
      <MarcaJarvis tamanho={20} vivo={vivo} />
    </span>
  );
}

export function ConversaJarvis({
  usuarioId,
  papel,
  contextoInicial,
  perguntaInicial = null,
  enviarAoAbrir = false,
  compacto = false,
  autoFoco = true,
}: {
  usuarioId: string;
  papel: PapelUsuario;
  contextoInicial: ContextoTela;
  /** `?pergunta=` — pré-preenche o composer (uma vez só) */
  perguntaInicial?: string | null;
  /** com `perguntaInicial`: envia de uma vez. A página passa `false` no ensaio (o proxy exige sessão real). */
  enviarAoAbrir?: boolean;
  compacto?: boolean;
  autoFoco?: boolean;
}) {
  const [contexto, setContexto] = useState<ContextoTela>(contextoInicial);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // histórico local por pessoa
  useEffect(() => {
    const g = lerGuardado(usuarioId);
    setMensagens(g.mensagens);
    setSessaoId(g.sessao_id);
    setPronto(true);
  }, [usuarioId]);
  useEffect(() => {
    if (pronto) salvar(usuarioId, { sessao_id: sessaoId, mensagens });
  }, [pronto, usuarioId, sessaoId, mensagens]);

  // contexto novo vindo de fora (o painel reabriu em outra tela)
  useEffect(() => setContexto(contextoInicial), [contextoInicial]);

  // rola para o fim a cada mudança
  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensagens, consultando]);

  useEffect(() => {
    if (autoFoco) inputRef.current?.focus();
  }, [autoFoco]);

  // aborta o stream se o componente sair da tela
  useEffect(() => () => abortRef.current?.abort(), []);

  const sugestoes = useMemo(() => sugestoesPorContexto(contexto, papel), [contexto, papel]);

  const enviar = useCallback(
    async (pergunta: string) => {
      const t = pergunta.trim();
      if (!t || enviando) return;
      setTexto("");
      const anteriores = mensagens;
      const doUsuario: Mensagem = { papel: "usuario", texto: t };
      const resposta: Mensagem = { papel: "jarvis", texto: "", ferramentas: [] };
      setMensagens([...anteriores, doUsuario, resposta]);
      setEnviando(true);
      setConsultando(false);

      const ac = new AbortController();
      abortRef.current = ac;
      let sessao = sessaoId;
      if (!sessao) {
        sessao = novoUuid();
        setSessaoId(sessao);
      }

      const atualizar = (fn: (r: Mensagem) => Mensagem) =>
        setMensagens((prev) => {
          const copia = prev.slice();
          const i = copia.length - 1;
          if (i >= 0 && copia[i].papel === "jarvis") copia[i] = fn(copia[i]);
          return copia;
        });

      try {
        const resp = await fetch("/jarvis/perguntar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contexto,
            sessao_id: sessao,
            mensagens: [...anteriores, doUsuario].map((m) => ({ papel: m.papel, texto: m.texto })).filter((m) => m.texto.trim()),
          }),
          signal: ac.signal,
        });
        if (!resp.ok || !resp.body) {
          atualizar((r) => ({ ...r, erro: resp.status === 401 ? "Sua sessão expirou — entre de novo." : `Falha (${resp.status}).` }));
          return;
        }
        const leitor = resp.body.getReader();
        const dec = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await leitor.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          const { eventos, resto } = lerEventosSse(buffer);
          buffer = resto;
          for (const ev of eventos) {
            if (ev.tipo === "texto") {
              setConsultando(false);
              atualizar((r) => ({ ...r, texto: r.texto + ev.delta }));
            } else if (ev.tipo === "ferramenta") {
              setConsultando(true);
              atualizar((r) => ({ ...r, ferramentas: [...(r.ferramentas ?? []), { nome: ev.nome, resumo: ev.resumo }] }));
            } else if (ev.tipo === "erro") {
              atualizar((r) => ({ ...r, erro: ev.motivo }));
            } else if (ev.tipo === "fim") {
              setConsultando(false);
              if (ev.sessao_id && ev.sessao_id !== sessao) setSessaoId(ev.sessao_id);
            }
          }
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          atualizar((r) => ({ ...r, erro: "Perdi a conexão com o Jarvis. Tente de novo." }));
        }
      } finally {
        setEnviando(false);
        setConsultando(false);
        abortRef.current = null;
        inputRef.current?.focus();
      }
    },
    [contexto, enviando, mensagens, sessaoId],
  );

  // `?pergunta=` vinda do dashboard: uma vez só (ref), depois de carregar o histórico. Envia se a
  // página mandou (`enviarAoAbrir`); senão só pré-preenche. Tira o parâmetro da URL para um
  // reload não reenviar. (Não lê `ensaioLigado()` aqui: no cliente o `process.env` por objeto
  // não é inlinado pelo Next — medido, mandou e tomou 401.)
  const perguntaAplicada = useRef(false);
  useEffect(() => {
    if (!pronto || !perguntaInicial || perguntaAplicada.current) return;
    perguntaAplicada.current = true;
    setTexto(perguntaInicial);
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("pergunta")) {
        url.searchParams.delete("pergunta");
        window.history.replaceState(window.history.state, "", url.toString());
      }
    } catch {
      /* sem URL para limpar */
    }
    if (enviarAoAbrir) void enviar(perguntaInicial);
    else inputRef.current?.focus();
  }, [pronto, perguntaInicial, enviarAoAbrir, enviar]);

  function novaConversa() {
    abortRef.current?.abort();
    setMensagens([]);
    setSessaoId(null);
    setTexto("");
    inputRef.current?.focus();
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void enviar(texto);
    }
    if (e.key === "Escape" && enviando) abortRef.current?.abort();
  }

  const vazio = pronto && mensagens.length === 0;
  const px = compacto ? "px-4" : "px-6";

  // O composer é UM, renderizado em dois lugares: no centro (conversa nova, como se abre uma folha
  // em branco) ou no rodapé (conversa andando). O contexto da tela continua indo no pedido — ele só
  // não vira faixa na interface: quem pergunta "quantos estão parados?" DE DENTRO do funil recebe a
  // resposta do funil, sem precisar ler onde está.
  const composer = (central: boolean) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void enviar(texto);
      }}
      className={cn("w-full", central ? "max-w-[560px]" : "mx-auto max-w-[640px]")}
    >
      <div className="flex items-end gap-1.5 rounded-[26px] border border-linha bg-branco py-1.5 pl-4 pr-1.5 shadow-[0_1px_3px_rgba(31,35,40,.07)] transition-colors focus-within:border-foco-comp">
        <textarea
          ref={inputRef}
          rows={1}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }}
          onKeyDown={aoTeclar}
          placeholder="Pergunte ao Jarvis"
          aria-label="Pergunta para o Jarvis"
          disabled={!pronto}
          className="max-h-[160px] min-h-[38px] flex-1 resize-none bg-transparent py-2 text-[14.5px] leading-[1.5] text-tinta outline-none placeholder:text-mute"
        />
        {enviando ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            aria-label="Parar a resposta"
            className="grid h-9 w-9 flex-none place-items-center rounded-full border-[1.5px] border-borda-forte text-suave outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-laranja"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden>
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!texto.trim() || !pronto}
            aria-label="Enviar"
            className="grid h-9 w-9 flex-none place-items-center rounded-full bg-laranja text-branco outline-none hover:bg-laranja-esc focus-visible:ring-2 focus-visible:ring-laranja focus-visible:ring-offset-2 disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        )}
      </div>
      {!central && (
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            onClick={novaConversa}
            className="rounded px-1.5 py-0.5 text-[11.5px] text-mute outline-none hover:bg-hover hover:text-tinta focus-visible:ring-2 focus-visible:ring-laranja"
          >
            Nova conversa
          </button>
        </div>
      )}
    </form>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-branco">
      {/* lista */}
      <div ref={listaRef} className={cn("min-h-0 flex-1 overflow-y-auto", px, compacto ? "py-4" : "py-6")} aria-live="polite" aria-busy={enviando}>
        {vazio ? (
          <div className={cn("mx-auto flex h-full w-full max-w-[640px] flex-col items-center justify-center", compacto ? "gap-5" : "gap-6")}>
            <h2 className={cn("text-balance text-center font-[650] tracking-[-0.01em] text-tinta", compacto ? "text-[20px]" : "text-[28px]")}>
              Por onde começamos?
            </h2>
            {composer(true)}
            <ul className="flex flex-wrap justify-center gap-2" aria-label="Sugestões">
              {sugestoes.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => void enviar(s)}
                    className="rounded-full border border-linha bg-branco px-3 py-1.5 text-[13px] text-suave outline-none hover:bg-hover hover:text-tinta focus-visible:ring-2 focus-visible:ring-laranja focus-visible:ring-offset-2"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="mx-auto flex max-w-[640px] flex-col gap-5">
            {mensagens.map((m, i) => {
              const ultima = i === mensagens.length - 1;
              if (m.papel === "usuario") {
                return (
                  <li key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-[14px] rounded-br-[4px] bg-bolha-out px-3.5 py-2 text-[14px] leading-[1.5] text-tinta">
                      <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                    </div>
                  </li>
                );
              }
              const vivo = ultima && enviando;
              return (
                <li key={i} className="flex gap-3">
                  <AvatarJarvis vivo={vivo} />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <Chips itens={m.ferramentas ?? []} consultando={vivo && consultando} />
                    {m.texto ? (
                      <Texto texto={m.texto} />
                    ) : vivo && !consultando ? (
                      <span className="inline-flex items-center gap-1 py-1.5" role="status" aria-label="Jarvis pensando">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            aria-hidden
                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-mute"
                            style={{ animationDelay: `${i * 160}ms`, animationDuration: "0.9s" }}
                          />
                        ))}
                      </span>
                    ) : null}
                    {m.erro && (
                      <p className="mt-2 rounded-md bg-vermelho-bg px-3 py-1.5 text-[12.5px] text-vermelho" role="alert">
                        {m.erro}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* composer no rodapé — só quando a conversa já anda; a folha em branco o tem no centro */}
      {!vazio && <div className={cn("bg-branco", px, compacto ? "pb-3 pt-1" : "pb-4 pt-1")}>{composer(false)}</div>}
    </div>
  );
}
