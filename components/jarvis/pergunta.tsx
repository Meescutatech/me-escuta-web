"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { lerEventosSse, sugestoesPorContexto, type ContextoTela, type PapelUsuario } from "@/lib/jarvis/contrato";
import { responderEnsaio } from "@/lib/ensaio/jarvis";
import { RespostaBlocos, type RespostaJarvis } from "./resposta";

/**
 * /jarvis — PERGUNTA E RESPOSTA (W-J, 10/09/2026 23:10; refeita depois do "continua puro GPT").
 *
 * Não é chat de bolhas com avatar. "Ele é o Sistema": um campo de pergunta grande e discreto no
 * topo; a resposta como BLOCOS estruturados, no desenho do "Jarvis diz" (a referência que o Diogo
 * aprovou) — frase-resposta em 15px medium e, abaixo, números e linhas com link para a tela onde
 * se resolve (funil · equipe · tarefas · marketing). O arco entra só como assinatura da resposta,
 * na linha do que foi consultado. Referências: Perplexity (resposta antes de conversa), Linear e
 * Notion AI Q&A, v0 (mínimo).
 *
 * LARGURA (regra do Diogo, 23:20): sem coluna estreita centrada em tela de app. A página ocupa a
 * largura útil (gutter 24px); a resposta fica numa medida de leitura de ~760px ALINHADA À
 * ESQUERDA, e o espaço à direita carrega as perguntas prontas e o histórico (lista fina, muted,
 * guardado por pessoa em localStorage `jarvis:perguntas:<uid>`, 20 últimas — clicar mostra a
 * resposta de novo, sem reperguntar).
 *
 * Duas fontes de resposta, decididas pela PÁGINA (servidor) via `ensaio`:
 *   ensaio  → `responderEnsaio`, regra sobre a fixture, síncrona, sem rede (função não atravessa
 *             a fronteira servidor→cliente; por isso a página manda um boolean, não a função);
 *   real    → o proxy SSE `/jarvis/perguntar` (F9): o texto vira o bloco `texto`, as ferramentas
 *             viram a linha de assinatura.
 */

interface Registro {
  id: string;
  pergunta: string;
  resposta: RespostaJarvis;
}

const LIMITE = 20;
const chave = (uid: string) => `jarvis:perguntas:${uid}`;

function ler(uid: string): Registro[] {
  try {
    const raw = window.localStorage.getItem(chave(uid));
    const v = raw ? (JSON.parse(raw) as Registro[]) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function guardar(uid: string, itens: Registro[]) {
  try {
    window.localStorage.setItem(chave(uid), JSON.stringify(itens.slice(0, LIMITE)));
  } catch {
    /* sem storage */
  }
}
function novoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const LINK = "underline-offset-[3px] hover:underline focus-visible:outline-none focus-visible:underline";

export function PerguntaJarvis({
  usuarioId,
  papel,
  contexto,
  perguntaInicial = null,
  enviarAoAbrir = false,
  ensaio = false,
  sugestoes,
}: {
  usuarioId: string;
  papel: PapelUsuario;
  contexto: ContextoTela;
  perguntaInicial?: string | null;
  enviarAoAbrir?: boolean;
  /** ensaio: responde na hora pela fixture, sem rede */
  ensaio?: boolean;
  /** perguntas prontas; sem elas, as do contexto */
  sugestoes?: string[];
}) {
  const responder = useMemo(() => (ensaio ? (q: string) => responderEnsaio(q, new Date()) : null), [ensaio]);
  const [texto, setTexto] = useState("");
  const [historico, setHistorico] = useState<Registro[]>([]);
  const [atualId, setAtualId] = useState<string | null>(null);
  const [vivo, setVivo] = useState(false);
  const [pronto, setPronto] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const h = ler(usuarioId);
    setHistorico(h);
    setAtualId(h[0]?.id ?? null);
    setPronto(true);
  }, [usuarioId]);
  useEffect(() => {
    if (pronto) guardar(usuarioId, historico);
  }, [pronto, usuarioId, historico]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const perguntar = useCallback(
    async (pergunta: string) => {
      const t = pergunta.trim();
      if (!t || vivo) return;
      setTexto("");
      const id = novoId();
      const em = new Date().toISOString();

      if (responder) {
        const r = responder(t);
        setHistorico((h) => [{ id, pergunta: t, resposta: r }, ...h].slice(0, LIMITE));
        setAtualId(id);
        return;
      }

      const inicial: RespostaJarvis = { frase: null, blocos: [], consultas: [], em };
      setHistorico((h) => [{ id, pergunta: t, resposta: inicial }, ...h].slice(0, LIMITE));
      setAtualId(id);
      setVivo(true);
      const ac = new AbortController();
      abortRef.current = ac;
      const atualizar = (fn: (r: RespostaJarvis) => RespostaJarvis) =>
        setHistorico((h) => h.map((x) => (x.id === id ? { ...x, resposta: fn(x.resposta) } : x)));
      let textoAcumulado = "";
      try {
        const resp = await fetch("/jarvis/perguntar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contexto, mensagens: [{ papel: "usuario", texto: t }] }),
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
              textoAcumulado += ev.delta;
              const acumulado = textoAcumulado;
              atualizar((r) => ({ ...r, blocos: [{ tipo: "texto", texto: acumulado }] }));
            } else if (ev.tipo === "ferramenta") {
              atualizar((r) => ({ ...r, consultas: [...r.consultas, { nome: ev.nome, resumo: ev.resumo }] }));
            } else if (ev.tipo === "erro") {
              atualizar((r) => ({ ...r, erro: ev.motivo }));
            }
          }
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          atualizar((r) => ({ ...r, erro: "Perdi a conexão com o Jarvis. Tente de novo." }));
        }
      } finally {
        setVivo(false);
        abortRef.current = null;
      }
    },
    [contexto, responder, vivo],
  );

  // `?pergunta=` — uma vez só; limpa o parâmetro para reload não reenviar.
  const aplicada = useRef(false);
  useEffect(() => {
    if (!pronto || !perguntaInicial || aplicada.current) return;
    aplicada.current = true;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("pergunta")) {
        url.searchParams.delete("pergunta");
        window.history.replaceState(window.history.state, "", url.toString());
      }
    } catch {
      /* sem URL para limpar */
    }
    if (enviarAoAbrir) void perguntar(perguntaInicial);
    else {
      setTexto(perguntaInicial);
      inputRef.current?.focus();
    }
  }, [pronto, perguntaInicial, enviarAoAbrir, perguntar]);

  const atual = historico.find((h) => h.id === atualId) ?? null;
  const prontas = sugestoes ?? sugestoesPorContexto(contexto, papel);

  return (
    <div className="w-full px-6 py-6">
      {/* a pergunta — grande, discreta, na largura útil */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void perguntar(texto);
        }}
        className="border-b border-border/60 pb-3 focus-within:border-foreground/40"
      >
        <label htmlFor="jarvis-pergunta" className="sr-only">
          Pergunte ao Jarvis
        </label>
        <textarea
          id="jarvis-pergunta"
          ref={inputRef}
          value={texto}
          rows={1}
          autoFocus
          onChange={(e) => {
            setTexto(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void perguntar(texto);
            }
            if (e.key === "Escape" && vivo) abortRef.current?.abort();
          }}
          placeholder="Pergunte sobre o funil, a equipe, as tarefas ou o marketing"
          aria-busy={vivo}
          className="w-full resize-none bg-transparent text-[20px] font-medium leading-snug tracking-[-0.01em] text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
        />
      </form>

      <div className="mt-5 grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,760px)_minmax(220px,1fr)]">
        {/* a resposta atual — blocos, medida de leitura ~760px, alinhada à esquerda */}
        <div className="min-w-0">
          {atual ? (
            <>
              <p className="mb-3 text-[12.5px] text-muted-foreground">{atual.pergunta}</p>
              <RespostaBlocos resposta={atual.resposta} vivo={vivo && atual.id === historico[0]?.id} />
            </>
          ) : (
            <p className="text-[13.5px] leading-normal text-muted-foreground">Uma pergunta por vez. A resposta vem com o que foi consultado e o link para onde se resolve.</p>
          )}
        </div>

        {/* à direita: perguntas prontas e o histórico */}
        <aside className="min-w-0 space-y-6 text-[12.5px] text-muted-foreground" aria-label="Perguntas">
          {prontas.length > 0 && (
            <div>
              <p>Pergunte</p>
              <ul className="mt-1 space-y-0.5">
                {prontas.map((q) => (
                  <li key={q}>
                    <button type="button" onClick={() => void perguntar(q)} className={cn("text-left text-foreground", LINK)}>
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {historico.length > 0 && (
            <div>
              <p>Anteriores</p>
              <ul className="mt-1 space-y-0.5">
                {historico.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setAtualId(h.id)}
                      aria-current={h.id === atualId ? "true" : undefined}
                      className={cn("block w-full truncate text-left leading-snug", h.id === atualId ? "text-foreground" : "hover:text-foreground")}
                      title={h.pergunta}
                    >
                      {h.pergunta}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  abortRef.current?.abort();
                  setHistorico([]);
                  setAtualId(null);
                }}
                className={cn("mt-2 text-[11.5px]", LINK)}
              >
                limpar
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
