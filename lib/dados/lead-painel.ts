import { criarClienteServidor } from "@/lib/supabase/server";
import { parseConfigFicha, type GrupoFicha } from "./ficha-calculos";
import {
  LIMITE_HISTORICO,
  TIPOS_HISTORICO,
  tipoDoHistorico,
  type EventoHistorico,
  type TipoHistorico,
} from "@/components/lead/regras/historico.ts";

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
  /**
   * M4 · histórico de status e responsável. `historico.eventos: null` significa **a leitura
   * falhou** e é DIFERENTE de `[]`, que significa "este lead não tem eventos". A aba precisa
   * distinguir os dois: dizer "sem histórico" quando a consulta morreu ensina a pessoa a parar
   * de procurar.
   */
  historico: HistoricoDoLead;
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

  // colunas do Bloco A primeiro; sem elas (migration 0037 ainda não aplicada) volta pro shape R8
  let { data, error } = await consulta(COLUNAS_TAREFA_R13);
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

/**
 * M4 · o histórico do lead a partir do LEDGER. É a primeira vez que a ficha lê `core.evento` —
 * ela lia `tarefa`, `anotacao`, `mencao` e `lead_campo`, todas projeções. Não há precedente de
 * custo para herdar, então o custo foi medido: 0,098 ms / 14 buffers, contra 0,149 ms da
 * `core.mencao` que já está no conjunto.
 *
 * FONTE ÚNICA COM DEGRADAÇÃO, no padrão que este arquivo já usa (`COLUNAS_TAREFA_R13` → `R8`):
 * tenta `core.v_evento_lead` (entregável do M1) e cai para `core.evento` cru. A degradação é
 * **equivalente**, não mais rápida: medido contra a view REAL (não contra a simulação por CTE da
 * spec), **11 buffers contra 11**, mesmo `Index Scan using evento_lead_id_idx`. O "14 contra 19"
 * que esta linha afirmava antes era da simulação e **não sobreviveu à view real** — as pernas 2, 3
 * e 0 não são podadas sob `.eq("lead_id", …)`, mas resolvem por índice com `rows=0` e o lateral do
 * degrau 3 fica `never executed`. A view não custa nada aqui, e a fonte única é escolha de
 * arquitetura (ARB-R18-39), não uma dívida de desempenho.
 *
 * NUNCA `payload` inteiro: 7.087 bytes contra 157 no lead mais pesado, 45×. As cinco chaves são
 * projetadas no PostgREST (`etapa_de:payload->>etapa_de`) — sintaxe medida contra um stack local
 * antes de entrar, porque não havia precedente dela neste repo e o modo de falha seria silencioso:
 * select que erra vira histórico vazio, e vazio parece resposta.
 */
const PROJECAO_HISTORICO =
  "id,posicao_global,tipo,ator,origem,criado_em," +
  "etapa_de:payload->>etapa_de,etapa_para:payload->>etapa_para," +
  "etapa_inicial:payload->>etapa,dono_id:payload->>dono_id,motivo:payload->>motivo";

export interface HistoricoDoLead {
  /** `null` = a leitura FALHOU. `[]` = este lead não tem eventos. São coisas diferentes. */
  eventos: EventoHistorico[] | null;
  /**
   * `core.lead.dono` — o responsável vindo do sistema antigo, texto livre (`kommo:10248863`).
   *
   * ⚠ NÃO CONFUNDIR com `core.conversa.dono_atual`, que é quem assumiu a CONVERSA da IA. São dois
   * conceitos com nome parecido em tabelas diferentes, e trocá-los faria a aba afirmar que a
   * pessoa que atendeu no chat é a responsável pelo lead. É a armadilha do nome sobrecarregado.
   */
  donoLegado: string | null;
}

async function lerHistorico(supabase: Supabase, leadId: string): Promise<HistoricoDoLead> {
  const consulta = (fonte: string) =>
    supabase
      .schema("core")
      .from(fonte)
      .select(PROJECAO_HISTORICO)
      .eq("lead_id", leadId)
      .in("tipo", TIPOS_HISTORICO as unknown as string[])
      .order("posicao_global", { ascending: false })
      .limit(LIMITE_HISTORICO);

  // as duas em PARALELO: o dono legado é um lookup por chave primária e não tem por que
  // serializar atrás do ledger.
  const [eventosRes, donoRes] = await Promise.all([
    (async () => {
      let r = await consulta("v_evento_lead");
      if (r.error) r = await consulta("evento");
      return r;
    })(),
    // `lead_id`, NÃO `id`: `core.lead` não tem coluna `id` (E-197). Com `id`, o PostgREST devolvia
    // 400/42703 e o `donoRes.error` abaixo transformava o erro em `null` — o dono legado era nulo em
    // 100% dos casos, e a tela mostrava o mesmo que mostraria para um lead legitimamente sem dono.
    supabase.schema("core").from("lead").select("dono").eq("lead_id", leadId).maybeSingle(),
  ]);

  const donoLegado = donoRes.error || !donoRes.data ? null : ((donoRes.data as any).dono ?? null);

  const { data, error } = eventosRes;
  // `null` e `[]` são respostas DIFERENTES, e é aqui que a diferença nasce.
  if (error || !data) return { eventos: null, donoLegado };

  const eventos = (data as any[])
    .filter((e) => tipoDoHistorico(e.tipo))
    .map((e) => ({
      id: String(e.id),
      posicao_global: Number(e.posicao_global ?? 0),
      tipo: e.tipo as TipoHistorico,
      ator: String(e.ator ?? ""),
      origem: String(e.origem ?? ""),
      criado_em: String(e.criado_em ?? ""),
      etapa_de: e.etapa_de ?? null,
      etapa_para: e.etapa_para ?? null,
      etapa_inicial: e.etapa_inicial ?? null,
      dono_id: e.dono_id ?? null,
      motivo: e.motivo ?? null,
    }));
  return { eventos, donoLegado };
}

export async function lerPainelLead(leadId: string): Promise<PainelLead> {
  const supabase = criarClienteServidor();
  try {
    // O histórico entra COMO SEXTA CONSULTA CONCORRENTE, não em carregamento tardio no clique.
    // Trocar 0,098 ms de graça no paralelo por uma volta HTTP inteira até a us-west-2 no clique
    // seria pagar caro para economizar nada.
    //
    // ⚠ E `lerHistorico` NUNCA pode levantar: o `catch` externo abaixo devolve TUDO vazio, então
    // um erro escapando daqui mataria a ficha inteira por causa de uma aba. É a armadilha mais
    // provável desta implementação — o `catch` que zera tudo já estava aqui antes de mim.
    const [ficha, tarefas, anotacoes, mencoes, historico] = await Promise.all([
      lerFicha(supabase, leadId),
      lerTarefas(supabase, leadId),
      lerAnotacoes(supabase, leadId),
      lerMencoes(supabase, leadId),
      lerHistorico(supabase, leadId).catch(() => ({ eventos: null, donoLegado: null })),
    ]);
    return { ficha, tarefas, anotacoes, mencoes, historico };
  } catch {
    return {
      ficha: { grupos: null, valores: null },
      tarefas: [],
      anotacoes: [],
      mencoes: [],
      historico: { eventos: null, donoLegado: null },
    };
  }
}
