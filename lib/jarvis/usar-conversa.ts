"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lerEventosSse, type ContextoTela } from "./contrato";
import type { RegistroPergunta, RespostaJarvis } from "./resposta-tipos";
import { responderEnsaio } from "@/lib/ensaio/jarvis";
import type { ContextoJarvisTela } from "./contexto";

/**
 * O MOTOR DA PERGUNTA (W-JX, 11/09/2026) — um só, usado pelo OVERLAY (⌘J, em qualquer tela) e pela
 * PÁGINA `/jarvis` (o mesmo Jarvis em tela cheia). Antes cada superfície tinha o seu; era por isso
 * que o histórico não atravessava e que o "pensando" só existia num lugar.
 *
 * Guarda o histórico por pessoa em `localStorage` (`jarvis:perguntas:<uid>`, 20 últimas) — então
 * uma pergunta feita no overlay do funil aparece em "Anteriores" na tela cheia, e vice-versa.
 *
 * Duas fontes de resposta, decididas por quem monta (`ensaio`):
 *   ensaio → `responderEnsaio` sobre a fixture, e os PASSOS são ENCENADOS: aparecem um a um, com
 *            atraso curto e determinístico (240 ms), antes da frase. Não é enfeite — é o contrato
 *            de honestidade da tela: o que ele mostra ter consultado é o que a resposta usa.
 *   real   → o proxy SSE `/jarvis/perguntar` (F9): cada `ferramenta` do stream vira um passo
 *            concluído na hora em que chega, e o texto vira o bloco `texto`.
 */

const LIMITE = 20;
const PASSO_MS = 240;
const FECHO_MS = 200;

const chave = (uid: string) => `jarvis:perguntas:${uid}`;

function ler(uid: string): RegistroPergunta[] {
  try {
    const raw = window.localStorage.getItem(chave(uid));
    const v = raw ? (JSON.parse(raw) as RegistroPergunta[]) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function guardar(uid: string, itens: RegistroPergunta[]) {
  try {
    window.localStorage.setItem(chave(uid), JSON.stringify(itens.slice(0, LIMITE)));
  } catch {
    /* sem storage — o histórico vira memória de sessão, e está certo assim */
  }
}

export function novoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface ConversaJarvisMotor {
  texto: string;
  setTexto: (t: string) => void;
  historico: RegistroPergunta[];
  atual: RegistroPergunta | null;
  atualId: string | null;
  verRegistro: (id: string) => void;
  vivo: boolean;
  pronto: boolean;
  perguntar: (pergunta: string) => void;
  limpar: () => void;
  cancelar: () => void;
}

export function useConversaJarvis({
  usuarioId,
  contexto,
  ensaio,
  contextoTela = null,
}: {
  usuarioId: string;
  contexto: ContextoTela;
  ensaio: boolean;
  /** o contexto rico da tela — em ensaio, escolhe a resposta específica daquela tela */
  contextoTela?: ContextoJarvisTela | null;
}): ConversaJarvisMotor {
  const [texto, setTexto] = useState("");
  const [historico, setHistorico] = useState<RegistroPergunta[]>([]);
  const [atualId, setAtualId] = useState<string | null>(null);
  const [vivo, setVivo] = useState(false);
  const [pronto, setPronto] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const relogios = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const h = ler(usuarioId);
    setHistorico(h);
    setAtualId(h[0]?.id ?? null);
    setPronto(true);
  }, [usuarioId]);

  useEffect(() => {
    if (pronto) guardar(usuarioId, historico);
  }, [pronto, usuarioId, historico]);

  const pararRelogios = useCallback(() => {
    for (const t of relogios.current) clearTimeout(t);
    relogios.current = [];
  }, []);

  const cancelar = useCallback(() => {
    abortRef.current?.abort();
    pararRelogios();
    setVivo(false);
  }, [pararRelogios]);

  useEffect(() => () => {
    abortRef.current?.abort();
    for (const t of relogios.current) clearTimeout(t);
  }, []);

  const perguntar = useCallback(
    (pergunta: string) => {
      const t = pergunta.trim();
      if (!t || vivo) return;
      setTexto("");
      const id = novoId();
      const em = new Date().toISOString();
      const atualizar = (fn: (r: RespostaJarvis) => RespostaJarvis) =>
        setHistorico((h) => h.map((x) => (x.id === id ? { ...x, resposta: fn(x.resposta) } : x)));

      // ── ENSAIO: a resposta já existe; o que se encena é o TRABALHO até ela ────────────────────
      if (ensaio) {
        const completa = responderEnsaio(t, new Date(), contextoTela);
        const passos = completa.passos ?? [];
        const emAndamento = (i: number) =>
          passos.map((p, j) => (j < i ? { ...p, estado: "feito" as const } : j === i ? { ...p, estado: "andamento" as const } : p));

        setHistorico((h) => [{ id, pergunta: t, resposta: { ...completa, frase: null, blocos: [], acoes: [], passos: passos.length ? emAndamento(0) : [] } }, ...h].slice(0, LIMITE));
        setAtualId(id);

        if (passos.length === 0) {
          setHistorico((h) => h.map((x) => (x.id === id ? { ...x, resposta: completa } : x)));
          return;
        }

        setVivo(true);
        pararRelogios();
        for (let i = 1; i < passos.length; i++) {
          relogios.current.push(
            setTimeout(() => {
              atualizar((r) => ({ ...r, passos: emAndamento(i) }));
            }, PASSO_MS * i),
          );
        }
        relogios.current.push(
          setTimeout(
            () => {
              setHistorico((h) => h.map((x) => (x.id === id ? { ...x, resposta: { ...completa, passos: passos.map((p) => ({ ...p, estado: "feito" as const })) } } : x)));
              setVivo(false);
            },
            PASSO_MS * passos.length + FECHO_MS,
          ),
        );
        return;
      }

      // ── REAL: o proxy SSE (F9). Cada ferramenta que chega já é um passo concluído ────────────
      const inicial: RespostaJarvis = { frase: null, blocos: [], consultas: [], passos: [], em };
      setHistorico((h) => [{ id, pergunta: t, resposta: inicial }, ...h].slice(0, LIMITE));
      setAtualId(id);
      setVivo(true);
      const ac = new AbortController();
      abortRef.current = ac;
      const inicio = Date.now();
      let textoAcumulado = "";

      void (async () => {
        try {
          const resp = await fetch("/jarvis/perguntar", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ contexto, mensagens: [{ papel: "usuario", texto: t }] }),
            signal: ac.signal,
          });
          if (!resp.ok || !resp.body) {
            atualizar((r) => ({ ...r, erro: resp.status === 401 ? "Sua sessão expirou — entre de novo." : `Falha ao perguntar (${resp.status}).` }));
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
                atualizar((r) => ({
                  ...r,
                  consultas: [...r.consultas, { nome: ev.nome, resumo: ev.resumo }],
                  passos: [...(r.passos ?? []), { id: `${ev.nome}-${(r.passos?.length ?? 0) + 1}`, texto: ev.nome, estado: "feito", detalhe: ev.resumo, ms: Date.now() - inicio }],
                }));
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
      })();
    },
    [contexto, contextoTela, ensaio, pararRelogios, vivo],
  );

  const limpar = useCallback(() => {
    cancelar();
    setHistorico([]);
    setAtualId(null);
  }, [cancelar]);

  const atual = historico.find((h) => h.id === atualId) ?? null;

  return { texto, setTexto, historico, atual, atualId, verRegistro: setAtualId, vivo, pronto, perguntar, limpar, cancelar };
}
