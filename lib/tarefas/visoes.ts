import { FILTROS_PADRAO, type FiltrosTarefas } from "@/lib/dados/tarefas-visao-calculos";
import { ehChaveOrdem, type ChaveOrdem } from "@/lib/tarefas/prioridade";

/*
 * VISÕES SALVAS DE /tarefas (W-T v4, 11/09) — o mesmo desenho que o funil ganhou na v4, porque
 * duas telas que salvam recorte de jeitos diferentes é uma coisa a mais para aprender sem motivo.
 *
 * Uma visão é filtros + ordem com um nome: "Minha manhã", "Vencidas da Sara", "Pós-venda da
 * semana". É o que transforma o recorte que alguém monta toda segunda num clique.
 *
 * Onde mora: COOKIE, e isso é decisão declarada, não atalho. Em produção vai para `core.config`
 * (chave `visoes_tarefas`, por usuário) — visão salva é dado de operação e precisa seguir a pessoa
 * de máquina em máquina. Cookie corrompido volta vazio: visão salva não é crítica o bastante para
 * derrubar a tela.
 *
 * A BUSCA não entra na visão. Uma visão é um recorte estável; congelar um texto de busca dentro
 * dela faria "Minha manhã" responder a pergunta de terça-feira passada. O mesmo vale para `foco`.
 */

export interface VisaoTarefasSalva {
  id: string;
  nome: string;
  filtros: FiltrosTarefas;
  ordem: ChaveOrdem;
  /** lista · quadro · calendário — a forma faz parte do recorte ("a semana" é calendário) */
  forma: FormaVisao;
}

export type FormaVisao = "lista" | "quadro" | "calendario";

export function ehForma(v: unknown): v is FormaVisao {
  return v === "lista" || v === "quadro" || v === "calendario";
}

export const COOKIE_VISOES_TAREFAS = "me_escuta_visoes_tarefas";
const MAX = 8;
const MAX_AGE = 60 * 60 * 24 * 365;

function sanear(v: unknown): VisaoTarefasSalva | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.nome !== "string") return null;
  return {
    id: o.id,
    nome: o.nome.slice(0, 40),
    filtros: { ...FILTROS_PADRAO, ...(o.filtros as object | undefined), busca: "" } as FiltrosTarefas,
    ordem: ehChaveOrdem(o.ordem) ? o.ordem : "urgencia",
    forma: ehForma(o.forma) ? o.forma : "lista",
  };
}

export function lerVisoesTarefas(): VisaoTarefasSalva[] {
  if (typeof document === "undefined") return [];
  try {
    const bruto = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${COOKIE_VISOES_TAREFAS}=`))
      ?.slice(COOKIE_VISOES_TAREFAS.length + 1);
    if (!bruto) return [];
    const lista = JSON.parse(decodeURIComponent(bruto));
    if (!Array.isArray(lista)) return [];
    return lista.map(sanear).filter((v): v is VisaoTarefasSalva => v !== null).slice(0, MAX);
  } catch {
    return [];
  }
}

export function gravarVisoesTarefas(visoes: VisaoTarefasSalva[]): void {
  if (typeof document === "undefined") return;
  const valor = encodeURIComponent(JSON.stringify(visoes.slice(0, MAX)));
  document.cookie = `${COOKIE_VISOES_TAREFAS}=${valor}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}

export function novaVisaoTarefas(nome: string, filtros: FiltrosTarefas, ordem: ChaveOrdem, forma: FormaVisao): VisaoTarefasSalva {
  return {
    id: `t${Date.now().toString(36)}`,
    nome: nome.trim().slice(0, 40) || "Sem nome",
    filtros: { ...filtros, busca: "" },
    ordem,
    forma,
  };
}

/** Esta visão é a que está na tela? Compara o recorte inteiro, ignorando a busca. */
export function visaoTarefasAtiva(v: VisaoTarefasSalva, filtros: FiltrosTarefas, ordem: ChaveOrdem, forma: FormaVisao): boolean {
  return v.ordem === ordem && v.forma === forma && JSON.stringify({ ...v.filtros, busca: "" }) === JSON.stringify({ ...filtros, busca: "" });
}
