import { criarClienteServidor } from "@/lib/supabase/server";
import { parseConfigFicha, type GrupoFicha } from "./ficha-calculos";

/**
 * Leitura do PAINEL DO LEAD (Rodada 8) — ficha + tarefas + anotações, mesma sessão/RLS do
 * resto do app. Tudo degrada HONESTO (padrão do deploy-fora-de-ordem da R6):
 *  - config `ficha_lead` ausente → grupos = null (UI: "ficha não configurada");
 *  - projeção core.lead_campo ausente (0028 da Trilha DB ainda não aplicada) → valores = null
 *    (UI: campos read-only com aviso; edição desabilitada pra não gravar evento que a projeção
 *    não reflete ainda);
 *  - tarefas/anotações: leitura de core.tarefa/core.anotacao (0011, já no remoto).
 */

export interface TarefaLead {
  id: string; // = evento.id do tarefa_criada — é o tarefa_id do contrato de conclusão
  titulo: string;
  responsavel: string | null;
  prazo: string | null;
  status: string; // 'pendente' | 'concluida'
  resultado: string | null;
  criado_em: string;
  concluida_em: string | null;
}

export interface AnotacaoLead {
  id: string;
  autor: string | null;
  texto: string;
  criado_em: string;
}

export interface FichaDoLead {
  grupos: GrupoFicha[] | null; // null = config ficha_lead não existe (ainda)
  valores: Record<string, unknown> | null; // null = projeção lead_campo indisponível (0028 pendente)
}

export interface PainelLead {
  ficha: FichaDoLead;
  tarefas: TarefaLead[];
  anotacoes: AnotacaoLead[];
}

type Supabase = ReturnType<typeof criarClienteServidor>;

async function lerFicha(supabase: Supabase, leadId: string): Promise<FichaDoLead> {
  const { data: cfg, error: erroCfg } = await supabase
    .schema("core")
    .from("v_config_vigente")
    .select("payload")
    .eq("nome", "ficha_lead")
    .maybeSingle();
  const grupos = erroCfg || !cfg ? null : parseConfigFicha(cfg.payload);
  if (!grupos) return { grupos: null, valores: null }; // sem definição, valores não têm onde aparecer

  // Projeção 0028 (Trilha DB, paralela): select explícito — tabela/coluna ausente ERRA e o
  // erro vira degrade (valores = null), nunca tela morta.
  const { data, error } = await supabase
    .schema("core")
    .from("lead_campo")
    .select("campo,valor")
    .eq("lead_id", leadId)
    .limit(500);
  if (error || !data) return { grupos, valores: null };
  const valores: Record<string, unknown> = {};
  for (const r of data as any[]) valores[String(r.campo)] = r.valor;
  return { grupos, valores };
}

async function lerTarefas(supabase: Supabase, leadId: string): Promise<TarefaLead[]> {
  const { data, error } = await supabase
    .schema("core")
    .from("tarefa")
    .select("id,titulo,responsavel,prazo,status,resultado,criado_em,concluida_em")
    .eq("lead_id", leadId)
    .order("criado_em", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return (data as any[]).map((t) => ({
    id: String(t.id),
    titulo: String(t.titulo ?? "(sem título)"),
    responsavel: t.responsavel ?? null,
    prazo: t.prazo ?? null,
    status: String(t.status ?? "pendente"),
    resultado: t.resultado ?? null,
    criado_em: String(t.criado_em),
    concluida_em: t.concluida_em ?? null,
  }));
}

async function lerAnotacoes(supabase: Supabase, leadId: string): Promise<AnotacaoLead[]> {
  const { data, error } = await supabase
    .schema("core")
    .from("anotacao")
    .select("id,autor,texto,criado_em")
    .eq("lead_id", leadId)
    .order("criado_em", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return (data as any[]).map((a) => ({
    id: String(a.id),
    autor: a.autor ?? null,
    texto: String(a.texto ?? ""),
    criado_em: String(a.criado_em),
  }));
}

export async function lerPainelLead(leadId: string): Promise<PainelLead> {
  const supabase = criarClienteServidor();
  try {
    const [ficha, tarefas, anotacoes] = await Promise.all([
      lerFicha(supabase, leadId),
      lerTarefas(supabase, leadId),
      lerAnotacoes(supabase, leadId),
    ]);
    return { ficha, tarefas, anotacoes };
  } catch {
    return { ficha: { grupos: null, valores: null }, tarefas: [], anotacoes: [] };
  }
}
