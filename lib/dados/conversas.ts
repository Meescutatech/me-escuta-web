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

export interface ConversaResumo {
  id: string;
  telefone: string | null;
  nome: string | null;
  mode: ModoConversa;
  dono_atual: string | null;
  status: string | null;
  atualizado_em: string | null;
}

export interface Mensagem {
  id: string;
  direcao: Direcao;
  tipo_conteudo: string;
  corpo: string | null;
  criado_em: string;
  pendente?: boolean; // bolha local ainda não enviada de fato (envio humano aguardando fila_saida)
}

export interface SugestaoMensagem {
  id: string;
  corpo: string;
  criado_em: string;
}

export interface DadosConversas {
  conversas: ConversaResumo[];
  fonte: "real" | "mock";
}

// ─────────────── MOCK (fallback) ───────────────

function minsAtras(m: number): string {
  return new Date(Date.now() - m * 60000).toISOString();
}

const CONVERSAS_MOCK: ConversaResumo[] = [
  { id: "c-mock-1", telefone: "5531988776655", nome: "Terezinha de Jesus", mode: "IA", dono_atual: null, status: "nova", atualizado_em: minsAtras(3) },
  { id: "c-mock-2", telefone: "5521991450087", nome: "João Batista Neves", mode: "HUMANO", dono_atual: "humano:sara", status: "em_atendimento", atualizado_em: minsAtras(25) },
  { id: "c-mock-3", telefone: "5531983307712", nome: null, mode: "IA", dono_atual: null, status: "aguardando", atualizado_em: minsAtras(140) },
];

const MENSAGENS_MOCK: Record<string, Mensagem[]> = {
  "c-mock-1": [
    { id: "mm1", direcao: "entrada", tipo_conteudo: "text", corpo: "Oi, vi o anúncio de vocês sobre aparelho auditivo", criado_em: minsAtras(30) },
    { id: "mm2", direcao: "saida", tipo_conteudo: "text", corpo: "Olá! Que bom te ver por aqui 💙 Sou a Clara, da Me Escuta. Posso te fazer algumas perguntinhas pra entender como te ajudar?", criado_em: minsAtras(29) },
    { id: "mm3", direcao: "entrada", tipo_conteudo: "text", corpo: "Pode sim. É pra minha mãe, ela tem 75 anos", criado_em: minsAtras(20) },
    { id: "mm4", direcao: "saida", tipo_conteudo: "text", corpo: "Perfeito! E ela já usou algum aparelho antes, ou seria o primeiro?", criado_em: minsAtras(19) },
    { id: "mm5", direcao: "entrada", tipo_conteudo: "text", corpo: "Primeiro. Ela tem dificuldade principalmente quando tem barulho", criado_em: minsAtras(3) },
  ],
  "c-mock-2": [
    { id: "mm6", direcao: "entrada", tipo_conteudo: "text", corpo: "Queria saber da garantia", criado_em: minsAtras(40) },
    { id: "mm7", direcao: "saida", tipo_conteudo: "text", corpo: "Oi! Aqui é a Sara, assumi pra te explicar direitinho. A garantia é de 1 ano contra defeitos + 90 dias de adaptação.", criado_em: minsAtras(25) },
  ],
  "c-mock-3": [
    { id: "mm8", direcao: "entrada", tipo_conteudo: "text", corpo: "Bom dia", criado_em: minsAtras(140) },
  ],
};

const SUGESTOES_MOCK: Record<string, SugestaoMensagem[]> = {
  "c-mock-1": [
    { id: "sm1", corpo: "Entendo! Ambiente com ruído é um dos maiores desafios mesmo. A boa notícia é que os modelos que trabalhamos têm redução de ruído justamente pra isso. Posso agendar uma avaliação auditiva gratuita por teleconsulta com nossa fono pra ela? 💙", criado_em: minsAtras(2) },
  ],
};

// ─────────────── leitura real ───────────────

export async function lerConversas(): Promise<DadosConversas> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("conversa")
      .select("id,telefone,lead_id,mode,dono_atual,status,atualizado_em")
      .order("atualizado_em", { ascending: false, nullsFirst: false })
      .limit(50);
    if (error || !data || data.length === 0) return { conversas: CONVERSAS_MOCK, fonte: "mock" };

    // resolve nome pelo lead_id (quando houver) via v_lead_card
    const leadIds = data.map((c: any) => c.lead_id).filter(Boolean);
    const nomes = new Map<string, string>();
    if (leadIds.length) {
      const { data: cards } = await supabase
        .schema("core")
        .from("v_lead_card")
        .select("lead_id,nome")
        .in("lead_id", leadIds);
      for (const r of cards ?? []) if (r.nome) nomes.set(String(r.lead_id), String(r.nome));
    }

    const conversas: ConversaResumo[] = data.map((c: any) => ({
      id: String(c.id),
      telefone: c.telefone ?? null,
      nome: c.lead_id ? nomes.get(String(c.lead_id)) ?? null : null,
      mode: (c.mode ?? "IA") as ModoConversa,
      dono_atual: c.dono_atual ?? null,
      status: c.status ?? null,
      atualizado_em: c.atualizado_em ?? null,
    }));
    return { conversas, fonte: "real" };
  } catch {
    return { conversas: CONVERSAS_MOCK, fonte: "mock" };
  }
}

export async function lerMensagens(conversaId: string, fonte: "real" | "mock"): Promise<Mensagem[]> {
  if (fonte === "mock") return MENSAGENS_MOCK[conversaId] ?? [];
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("mensagem")
      .select("id,direcao,tipo_conteudo,corpo,criado_em")
      .eq("conversa_id", conversaId)
      .order("criado_em", { ascending: true })
      .limit(500);
    if (error || !data) return [];
    return data.map((m: any) => ({
      id: String(m.id),
      direcao: (m.direcao ?? "entrada") as Direcao,
      tipo_conteudo: m.tipo_conteudo ?? "text",
      corpo: m.corpo ?? null,
      criado_em: m.criado_em,
    }));
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
    return data.map((s: any) => ({
      id: String(s.id),
      corpo: String(s.payload_proposto?.corpo ?? s.payload_proposto?.texto ?? ""),
      criado_em: s.criado_em,
    }));
  } catch {
    return [];
  }
}
