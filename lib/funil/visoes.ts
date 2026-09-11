import { FILTROS_VAZIOS, type FiltrosFunil } from "@/lib/dados/funil-filtros";
import type { ChaveOrdem } from "@/lib/dados/funil-ordenacao";

/*
 * W-D6 v4 (11/09) · VISÕES SALVAS — o `inbox_saved_views` do LiderHub, na medida do funil.
 *
 * Uma visão é a combinação inteira (filtros + ordem) com um nome. Ela vira uma aba rápida ao lado
 * do segmento: "Minha manhã", "Sem responsável", "BH sem tarefa". É o que transforma um filtro que
 * a pessoa monta toda segunda-feira num clique.
 *
 * Onde mora: COOKIE, nesta rodada de ensaio. E isso é uma decisão declarada, não um atalho — a
 * versão de produção guarda em `core.config` (chave `visoes_funil`, por usuário), porque visão
 * salva é dado de operação e precisa seguir a pessoa entre máquinas. O cookie não vai ao servidor
 * decidir nada: é lido e escrito no navegador, e se vier corrompido volta vazio (visão salva não é
 * crítica o bastante para derrubar a tela).
 *
 * A `busca` NÃO entra na visão salva: uma visão é um recorte estável, e congelar um texto de busca
 * dentro dela faria "Minha manhã" responder a pergunta de terça-feira passada.
 */

export interface VisaoSalva {
  id: string;
  nome: string;
  filtros: FiltrosFunil;
  ordem: ChaveOrdem;
}

export const COOKIE_VISOES = "me_escuta_visoes_funil";
const MAX_VISOES = 8;
const MAX_AGE = 60 * 60 * 24 * 365;

function saneiar(v: unknown): VisaoSalva | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.nome !== "string") return null;
  const filtros = { ...FILTROS_VAZIOS, ...(o.filtros as object | undefined), busca: "" } as FiltrosFunil;
  return { id: o.id, nome: o.nome.slice(0, 40), filtros, ordem: (o.ordem as ChaveOrdem) ?? "prioridade" };
}

export function lerVisoes(): VisaoSalva[] {
  if (typeof document === "undefined") return [];
  try {
    const bruto = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${COOKIE_VISOES}=`))
      ?.slice(COOKIE_VISOES.length + 1);
    if (!bruto) return [];
    const lista = JSON.parse(decodeURIComponent(bruto));
    if (!Array.isArray(lista)) return [];
    return lista.map(saneiar).filter((v): v is VisaoSalva => v !== null).slice(0, MAX_VISOES);
  } catch {
    return [];
  }
}

export function gravarVisoes(visoes: VisaoSalva[]): void {
  if (typeof document === "undefined") return;
  const valor = encodeURIComponent(JSON.stringify(visoes.slice(0, MAX_VISOES)));
  document.cookie = `${COOKIE_VISOES}=${valor}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}

/** Esta visão é a que está na tela? Compara o recorte, ignorando a busca (que não entra na visão). */
export function visaoAtiva(v: VisaoSalva, filtros: FiltrosFunil, ordem: ChaveOrdem): boolean {
  return v.ordem === ordem && JSON.stringify({ ...v.filtros, busca: "" }) === JSON.stringify({ ...filtros, busca: "" });
}

export function novaVisao(nome: string, filtros: FiltrosFunil, ordem: ChaveOrdem): VisaoSalva {
  return {
    id: `v${Date.now().toString(36)}`,
    nome: nome.trim().slice(0, 40) || "Sem nome",
    filtros: { ...filtros, busca: "" },
    ordem,
  };
}
