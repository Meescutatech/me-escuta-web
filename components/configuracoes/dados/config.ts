/**
 * F14 · LEITURA da configuração de sistema. SERVIDOR.
 *
 * Vigente: `core.v_config_vigente` (JÁ EXISTE — 0009). Histórico: `core.v_config_historico`
 * (nasce na 0082). O histórico degrada para a leitura direta de `core.config` quando a view ainda
 * não subiu, e degrada para "sem histórico" se nem isso — a tela do editor continua de pé, com o
 * vigente, e diz o que não conseguiu ler.
 *
 * O histórico NÃO é varrido do ledger, e a escolha é medida: `core.evento` tem índice em
 * `lead_id`, `tipo` e `criado_em`, e NENHUM em `payload` — a página da Clara lê histórico
 * filtrando por `payload->>agente_alvo`, que é seq scan. `core.config` é imutável e tem
 * `unique(nome, versao)`: ler por linha é exatamente o que a tabela foi desenhada para dar.
 */

import { criarClienteServidor } from "@/lib/supabase/server";
import type { ConfigVigente, Conteudo, VersaoHistorico } from "../regras/config.ts";

export interface VigentesLidos {
  vigentes: ConfigVigente[];
  indisponivel: boolean;
}

export async function lerConfigsVigentes(): Promise<VigentesLidos> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("v_config_vigente")
      .select("nome,versao,payload,vigente_desde")
      .limit(200);
    if (error || !data) return { vigentes: [], indisponivel: true };
    const vigentes = (data as unknown as Record<string, unknown>[])
      .map((l) => ({
        nome: String(l.nome ?? ""),
        versao: Number(l.versao ?? 0),
        payload: (l.payload ?? {}) as Conteudo,
        vigente_desde: l.vigente_desde ? String(l.vigente_desde) : null,
      }))
      .filter((c) => c.nome.length > 0)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return { vigentes, indisponivel: false };
  } catch {
    return { vigentes: [], indisponivel: true };
  }
}

export async function lerConfigVigente(nome: string): Promise<ConfigVigente | null> {
  const { vigentes } = await lerConfigsVigentes();
  return vigentes.find((c) => c.nome === nome) ?? null;
}

export interface HistoricoLido {
  versoes: VersaoHistorico[];
  indisponivel: boolean;
  /** true = veio de core.config cru (sem nome de quem publicou) porque a view não existe ainda. */
  semAutoria: boolean;
}

export async function lerHistoricoConfig(nome: string): Promise<HistoricoLido> {
  const supabase = criarClienteServidor();
  try {
    const { data, error } = await supabase
      .schema("core")
      .from("v_config_historico")
      .select("nome,versao,payload,vigente_desde,criado_por,evento_id,vigente,publicado_por_nome,publicado_por_email")
      .eq("nome", nome)
      .order("versao", { ascending: false })
      .limit(50);
    if (!error && data) {
      return {
        versoes: (data as unknown as Record<string, unknown>[]).map((l) => ({
          nome: String(l.nome ?? nome),
          versao: Number(l.versao ?? 0),
          payload: (l.payload ?? {}) as Conteudo,
          vigente_desde: l.vigente_desde ? String(l.vigente_desde) : null,
          criado_por: l.criado_por ? String(l.criado_por) : null,
          evento_id: l.evento_id ? String(l.evento_id) : null,
          vigente: l.vigente === true,
          publicado_por_nome: l.publicado_por_nome ? String(l.publicado_por_nome) : null,
          publicado_por_email: l.publicado_por_email ? String(l.publicado_por_email) : null,
        })),
        indisponivel: false,
        semAutoria: false,
      };
    }
  } catch {
    /* cai no degrade abaixo */
  }

  // degrade: a tabela crua existe desde a 0001 e dá versão, payload e `criado_por` (que é text
  // livre: os valores reais são `seed:0001`, `sistema:migration-0064`, `demo:diogo`).
  try {
    const { data, error } = await supabase
      .schema("core")
      .from("config")
      .select("nome,versao,payload,vigente_desde,criado_por,evento_id")
      .eq("nome", nome)
      .order("versao", { ascending: false })
      .limit(50);
    if (error || !data) return { versoes: [], indisponivel: true, semAutoria: true };
    const linhas = data as unknown as Record<string, unknown>[];
    const maior = linhas.reduce((m, l) => Math.max(m, Number(l.versao ?? 0)), 0);
    return {
      versoes: linhas.map((l) => ({
        nome: String(l.nome ?? nome),
        versao: Number(l.versao ?? 0),
        payload: (l.payload ?? {}) as Conteudo,
        vigente_desde: l.vigente_desde ? String(l.vigente_desde) : null,
        criado_por: l.criado_por ? String(l.criado_por) : null,
        evento_id: l.evento_id ? String(l.evento_id) : null,
        vigente: Number(l.versao ?? 0) === maior,
        publicado_por_nome: null,
        publicado_por_email: null,
      })),
      indisponivel: false,
      semAutoria: true,
    };
  } catch {
    return { versoes: [], indisponivel: true, semAutoria: true };
  }
}

/**
 * O CONTEXTO que os validadores precisam e que não está no payload: o que está EM USO hoje.
 * É o que transforma "etapas é uma lista" em "esta publicação derruba 582 cards".
 * Cada leitura degrada para `undefined` (= "não sei"), e validador com contexto desconhecido não
 * inventa erro — apenas deixa de avisar. Melhor calar do que reprovar por motivo alheio.
 */
export interface ContextoLido {
  etapasEmUso?: string[];
  tiposTarefaEmUso?: string[];
  slugsFichaEmUso?: string[];
}

export async function lerContextoValidacao(): Promise<ContextoLido> {
  const supabase = criarClienteServidor();
  const ctx: ContextoLido = {};

  try {
    const { data, error } = await supabase.schema("core").from("estado_lead").select("etapa").limit(5000);
    if (!error && data) {
      ctx.etapasEmUso = [
        ...new Set((data as unknown as { etapa: unknown }[]).map((l) => String(l.etapa ?? "")).filter(Boolean)),
      ].sort();
    }
  } catch {
    /* sem contexto: o validador deixa de avisar, não passa a reprovar */
  }

  try {
    const { data, error } = await supabase.schema("core").from("tarefa").select("tipo").limit(5000);
    if (!error && data) {
      ctx.tiposTarefaEmUso = [
        ...new Set((data as unknown as { tipo: unknown }[]).map((l) => String(l.tipo ?? "")).filter(Boolean)),
      ].sort();
    }
  } catch {
    /* idem */
  }

  try {
    const { data, error } = await supabase.schema("core").from("lead_campo").select("slug").limit(5000);
    if (!error && data) {
      ctx.slugsFichaEmUso = [
        ...new Set((data as unknown as { slug: unknown }[]).map((l) => String(l.slug ?? "")).filter(Boolean)),
      ].sort();
    }
  } catch {
    /* idem */
  }

  return ctx;
}
