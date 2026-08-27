import { criarClienteServidor } from "@/lib/supabase/server";
import { parseConfigFicha, type GrupoFicha } from "./ficha-calculos";

/**
 * Leitura do PAINEL DO LEAD (Rodada 8; evoluído na Rodada 13 / Bloco C) — ficha + tarefas +
 * anotações + menções. Tudo degrada HONESTO (padrão do deploy-fora-de-ordem da R6):
 *  - config `ficha_lead` ausente → grupos = null (UI: "ficha não configurada");
 *  - projeção core.lead_campo ausente → valores = null;
 *  - colunas novas de core.tarefa/core.anotacao (responsavel_id, tipo, descricao, autor_id —
 *    migration do BLOCO A) ausentes → cai pro select antigo e a UI mostra o que existe;
 *  - core.mencao (projeção do BLOCO B) ausente → menções = [] e o acuse de leitura some.
 * Nenhum desses casos vira tela morta: os três blocos da rodada sobem em ordens diferentes.
 */

export interface TarefaLead {
  id: string; // = evento.id do tarefa_criada — é o tarefa_id do contrato de conclusão
  titulo: string;
  /** legado texto livre (e-mail hoje) — mantido para tarefas antigas. */
  responsavel: string | null;
  /** uuid de core.usuario (Bloco A). null quando a coluna ainda não existe. */
  responsavel_id: string | null;
  descricao: string | null;
  tipo: string | null;
  prazo: string | null;
  status: string; // 'pendente' | 'concluida' | 'arquivada'
  resultado: string | null;
  criado_em: string;
  concluida_em: string | null;
  /**
   * F2 / D62 (0298): a tarefa que o Jarvis criou a partir da conversa carrega o POR QUE, o
   * FAZER e o TRECHO citado; `origem = 'jarvis_conversa'` é o que a timeline usa para
   * distinguir. null nas tarefas humanas e enquanto a 0298 não estiver aplicada.
   */
  por_que: string | null;
  fazer: string | null;
  trecho: string | null;
  origem: string | null;
}

export interface AnotacaoLead {
  id: string;
  autor: string | null;
  autor_id: string | null;
  tipo: string | null;
  texto: string;
  criado_em: string;
}

export interface MencaoLead {
  id: string;
  mencionado_id: string;
  autor_id: string | null;
  origem_tipo: string;
  origem_id: string;
  trecho: string | null;
  criado_em: string;
  lida_em: string | null;
}

export interface FichaDoLead {
  grupos: GrupoFicha[] | null; // null = config ficha_lead não existe (ainda)
  valores: Record<string, unknown> | null; // null = projeção lead_campo indisponível
}

export interface PainelLead {
  ficha: FichaDoLead;
  tarefas: TarefaLead[];
  anotacoes: AnotacaoLead[];
  /** vazio também quando core.mencao ainda não existe (Bloco B). */
  mencoes: MencaoLead[];
}

type Supabase = ReturnType<typeof criarClienteServidor>;

async function lerFicha(supabase: Supabase, leadId: string): Promise<FichaDoLead> {
  // config + valores em paralelo (não dependem um do outro); se a config não existir os
  // valores são descartados — mesmo resultado de antes, um round-trip a menos
  const [cfgRes, camposRes] = await Promise.all([
    supabase.schema("core").from("v_config_vigente").select("payload").eq("nome", "ficha_lead").maybeSingle(),
    // Projeção 0028 (Trilha DB, paralela): select explícito — tabela/coluna ausente ERRA e o
    // erro vira degrade (valores = null), nunca tela morta.
    supabase.schema("core").from("lead_campo").select("campo,valor").eq("lead_id", leadId).limit(500),
  ]);
  const grupos = cfgRes.error || !cfgRes.data ? null : parseConfigFicha(cfgRes.data.payload);
  if (!grupos) return { grupos: null, valores: null }; // sem definição, valores não têm onde aparecer

  const { data, error } = camposRes;
  if (error || !data) return { grupos, valores: null };
  const valores: Record<string, unknown> = {};
  for (const r of data as any[]) valores[String(r.campo)] = r.valor;
  return { grupos, valores };
}

const COLUNAS_TAREFA_R27 =
  "id,titulo,responsavel,responsavel_id,descricao,tipo,prazo,status,resultado,criado_em,concluida_em,por_que,fazer,trecho,origem";
const COLUNAS_TAREFA_R13 =
  "id,titulo,responsavel,responsavel_id,descricao,tipo,prazo,status,resultado,criado_em,concluida_em";
const COLUNAS_TAREFA_R8 = "id,titulo,responsavel,prazo,status,resultado,criado_em,concluida_em";

async function lerTarefas(supabase: Supabase, leadId: string): Promise<TarefaLead[]> {
  const consulta = (colunas: string) =>
    supabase
      .schema("core")
      .from("tarefa")
      .select(colunas)
      .eq("lead_id", leadId)
      .order("criado_em", { ascending: false })
      .limit(100);

  // colunas da 0298 primeiro (F2); sem elas, as do Bloco A; sem elas, o shape R8
  let { data, error } = await consulta(COLUNAS_TAREFA_R27);
  if (error) ({ data, error } = await consulta(COLUNAS_TAREFA_R13));
  if (error) ({ data, error } = await consulta(COLUNAS_TAREFA_R8));
  if (error || !data) return [];

  return (data as any[]).map((t) => ({
    id: String(t.id),
    titulo: String(t.titulo ?? "(sem título)"),
    responsavel: t.responsavel ?? null,
    responsavel_id: t.responsavel_id ?? null,
    descricao: t.descricao ?? null,
    tipo: t.tipo ?? null,
    prazo: t.prazo ?? null,
    status: String(t.status ?? "pendente"),
    resultado: t.resultado ?? null,
    criado_em: String(t.criado_em),
    concluida_em: t.concluida_em ?? null,
    por_que: t.por_que ?? null,
    fazer: t.fazer ?? null,
    trecho: t.trecho ?? null,
    origem: t.origem ?? null,
  }));
}

const COLUNAS_ANOTACAO_R13 = "id,autor,autor_id,tipo,texto,criado_em";
const COLUNAS_ANOTACAO_R8 = "id,autor,texto,criado_em";

async function lerAnotacoes(supabase: Supabase, leadId: string): Promise<AnotacaoLead[]> {
  const consulta = (colunas: string) =>
    supabase
      .schema("core")
      .from("anotacao")
      .select(colunas)
      .eq("lead_id", leadId)
      .order("criado_em", { ascending: false })
      .limit(100);

  let { data, error } = await consulta(COLUNAS_ANOTACAO_R13);
  if (error) ({ data, error } = await consulta(COLUNAS_ANOTACAO_R8));
  if (error || !data) return [];

  return (data as any[]).map((a) => ({
    id: String(a.id),
    autor: a.autor ?? null,
    autor_id: a.autor_id ?? null,
    tipo: a.tipo ?? null,
    texto: String(a.texto ?? ""),
    criado_em: String(a.criado_em),
  }));
}

/**
 * Menções do lead (projeção do Bloco B). A RLS de lá corta por pessoa — só o mencionado e o
 * autor enxergam —, então esta lista já chega filtrada pela sessão. Sem a tabela, silêncio.
 */
async function lerMencoes(supabase: Supabase, leadId: string): Promise<MencaoLead[]> {
  const { data, error } = await supabase
    .schema("core")
    .from("mencao")
    .select("id,mencionado_id,autor_id,origem_tipo,origem_id,trecho,criado_em,lida_em")
    .eq("lead_id", leadId)
    .order("criado_em", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return (data as any[]).map((m) => ({
    id: String(m.id),
    mencionado_id: String(m.mencionado_id),
    autor_id: m.autor_id ?? null,
    origem_tipo: String(m.origem_tipo ?? ""),
    origem_id: String(m.origem_id ?? ""),
    trecho: m.trecho ?? null,
    criado_em: String(m.criado_em),
    lida_em: m.lida_em ?? null,
  }));
}

export async function lerPainelLead(leadId: string): Promise<PainelLead> {
  const supabase = criarClienteServidor();
  try {
    const [ficha, tarefas, anotacoes, mencoes] = await Promise.all([
      lerFicha(supabase, leadId),
      lerTarefas(supabase, leadId),
      lerAnotacoes(supabase, leadId),
      lerMencoes(supabase, leadId),
    ]);
    return { ficha, tarefas, anotacoes, mencoes };
  } catch {
    return { ficha: { grupos: null, valores: null }, tarefas: [], anotacoes: [], mencoes: [] };
  }
}
