import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Leitura de CONVERSAS (inbox WhatsApp) + mensagens + propostas da Clara. Schema real (0009):
 *  - core.conversa: id, telefone, lead_id, mode(IA|HUMANO), dono_atual, status, atualizado_em
 *  - core.mensagem: id, conversa_id, direcao(entrada|saida), tipo_conteudo, corpo, criado_em
 *  - core.sugestao_ia: propostas tipo='enviar_mensagem' pendentes (o laço da Clara)
 * Prefere real; cai em MOCK só se não houver conversa (nunca inbox vazio na demo). fonte='mock'→aviso.
 * Visual das bolhas segue Design/front-clara-v1.html (Croqui).
 */

export type ModoConversa = "IA" | "HUMANO";
export type Direcao = "entrada" | "saida";

/**
 * Estado de entrega da mensagem de SAÍDA — contrato SPEC-PIPELINE-MENSAGENS RF-5 (máquina
 * monotônica projetada pela Trilha A em core.mensagem: status_entrega/status_em/erro_codigo).
 * Enquanto a projeção não existir no banco, lerMensagens degrada para o select base e o campo
 * fica undefined — a UI então NÃO mostra check nenhum (fallback honesto, nunca check mentiroso).
 */
export type EstadoEntrega = "na_fila" | "enviando" | "enviado" | "entregue" | "lido" | "falhou";
export type AutorSaida = "clara" | "sara";

export interface ConversaResumo {
  id: string;
  telefone: string | null;
  nome: string | null;
  mode: ModoConversa;
  dono_atual: string | null;
  status: string | null;
  atualizado_em: string | null;
  // enriquecimento p/ a lista (prévia) + painel de contexto do redesign (conversa-v2).
  lead_id?: string | null;
  etapa?: string | null; // chave
  etapa_nome?: string | null; // rótulo de exibição
  entrou_etapa_em?: string | null;
  valor?: number | null;
  origem?: string | null;
  idade?: number | null; // 0011 — null por ora
  previa?: string | null; // corpo da última mensagem
  previa_saida?: boolean; // última msg foi de saída (Você/Clara)
  nao_lida?: boolean; // proxy: última msg foi do cliente (entrada), sem resposta
  nao_lidas_qtd?: number; // proxy: qtde de mensagens de entrada após a última saída (RF-30/31)
}

export interface Mensagem {
  id: string;
  direcao: Direcao;
  tipo_conteudo: string;
  corpo: string | null;
  criado_em: string;
  pendente?: boolean; // bolha local ainda não enviada de fato (envio humano aguardando fila_saida)
  autor?: AutorSaida; // bolha de saída: Clara vs Sara. Sem coluna no banco ainda → Clara (histórico).
  status_entrega?: EstadoEntrega | null; // projeção RF-5 (Trilha A); undefined = sem status (check some)
  erro_codigo?: string | null; // código Meta quando status_entrega='falhou' (ex.: 131047, 131026)
  falha_local?: boolean; // envio otimista que a action recusou — tentar de novo refaz a intenção
  // Pipeline de mídia (contrato rodada 5): preenchidos quando o runtime baixou a mídia pro bucket
  // privado 'midia-whatsapp'. null/ausente = ainda não baixada ou falhou → a UI mantém o degrade.
  midia_caminho?: string | null; // ex.: '2050562992220931.ogg' (chave no bucket)
  midia_mime?: string | null; // ex.: 'audio/ogg'
}

export interface SugestaoMensagem {
  id: string;
  corpo: string;
  criado_em: string;
  payload: Record<string, unknown>; // payload_proposto completo (p/ aprovar com edição = 'corrigida')
}

export interface DadosConversas {
  conversas: ConversaResumo[];
  fonte: "real" | "mock";
}

// ─────────────── MOCK (fallback) ───────────────

function minsAtras(m: number): string {
  return new Date(Date.now() - m * 60000).toISOString();
}

function segsAtras(s: number): string {
  return new Date(Date.now() - s * 1000).toISOString();
}

const CONVERSAS_MOCK: ConversaResumo[] = [
  { id: "c-mock-1", telefone: "5531988776655", nome: "Terezinha de Jesus", mode: "IA", dono_atual: null, status: "nova", atualizado_em: minsAtras(3), etapa: "qualificando", etapa_nome: "Qualificação", entrou_etapa_em: minsAtras(1440), valor: null, origem: "meta", idade: 63, previa: "Primeiro. Ela tem dificuldade principalmente quando tem barulho", previa_saida: false, nao_lida: true, nao_lidas_qtd: 3 },
  { id: "c-mock-2", telefone: "5521991450087", nome: "João Batista Neves", mode: "HUMANO", dono_atual: "humano:sara", status: "em_atendimento", atualizado_em: minsAtras(25), etapa: "negociacao", etapa_nome: "Negociação", entrou_etapa_em: minsAtras(2880), valor: 11400, origem: "wa", previa: "Oi! Aqui é a Sara, assumi pra te explicar direitinho.", previa_saida: true, nao_lida: false, nao_lidas_qtd: 0 },
  { id: "c-mock-3", telefone: "5531983307712", nome: null, mode: "IA", dono_atual: null, status: "aguardando", atualizado_em: minsAtras(140), etapa: "novo", etapa_nome: "Novo lead", entrou_etapa_em: minsAtras(140), valor: null, origem: "meta", previa: null, previa_saida: false, nao_lida: true, nao_lidas_qtd: 1 },
];

const MENSAGENS_MOCK: Record<string, Mensagem[]> = {
  "c-mock-1": [
    // dia anterior → separador de dia
    { id: "mm0", direcao: "entrada", tipo_conteudo: "text", corpo: "Boa noite", criado_em: minsAtras(60 * 26) },
    { id: "mm1", direcao: "entrada", tipo_conteudo: "text", corpo: "Oi, vi o anúncio de vocês sobre aparelho auditivo", criado_em: minsAtras(30) },
    { id: "mm2", direcao: "saida", tipo_conteudo: "text", corpo: "Olá! Que bom te ver por aqui 💙 Sou a Clara, da Me Escuta. Posso te fazer algumas perguntinhas pra entender como te ajudar?", criado_em: minsAtras(29), autor: "clara", status_entrega: "lido" },
    { id: "mm3", direcao: "entrada", tipo_conteudo: "text", corpo: "Pode sim. É pra minha mãe, ela tem 75 anos", criado_em: minsAtras(20) },
    { id: "mm4", direcao: "saida", tipo_conteudo: "text", corpo: "Perfeito! E ela já usou algum aparelho antes, ou seria o primeiro?", criado_em: minsAtras(19), autor: "clara", status_entrega: "entregue" },
    // rajada da cliente (mesmo autor, <60s) → agrupa numa fala só
    { id: "mm5", direcao: "entrada", tipo_conteudo: "text", corpo: "Primeiro. Ela tem dificuldade principalmente quando tem barulho", criado_em: segsAtras(200) },
    { id: "mm5b", direcao: "entrada", tipo_conteudo: "text", corpo: "na igreja ela não escuta o padre", criado_em: segsAtras(185) },
    { id: "mm5c", direcao: "entrada", tipo_conteudo: "audio", corpo: null, criado_em: segsAtras(170) },
  ],
  "c-mock-2": [
    { id: "mm6", direcao: "entrada", tipo_conteudo: "text", corpo: "Queria saber da garantia", criado_em: minsAtras(40) },
    { id: "mm7", direcao: "saida", tipo_conteudo: "text", corpo: "Oi! Aqui é a Sara, assumi pra te explicar direitinho. A garantia é de 1 ano contra defeitos + 90 dias de adaptação.", criado_em: minsAtras(25), autor: "sara", status_entrega: "enviado" },
    { id: "mm7b", direcao: "saida", tipo_conteudo: "text", corpo: "Consegue falar agora? Posso te ligar.", criado_em: minsAtras(24), autor: "sara", status_entrega: "falhou", erro_codigo: "131047" },
  ],
  "c-mock-3": [
    { id: "mm8", direcao: "entrada", tipo_conteudo: "text", corpo: "Bom dia", criado_em: minsAtras(140) },
  ],
};

const SUGESTOES_MOCK: Record<string, SugestaoMensagem[]> = {
  "c-mock-1": [
    {
      id: "sm1",
      corpo: "Entendo! Ambiente com ruído é um dos maiores desafios mesmo. A boa notícia é que os modelos que trabalhamos têm redução de ruído justamente pra isso. Posso agendar uma avaliação auditiva gratuita por teleconsulta com nossa fono pra ela? 💙",
      criado_em: minsAtras(2),
      payload: { corpo: "Entendo! Ambiente com ruído é um dos maiores desafios mesmo. A boa notícia é que os modelos que trabalhamos têm redução de ruído justamente pra isso. Posso agendar uma avaliação auditiva gratuita por teleconsulta com nossa fono pra ela? 💙" },
    },
  ],
};

// ─────────────── leitura real ───────────────

export async function lerConversas(): Promise<DadosConversas> {
  try {
    const supabase = criarClienteServidor();
    // Contrato 0025 (Trilha A): o inbox lista core.v_conversa WHERE visivel_inbox — conversa só
    // aparece quando satisfaz o filtro (inbound real). Lista vazia é estado HONESTO, não mock;
    // mock só se a query falhar (dev sem banco).
    const { data, error } = await supabase
      .schema("core")
      .from("v_conversa")
      .select("id,telefone,lead_id,mode,dono_atual,status,atualizado_em")
      .eq("visivel_inbox", true)
      .order("atualizado_em", { ascending: false, nullsFirst: false })
      .limit(50);
    if (error) return { conversas: CONVERSAS_MOCK, fonte: "mock" };
    if (!data || data.length === 0) return { conversas: [], fonte: "real" };

    // dados do lead (nome/etapa/valor/origem) pelo lead_id via v_lead_card
    const leadIds = data.map((c: any) => c.lead_id).filter(Boolean);
    const leadInfo = new Map<string, any>();
    if (leadIds.length) {
      const { data: cards } = await supabase
        .schema("core")
        .from("v_lead_card")
        .select("lead_id,nome,etapa,valor,origem,entrou_etapa_em")
        .in("lead_id", leadIds);
      for (const r of cards ?? []) leadInfo.set(String(r.lead_id), r);
    }

    // rótulo de exibição da etapa (chave → nome) via config vigente do funil
    const etapaNome = new Map<string, string>();
    try {
      const { data: cfg } = await supabase
        .schema("core")
        .from("v_config_vigente")
        .select("payload")
        .eq("nome", "funil_vendas")
        .maybeSingle();
      for (const e of ((cfg?.payload as any)?.etapas ?? []) as any[]) {
        if (e?.chave) etapaNome.set(String(e.chave), String(e.nome ?? e.chave));
      }
    } catch {
      /* sem config — usa a própria chave */
    }

    // prévia = última mensagem por conversa + contagem de não-lidas (proxy RF-30/31: mensagens de
    // entrada após a última saída — sem rastreio de leitura no banco ainda, é o proxy honesto)
    const ids = data.map((c: any) => String(c.id));
    const previa = new Map<string, { corpo: string | null; saida: boolean }>();
    const naoLidas = new Map<string, number>();
    try {
      const { data: msgs } = await supabase
        .schema("core")
        .from("mensagem")
        .select("conversa_id,direcao,corpo,criado_em")
        .in("conversa_id", ids)
        .order("criado_em", { ascending: false })
        .limit(800);
      const fechada = new Set<string>(); // conversa já encontrou uma saída — para de contar
      for (const m of msgs ?? []) {
        const k = String(m.conversa_id);
        if (!previa.has(k)) previa.set(k, { corpo: m.corpo ?? null, saida: m.direcao === "saida" });
        if (!fechada.has(k)) {
          if (m.direcao === "saida") fechada.add(k);
          else naoLidas.set(k, (naoLidas.get(k) ?? 0) + 1);
        }
      }
    } catch {
      /* sem prévia — lista degrada pro rótulo de origem */
    }

    const conversas: ConversaResumo[] = data.map((c: any) => {
      const info = c.lead_id ? leadInfo.get(String(c.lead_id)) : null;
      const p = previa.get(String(c.id));
      const etapaChave = info?.etapa ? String(info.etapa) : null;
      return {
        id: String(c.id),
        telefone: c.telefone ?? null,
        nome: info?.nome ?? null,
        mode: (c.mode ?? "IA") as ModoConversa,
        dono_atual: c.dono_atual ?? null,
        status: c.status ?? null,
        atualizado_em: c.atualizado_em ?? null,
        lead_id: c.lead_id ?? null,
        etapa: etapaChave,
        etapa_nome: etapaChave ? etapaNome.get(etapaChave) ?? null : null,
        entrou_etapa_em: info?.entrou_etapa_em ?? null,
        valor: info?.valor != null ? Number(info.valor) : null,
        origem: info?.origem ? String(info.origem) : null,
        idade: null,
        previa: p?.corpo ?? null,
        previa_saida: p?.saida ?? false,
        nao_lida: p ? !p.saida : false,
        nao_lidas_qtd: naoLidas.get(String(c.id)) ?? 0,
      };
    });
    return { conversas, fonte: "real" };
  } catch {
    return { conversas: CONVERSAS_MOCK, fonte: "mock" };
  }
}

/** Colunas da projeção de entrega (Trilha A, migration 0024 — contrato fechado, SPEC RF-5/6). */
const COLUNAS_BASE = "id,direcao,tipo_conteudo,corpo,criado_em";
const COLUNAS_COM_STATUS = `${COLUNAS_BASE},status_entrega,erro_codigo,autor,timestamp_origem`;
/** + colunas da pipeline de mídia (contrato rodada 5, migration em paralelo). */
const COLUNAS_COM_MIDIA = `${COLUNAS_COM_STATUS},midia_caminho,midia_mime`;

export async function lerMensagens(conversaId: string, fonte: "real" | "mock"): Promise<Mensagem[]> {
  if (fonte === "mock") return MENSAGENS_MOCK[conversaId] ?? [];
  try {
    const supabase = criarClienteServidor();
    const buscar = (colunas: string) =>
      supabase
        .schema("core")
        .from("mensagem")
        .select(colunas)
        .eq("conversa_id", conversaId)
        .order("criado_em", { ascending: true })
        .order("id", { ascending: true })
        .limit(500);

    // Cascata de degrade (mesmo padrão da 0024): tenta o contrato completo com mídia; se as
    // colunas de mídia ainda não existirem (migration do backend em paralelo), cai pro contrato
    // de status; se nem essas, pro base. Produção nunca quebra se o front sair antes da migration
    // — o select explícito com coluna inexistente ERRA, então o erro vira degrade, não tela morta.
    let { data, error } = await buscar(COLUNAS_COM_MIDIA);
    if (error) ({ data, error } = await buscar(COLUNAS_COM_STATUS));
    if (error) ({ data, error } = await buscar(COLUNAS_BASE));
    if (error || !data) return [];

    const linhas: Mensagem[] = (data as any[]).map((m: any) => ({
      id: String(m.id),
      direcao: (m.direcao ?? "entrada") as Direcao,
      tipo_conteudo: m.tipo_conteudo ?? "text",
      // RF-6: a hora da mensagem é a do EVENTO DE ORIGEM (timestamp da Meta no inbound), com
      // fallback pra hora de processamento enquanto a coluna não existe — ordenação, agrupamento
      // e separadores de dia derivam todos desta.
      criado_em: m.timestamp_origem ?? m.criado_em,
      corpo: m.corpo ?? null,
      autor: m.autor === "sara" ? "sara" : m.autor === "clara" ? "clara" : undefined,
      status_entrega: (m.status_entrega as EstadoEntrega | null | undefined) ?? undefined,
      erro_codigo: m.erro_codigo ?? undefined,
      midia_caminho: m.midia_caminho ?? undefined,
      midia_mime: m.midia_mime ?? undefined,
    }));
    // reordena por timestamp de origem + id como desempate (webhook atrasado não entra fora de lugar)
    return linhas.sort((a, b) => {
      const ta = new Date(a.criado_em).getTime();
      const tb = new Date(b.criado_em).getTime();
      return ta !== tb ? ta - tb : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  } catch {
    return [];
  }
}

export async function lerSugestoesConversa(
  conversaId: string,
  fonte: "real" | "mock",
): Promise<SugestaoMensagem[]> {
  if (fonte === "mock") return SUGESTOES_MOCK[conversaId] ?? [];
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("sugestao_ia")
      .select("id,payload_proposto,criado_em,tipo,status,conversa_id")
      .eq("conversa_id", conversaId)
      .eq("tipo", "enviar_mensagem")
      .eq("status", "pendente")
      .order("criado_em", { ascending: false })
      .limit(10);
    if (error || !data) return [];
    return data
      .map((s: any) => ({
        id: String(s.id),
        corpo: String(s.payload_proposto?.corpo ?? s.payload_proposto?.texto ?? "").trim(),
        criado_em: s.criado_em,
        payload: (s.payload_proposto ?? {}) as Record<string, unknown>,
      }))
      .filter((s) => s.corpo.length > 0) // ignora propostas de teste sem texto (ruído de webhook)
      .slice(0, 3); // no máximo as 3 mais recentes com texto — evita empilhar
  } catch {
    return [];
  }
}
