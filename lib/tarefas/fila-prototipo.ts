"use client";

import { useEffect, useState } from "react";
import type { PropostaTarefa } from "./proposta";

/**
 * A FILA DO PROTÓTIPO — onde a tarefa automática existe sem tocar no banco.
 *
 * O problema concreto: a D10 diz que a tarefa `auto` "nasce criada e aparece direto na fila".
 * Para o Diogo ver isso, o que acontece em /conversas precisa chegar em /tarefas — e o
 * `.env.local` deste repo aponta para o Supabase de PRODUÇÃO, então criar tarefa de verdade
 * está fora de questão.
 *
 * A saída é `sessionStorage`: vive no navegador dele, atravessa a navegação entre as duas rotas,
 * e morre quando ele fecha a aba. Nenhuma linha sai da máquina. É a única forma de demonstrar o
 * fluxo inteiro sem escrever onde não se pode — e é intencionalmente frágil, para ninguém
 * confundir com persistência.
 *
 * Quando o agendador real existir, este módulo inteiro é substituído por leitura de `core.tarefa`
 * e a interface das telas não muda: elas já consomem `TarefaAutomatica`.
 */

const CHAVE = "meescuta:prototipo:fila-jarvis";

export interface TarefaAutomatica {
  proposta: PropostaTarefa;
  /** por que este tipo pôde nascer sozinho — o fundamento do teto, mostrado na fila */
  fundamento: string;
  criadaEm: number;
  /** a Sarah discordou DEPOIS do fato. A tarefa não some: ela fica marcada. */
  recusada?: boolean;
}

type Ouvinte = (fila: TarefaAutomatica[]) => void;
const ouvintes = new Set<Ouvinte>();

function ler(): TarefaAutomatica[] {
  if (typeof window === "undefined") return [];
  try {
    const cru = window.sessionStorage.getItem(CHAVE);
    const v = cru ? JSON.parse(cru) : [];
    return Array.isArray(v) ? (v as TarefaAutomatica[]) : [];
  } catch {
    // storage bloqueado ou JSON corrompido: fila vazia é degradação honesta
    return [];
  }
}

function gravar(fila: TarefaAutomatica[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CHAVE, JSON.stringify(fila));
  } catch {
    /* sem storage o protótipo perde a travessia entre rotas, e só */
  }
  for (const o of ouvintes) o(fila);
}

/**
 * Cria a tarefa se ela ainda não existe. Idempotente pelo id da proposta: a regra recalcula a
 * cada tique do relógio e devolve a mesma proposta, e sem esta guarda a fila encheria de cópias
 * da mesma tarefa a cada minuto.
 */
export function criarSeNova(t: TarefaAutomatica): boolean {
  const fila = ler();
  if (fila.some((x) => x.proposta.id === t.proposta.id)) return false;
  gravar([t, ...fila]);
  return true;
}

/** A Sarah discordando depois do fato — o desfazer que a D10 exige. */
export function recusarDepois(id: string) {
  gravar(ler().map((t) => (t.proposta.id === id ? { ...t, recusada: true } : t)));
}

export function reativar(id: string) {
  gravar(ler().map((t) => (t.proposta.id === id ? { ...t, recusada: false } : t)));
}

export function limparFila() {
  gravar([]);
}

/**
 * Hook de leitura. Começa VAZIO e só carrega depois da montagem: `sessionStorage` não existe no
 * servidor, e semear o estado inicial com ele daria uma árvore no servidor diferente da do
 * cliente. Um flash de lista vazia é preferível a hidratação divergente.
 */
export function useFilaPrototipo(): TarefaAutomatica[] {
  const [fila, setFila] = useState<TarefaAutomatica[]>([]);
  useEffect(() => {
    setFila(ler());
    const o: Ouvinte = (f) => setFila(f);
    ouvintes.add(o);
    // outra ABA/rota do mesmo protótipo mexeu no storage
    const aoStorage = (e: StorageEvent) => {
      if (e.key === CHAVE) setFila(ler());
    };
    window.addEventListener("storage", aoStorage);
    return () => {
      ouvintes.delete(o);
      window.removeEventListener("storage", aoStorage);
    };
  }, []);
  return fila;
}
