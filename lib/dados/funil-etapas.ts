/**
 * As ETAPAS do funil — tipos, padrão estrutural e o MAPEAMENTO do `funil_vendas` vigente.
 *
 * POR QUE ESTE ARQUIVO EXISTE, e não é só arrumação: `funil.ts` importa
 * `@/lib/supabase/server`, que importa `next/headers`. Isso torna o módulo inteiro
 * **inalcançável fora do Next** — e o servidor MCP de marketing (`mcp/`) é um processo Node
 * puro, sem requisição, sem cookie.
 *
 * A saída óbvia seria o MCP mapear `funil_vendas` por conta própria. Seria uma SEGUNDA
 * leitura do mesmo payload, com os mesmos defaults escritos duas vezes — e dois mapeamentos
 * do mesmo fato divergem no primeiro dia em que um deles muda. Como a razão de existir do MCP
 * é dar exatamente os números da tela, a divergência sairia justamente onde ela é mais cara.
 *
 * Então o mapeamento mora aqui, puro e sem I/O, e os dois lados chamam ele:
 *   · `lib/dados/funil.ts` (tela)          → lê do banco e chama `mapearEtapas`
 *   · `lib/dados/marketing-leitura.ts`     → idem, sem tocar em `next/headers`
 *
 * `funil.ts` REEXPORTA `ETAPAS_PADRAO`, `EtapaFunil` e `TipoEtapa` para que os quatro
 * importadores existentes (`dashboard.ts`, `sidebar.ts`, `conversas/page.tsx`, o próprio
 * board) continuem funcionando sem tocar em nenhum deles.
 */

/**
 * R23: `arquivado` é um tipo real da config vigente — não uma etapa do funil. Deixá-lo fora do
 * union era o que fazia o TypeScript concordar com um board que a produção já contradizia.
 */
export type TipoEtapa = "aberto" | "ganho" | "perdido" | "arquivado";

export interface EtapaFunil {
  chave: string; // 'novo', 'qualificando', … (contrato: chave, não id)
  nome: string;
  cor: string; // hex
  tipo: TipoEtapa;
  ordem: number;
  /**
   * R23 · a config marca com `no_board: true` a etapa que EXISTE no funil mas não é coluna de
   * trabalho (hoje: `arquivado`, com 582 dos 679 leads). O campo estava na config e o código não
   * o lia — ver o comentário de `chavesDoBoard`.
   */
  no_board: boolean;
}

// ─────────────── etapas padrão (espelho do funil_vendas v2 real) ───────────────

export const ETAPAS_PADRAO: EtapaFunil[] = [
  { chave: "novo", nome: "Novo lead", cor: "#94a3b8", tipo: "aberto", ordem: 1, no_board: false },
  { chave: "qualificando", nome: "Qualificando", cor: "#38bdf8", tipo: "aberto", ordem: 2, no_board: false },
  { chave: "avaliacao", nome: "Avaliação auditiva", cor: "#a78bfa", tipo: "aberto", ordem: 3, no_board: false },
  { chave: "proposta", nome: "Proposta enviada", cor: "#fbbf24", tipo: "aberto", ordem: 4, no_board: false },
  { chave: "negociacao", nome: "Negociação", cor: "#fb923c", tipo: "aberto", ordem: 5, no_board: false },
  { chave: "ganho", nome: "Ganho", cor: "#34d399", tipo: "ganho", ordem: 90, no_board: false },
  { chave: "perdido", nome: "Perdido", cor: "#f87171", tipo: "perdido", ordem: 91, no_board: false },
];

/**
 * Mapeia o `payload` de `core.v_config_vigente` (nome='funil_vendas') para as etapas.
 *
 * `null` quando não dá para saber — payload ausente, sem `etapas`, ou lista vazia. Quem chama
 * decide o que fazer com o `null`; aqui ele nunca vira `ETAPAS_PADRAO` em silêncio, porque
 * "não consegui ler a config" e "a config diz isto" são fatos diferentes.
 */
export function mapearEtapas(payload: unknown): EtapaFunil[] | null {
  const etapas = (payload as { etapas?: unknown } | null | undefined)?.etapas;
  if (!Array.isArray(etapas) || etapas.length === 0) return null;
  return etapas
    .map((e: any, i: number) => ({
      chave: String(e.chave ?? e.id ?? i),
      nome: String(e.nome ?? e.chave),
      cor: String(e.cor ?? ETAPAS_PADRAO[i]?.cor ?? "#94a3b8"),
      tipo: (e.tipo ?? "aberto") as TipoEtapa,
      ordem: Number(e.ordem ?? i + 1),
      // `no_board` explícito OU tipo 'arquivado': as duas marcas dizem a mesma coisa, e ler as
      // duas evita que uma config futura que use só uma delas volte a encher o board.
      no_board: e.no_board === true || e.tipo === "arquivado",
    }))
    .sort((a, b) => a.ordem - b.ordem);
}
