/**
 * MODO ENSAIO (W-D2, 10/09/2026) — a tela inteira sem login e sem banco.
 *
 * As fixtures de dashboard, tarefas e marketing já existiam, cada uma com a própria flag
 * (`NEXT_PUBLIC_DASHBOARD_ENSAIO`, `NEXT_PUBLIC_TAREFAS_ENSAIO`, `NEXT_PUBLIC_MARKETING_ENSAIO`).
 * Esta é a flag que liga o RESTO — sessão, conversas, canais, membros, agentes, funil — e é
 * guardada por DUAS condições, as duas duras: a variável E `NODE_ENV !== "production"`. Um build
 * de produção com a variável esquecida no painel continua exigindo login. A guarda não é
 * configurável de propósito: é a única coisa que separa "ensaio" de "porta dos fundos".
 *
 * Este módulo é PURO (sem `next/headers`, sem cliente de banco) porque o `middleware.ts` o
 * importa, e o middleware roda no runtime de edge em toda requisição.
 */

export function ensaioLigado(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEXT_PUBLIC_ENSAIO === "1" && env.NODE_ENV !== "production";
}

/** `?como=sara` é a porta de entrada; o cookie é a sede — mesmo desenho do departamento. */
export const PARAM_COMO = "como";
export const COOKIE_COMO = "me_escuta_ensaio_como";
export const MAX_AGE_COMO = 60 * 60 * 24 * 30;

export type ChavePessoa = "sara" | "rodolfo" | "diogo" | "fono";

export interface PessoaEnsaio {
  chave: ChavePessoa;
  id: string;
  nome: string;
  email: string;
  papel: "owner" | "admin" | "membro" | "marketing";
  /** Vínculos em `core.usuario_departamento` (R1/R5 do contrato D91). */
  departamentos: Array<{ departamento: string; papel_no_departamento: "membro" | "gestor" }>;
  /** Canal `lite:%` cuja `config_jsonb.responsavel_id` é esta pessoa (R1). */
  canalProprio: string | null;
  /** Uma frase para o seletor "ver como…" — o que essa pessoa É na operação. */
  descricao: string;
}

export const PESSOAS: readonly PessoaEnsaio[] = [
  {
    chave: "sara",
    id: "e0000000-0000-4000-8000-000000000001",
    nome: "Sara Oliveira",
    email: "sara@meescuta.com",
    papel: "membro",
    departamentos: [{ departamento: "pre_venda", papel_no_departamento: "gestor" }],
    canalProprio: "lite:sara",
    descricao: "Gestora de Pré-venda · qualifica os leads",
  },
  {
    chave: "rodolfo",
    id: "e0000000-0000-4000-8000-000000000002",
    nome: "Rodolfo Andrade",
    email: "rodolfo@meescuta.com",
    papel: "admin",
    departamentos: [],
    canalProprio: null,
    descricao: "Admin · vê tudo, sem departamento",
  },
  {
    chave: "diogo",
    id: "e0000000-0000-4000-8000-000000000003",
    nome: "Diogo Tambasco",
    email: "tech@meescuta.com",
    papel: "owner",
    departamentos: [],
    canalProprio: null,
    descricao: "Proprietário · construção do sistema",
  },
  {
    chave: "fono",
    id: "e0000000-0000-4000-8000-000000000004",
    nome: "Ana Paula Ferreira",
    email: "anapaula@meescuta.com",
    papel: "membro",
    departamentos: [{ departamento: "clinico", papel_no_departamento: "membro" }],
    canalProprio: "lite:ana-paula",
    descricao: "Fonoaudióloga · atende pelo próprio número",
  },
] as const;

export const PESSOA_PADRAO: ChavePessoa = "rodolfo";

export function ehChavePessoa(v: unknown): v is ChavePessoa {
  return typeof v === "string" && PESSOAS.some((p) => p.chave === v);
}

export function pessoaPorChave(chave: string | null | undefined): PessoaEnsaio {
  const p = PESSOAS.find((x) => x.chave === chave);
  return p ?? PESSOAS.find((x) => x.chave === PESSOA_PADRAO)!;
}

export function pessoaPorId(id: string | null | undefined): PessoaEnsaio | null {
  return PESSOAS.find((x) => x.id === id) ?? null;
}
