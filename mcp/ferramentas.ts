import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { lerMarketingCom, type ClienteLeitura } from "@/lib/dados/marketing-leitura";
import { periodoDaUrl, type NivelOrigem } from "@/lib/dados/marketing-calculos";
import * as f from "./formato";

/**
 * As FERRAMENTAS do MCP de marketing.
 *
 * 🔴 POR QUE NÃO EXISTE UMA FERRAMENTA DE SQL CRU, e isso é decisão e não falta de tempo: a RLS
 * responde consultas pela METADE. Um `select` que o papel `marketing` não pode ler inteiro não
 * volta com erro — volta com menos linhas. Quem escreveu a consulta lê o resultado como o fato,
 * e o fato era outro. Ferramenta de domínio não tem esse modo de falha: ela pergunta sempre a
 * mesma coisa, pelo mesmo caminho que a tela usa, e o que a RLS cortar aparece na cobertura.
 *
 * ⭐ TODAS chamam `lerMarketingCom` — a MESMA função que a tela `/marketing` chama. Não há uma
 * segunda consulta, nem uma segunda agregação: se o MCP e a tela discordarem, é bug de recorte
 * aqui, nunca divergência de regra. Essa é a razão de o MCP morar neste repositório.
 *
 * Custo aceito: uma pergunta = uma leitura completa do período (toques + custo + etapas). Para
 * os volumes de hoje (567 captações, 109 linhas de custo) é barato, e a alternativa — cache —
 * traria de volta a chance de responder com número velho sem dizer que é velho.
 */

/** Os três parâmetros de período, iguais aos da URL da tela. */
const PERIODO = {
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe("Data inicial YYYY-MM-DD (inclusiva). Se omitida, usa o preset `p`."),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe("Data final YYYY-MM-DD (INCLUSIVA — o dia entra no resultado)."),
  p: z.enum(["7d", "30d", "90d"]).optional()
    .describe("Atalho de período. Padrão: 30d. Ignorado quando `de` e `ate` vêm juntos."),
};

type ArgsPeriodo = { de?: string; ate?: string; p?: string };

function texto(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

export function registrarFerramentas(servidor: McpServer, cliente: ClienteLeitura): void {
  /** Roda a leitura uma vez e entrega para o formatador escolhido. */
  const comVisao = async (args: ArgsPeriodo, titulo: string, corpo: (v: Awaited<ReturnType<typeof lerMarketingCom>>) => string) => {
    const periodo = periodoDaUrl(args);
    const visao = await lerMarketingCom(cliente, periodo);
    return texto(f.responder(visao, titulo, corpo(visao)));
  };

  servidor.registerTool(
    "marketing_visao_geral",
    {
      title: "Visão geral de marketing",
      description:
        "O panorama do período: total de leads, fração paga, gasto, custo por lead, e a árvore de origem " +
        "(pago/orgânico → plataforma → campanha → anúncio). Comece por aqui quando a pergunta for ampla.",
      inputSchema: PERIODO,
    },
    async (args: ArgsPeriodo) =>
      comVisao(args, "Visão geral de marketing", (v) => `${f.resumo(v)}\n\nOrigem dos leads:\n${f.arvore(v.arvore)}`),
  );

  servidor.registerTool(
    "marketing_origem",
    {
      title: "Origem dos leads por nível",
      description:
        "De onde vieram os leads, num nível específico: `balde` (pago/orgânico), `plataforma` (Meta/Google), " +
        "`campanha` ou `anuncio`. Use quando a pergunta for 'de qual anúncio/campanha veio'.",
      inputSchema: {
        ...PERIODO,
        nivel: z.enum(["balde", "plataforma", "campanha", "anuncio"])
          .describe("O nível de detalhe da resposta."),
      },
    },
    async (args: ArgsPeriodo & { nivel: NivelOrigem }) =>
      comVisao(args, `Origem dos leads — nível ${args.nivel}`, (v) => f.nivel(v, args.nivel)),
  );

  servidor.registerTool(
    "marketing_campanhas",
    {
      title: "Campanhas: leads, gasto e custo por lead",
      description:
        "A tabela de campanhas do período, ordenada por gasto: leads, gasto em mídia, custo por lead e as " +
        "cidades da segmentação. Use para comparar performance entre campanhas.",
      inputSchema: PERIODO,
    },
    async (args: ArgsPeriodo) => comVisao(args, "Campanhas", (v) => f.campanhas(v)),
  );

  servidor.registerTool(
    "marketing_funil",
    {
      title: "Funil por origem",
      description:
        "Quantos leads de cada origem chegaram a qualificado, consulta e venda — com as taxas. Use para saber " +
        "qual campanha traz lead que CONVERTE, não só lead que chega.",
      inputSchema: PERIODO,
    },
    async (args: ArgsPeriodo) => comVisao(args, "Funil por origem", (v) => f.funil(v)),
  );

  servidor.registerTool(
    "marketing_serie",
    {
      title: "Leads por dia",
      description:
        "A série diária de leads no período, separada por Meta, Google, orgânico e outros. Use para ver " +
        "tendência, efeito de mudança de campanha, ou dia atípico.",
      inputSchema: PERIODO,
    },
    async (args: ArgsPeriodo) => comVisao(args, "Leads por dia", (v) => f.serie(v)),
  );

  servidor.registerTool(
    "marketing_cobertura",
    {
      title: "Cobertura da atribuição",
      description:
        "Quantos leads do período têm origem identificada e quantos não têm. Responde 'estou conseguindo saber " +
        "de onde vêm os leads?' — que é diferente de 'quantos leads vieram'. Use antes de concluir que uma " +
        "campanha não trouxe ninguém: pode ser que tenha trazido sem identificador.",
      inputSchema: PERIODO,
    },
    async (args: ArgsPeriodo) => comVisao(args, "Cobertura da atribuição", (v) => f.cobertura(v)),
  );

  servidor.registerTool(
    "marketing_lead",
    {
      title: "A origem de um lead específico",
      description:
        "Todos os toques de captação registrados para um lead: fonte, plataforma, campanha, anúncio, utm e " +
        "identificadores de clique (gclid/fbclid). Use quando a pergunta for sobre UM lead.",
      inputSchema: {
        lead_id: z.string().uuid().describe("O identificador do lead (uuid)."),
      },
    },
    async ({ lead_id }: { lead_id: string }) => {
      const { data, error } = await cliente
        .schema("core")
        .from("captacao")
        .select(
          "capturado_em,fonte,plataforma,campanha_id,campanha_nome,conjunto_id,conjunto_nome,anuncio_id,anuncio_nome,form_id,utm,clids,hierarquia_estado",
        )
        .eq("lead_id", lead_id)
        .order("capturado_em", { ascending: true });

      // Erro NÃO vira lista vazia: "não consegui ler" e "não há toque" são fatos diferentes, e
      // confundi-los aqui faria o modelo afirmar que o lead não tem origem.
      if (error) {
        return texto(`Não consegui ler os toques do lead ${lead_id}: ${error.message}. NÃO conclua que ele não tem origem.`);
      }
      if (!data || data.length === 0) {
        return texto(
          `Nenhum toque de captação registrado para o lead ${lead_id}. ` +
            `Isso significa que a origem dele não foi capturada — não que ele veio do orgânico.`,
        );
      }

      const linhas = data.map((t: any, i: number) => {
        const partes = [
          `Toque ${i + 1} — ${t.capturado_em}`,
          `  fonte: ${t.fonte ?? "—"} · plataforma: ${t.plataforma ?? "—"} · estado: ${t.hierarquia_estado ?? "—"}`,
          `  campanha: ${t.campanha_nome ?? t.campanha_id ?? "—"}`,
          `  conjunto: ${t.conjunto_nome ?? t.conjunto_id ?? "—"}`,
          `  anúncio: ${t.anuncio_nome ?? t.anuncio_id ?? "—"}`,
          `  formulário: ${t.form_id ?? "—"}`,
          `  utm: ${JSON.stringify(t.utm ?? {})}`,
          `  cliques: ${JSON.stringify(t.clids ?? {})}`,
        ];
        return partes.join("\n");
      });

      return texto(
        `## Origem do lead ${lead_id}\n\n` +
          `A atribuição usa o PRIMEIRO toque; os seguintes ficam como histórico.\n\n${linhas.join("\n\n")}`,
      );
    },
  );
}
