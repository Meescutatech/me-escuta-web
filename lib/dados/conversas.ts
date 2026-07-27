import { criarClienteServidor } from "@/lib/supabase/server";
import { caminhosParaAssinar } from "@/lib/conversas/midia";
import { parseTags } from "./ficha-calculos";

/**
 * Leitura de CONVERSAS (inbox WhatsApp) + mensagens + propostas da Clara. Schema real (0009):
 *  - core.conversa: id, telefone, lead_id, mode(IA|HUMANO), dono_atual, status, atualizado_em
 *  - core.mensagem: id, conversa_id, direcao(entrada|saida), tipo_conteudo, corpo, criado_em
 *  - core.sugestao_ia: propostas tipo='enviar_mensagem' pendentes (o laço da Clara)
 * Só dado real (Rodada 7, D3): inbox sem conversa = estado vazio honesto; falha de leitura
 * também degrada pra lista vazia, nunca pra dado inventado.
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
  /**
   * F21 — quando a conversa recebeu a última mensagem de ENTRADA (core.conversa.ultima_entrada_em,
   * mantido pelo projetor com `greatest()`). É por este campo que a lista ORDENA. NULL para
   * conversa nascida de disparo (só saída) — daí o `nulls last` na consulta.
   */
  ultima_entrada_em?: string | null;
  /**
   * F21 — hora da última mensagem de QUALQUER direção, carimbada pela prévia (custo zero: o dado
   * já vinha). É por este campo que a lista EXIBE a data. Ausente quando a prévia não pôde ser
   * lida; a exibição então degrada por `dataDaLista`, nunca de volta pra `atualizado_em`.
   */
  ultima_msg_em?: string | null;
  // enriquecimento p/ a lista (prévia) + painel de contexto do redesign (conversa-v2).
  lead_id?: string | null;
  etapa?: string | null; // chave
  etapa_nome?: string | null; // rótulo de exibição
  entrou_etapa_em?: string | null;
  valor?: number | null;
  origem?: string | null;
  tags?: string[]; // core.lead.tags via v_lead_card (chips no painel do lead)
  kommo_lead_id?: string | null; // #id de referência no painel (r9)
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
  // Signed URL pré-assinada em LOTE no servidor (perf/rotas) — quando presente, a bolha usa
  // direto; ausente (falha de assinatura/linha antiga), a bolha cai no fetch lazy de antes.
  midia_url?: string | null;
}

export interface SugestaoMensagem {
  id: string;
  corpo: string;
  criado_em: string;
  payload: Record<string, unknown>; // payload_proposto completo (p/ aprovar com edição = 'corrigida')
}

// ─────────────── leitura real ───────────────

/**
 * Cliente de leitura. O parâmetro opcional `cliente` das funções abaixo existe por exigência de
 * spec, não por conveniência de teste: os portões do F24a e do F25 precisam injetar um cliente
 * FALSO QUE CONTA CHAMADAS para medir requisições, e os portões que falam com o banco de verdade
 * precisam injetar um cliente AUTENTICADO (a sessão do app vem de cookie, que não existe fora de
 * uma requisição). Sem o parâmetro, o portão teria de reimplementar a consulta — e um portão que
 * testa uma cópia da lógica não testa o produto.
 * Omitido, o comportamento é exatamente o de antes: a sessão do usuário, com o RLS dele.
 */
type Supabase = ReturnType<typeof criarClienteServidor>;

/** Colunas da prévia. `timestamp_origem` é a hora REAL da mensagem no WhatsApp (RF-6). */
const PREVIA_COM_ORIGEM = "conversa_id,direcao,corpo,criado_em,timestamp_origem";
const PREVIA_BASE = "conversa_id,direcao,corpo,criado_em";

/**
 * Últimas mensagens das conversas da página, em ordem cronológica REAL decrescente. Dela saem
 * três coisas: a prévia (corpo da última), o carimbo do F21 (`ultima_msg_em`) e a contagem de
 * não-lidas — esta última só faz sentido em ordem decrescente, porque conta as entradas até
 * esbarrar na última saída.
 *
 * Ordena por `timestamp_origem`, não por `criado_em`, pelo mesmo motivo que existe o F21: um é a
 * hora em que a mensagem existiu, o outro é a hora em que nós a processamos, e webhook atrasado
 * não pode fingir que a mensagem é nova. Mesma cascata de degrade da `lerMensagens`: se a coluna
 * ainda não existir no ambiente, cai pro select base — produção não quebra se o front sair antes
 * da migration.
 */
async function lerPrevias(supabase: Supabase, ids: string[]): Promise<any[]> {
  const buscar = (colunas: string, porOrigem: boolean) => {
    const base = supabase.schema("core").from("mensagem").select(colunas).in("conversa_id", ids);
    const ordenada = porOrigem
      ? base.order("timestamp_origem", { ascending: false, nullsFirst: false })
      : base;
    return ordenada.order("criado_em", { ascending: false }).limit(800);
  };
  let { data, error } = await buscar(PREVIA_COM_ORIGEM, true);
  if (error) ({ data, error } = await buscar(PREVIA_BASE, false));
  return error || !data ? [] : (data as any[]);
}

export async function lerConversas(cliente?: Supabase): Promise<ConversaResumo[]> {
  try {
    const supabase = cliente ?? criarClienteServidor();
    // rótulo de exibição da etapa (chave → nome) via config vigente do funil — não depende da
    // lista, então dispara junto com a query principal (era a 3ª de 4 queries em série)
    const configPromise = supabase
      .schema("core")
      .from("v_config_vigente")
      .select("payload")
      .eq("nome", "funil_vendas")
      .maybeSingle();

    // Contrato 0025 (Trilha A): o inbox lista core.v_conversa WHERE visivel_inbox — conversa só
    // aparece quando satisfaz o filtro (inbound real). Lista vazia é estado HONESTO.
    // F21: ordena por `ultima_entrada_em` — "quem falou com a gente por último", que é o critério
    // de uma FILA DE ATENDIMENTO. `atualizado_em` segue no select porque é o que o tempo real usa
    // pra detectar mudança (NÃO apagar), mas deixou de mandar na ordem: ele é a hora em que a
    // LINHA foi tocada, e o import do Kommo tocou todas de uma vez.
    // O desempate por `id` é obrigatório e não decorativo: sem ele a ordem entre carimbos iguais é
    // indefinida, e é sobre este PAR (ultima_entrada_em, id) que o keyset do F22 se apoia.
    const { data, error } = await supabase
      .schema("core")
      .from("v_conversa")
      .select("id,telefone,lead_id,mode,dono_atual,status,atualizado_em,ultima_entrada_em")
      .eq("visivel_inbox", true)
      .order("ultima_entrada_em", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(50);
    if (error || !data || data.length === 0) return [];

    const leadIds = data.map((c: any) => c.lead_id).filter(Boolean);
    const ids = data.map((c: any) => String(c.id));

    // leads (nome/etapa/valor) + prévia/não-lidas + config, tudo em paralelo: só a lista de
    // conversas precisa vir antes (ids) — profundidade 2 de round-trips em vez de 4
    const [cardsRes, msgsRes, cfgRes] = await Promise.all([
      leadIds.length
        ? supabase
            .schema("core")
            .from("v_lead_card")
            .select("lead_id,nome,etapa,valor,origem,entrou_etapa_em,tags,kommo_lead_id")
            .in("lead_id", leadIds)
        : Promise.resolve({ data: null } as { data: any[] | null }),
      lerPrevias(supabase, ids),
      configPromise,
    ]);

    // dados do lead (nome/etapa/valor/origem) pelo lead_id via v_lead_card
    const leadInfo = new Map<string, any>();
    for (const r of cardsRes.data ?? []) leadInfo.set(String(r.lead_id), r);

    const etapaNome = new Map<string, string>();
    for (const e of (((cfgRes as any)?.data?.payload as any)?.etapas ?? []) as any[]) {
      if (e?.chave) etapaNome.set(String(e.chave), String(e.nome ?? e.chave));
    }

    // prévia = última mensagem por conversa + contagem de não-lidas (proxy RF-30/31: mensagens de
    // entrada após a última saída — sem rastreio de leitura no banco ainda, é o proxy honesto);
    // erro de leitura degrada pra lista sem prévia, como antes
    const previa = new Map<string, { corpo: string | null; saida: boolean; em: string | null }>();
    const naoLidas = new Map<string, number>();
    const fechada = new Set<string>(); // conversa já encontrou uma saída — para de contar
    for (const m of msgsRes) {
      const k = String(m.conversa_id);
      // primeira linha da conversa nesta ordem = a mais recente de verdade (F21: qualquer direção)
      if (!previa.has(k))
        previa.set(k, {
          corpo: m.corpo ?? null,
          saida: m.direcao === "saida",
          em: m.timestamp_origem ?? m.criado_em ?? null,
        });
      if (!fechada.has(k)) {
        if (m.direcao === "saida") fechada.add(k);
        else naoLidas.set(k, (naoLidas.get(k) ?? 0) + 1);
      }
    }

    return data.map((c: any) => {
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
        ultima_entrada_em: c.ultima_entrada_em ?? null,
        ultima_msg_em: p?.em ?? null,
        lead_id: c.lead_id ?? null,
        etapa: etapaChave,
        etapa_nome: etapaChave ? etapaNome.get(etapaChave) ?? null : null,
        entrou_etapa_em: info?.entrou_etapa_em ?? null,
        valor: info?.valor != null ? Number(info.valor) : null,
        origem: info?.origem ? String(info.origem) : null,
        tags: parseTags(info?.tags),
        kommo_lead_id: info?.kommo_lead_id ?? null,
        idade: null,
        previa: p?.corpo ?? null,
        previa_saida: p?.saida ?? false,
        nao_lida: p ? !p.saida : false,
        nao_lidas_qtd: naoLidas.get(String(c.id)) ?? 0,
      };
    });
  } catch {
    return [];
  }
}

/** Colunas da projeção de entrega (Trilha A, migration 0024 — contrato fechado, SPEC RF-5/6). */
const COLUNAS_BASE = "id,direcao,tipo_conteudo,corpo,criado_em";
const COLUNAS_COM_STATUS = `${COLUNAS_BASE},status_entrega,erro_codigo,autor,timestamp_origem`;
/** + colunas da pipeline de mídia (contrato rodada 5, migration em paralelo). */
const COLUNAS_COM_MIDIA = `${COLUNAS_COM_STATUS},midia_caminho,midia_mime`;

export async function lerMensagens(conversaId: string, cliente?: Supabase): Promise<Mensagem[]> {
  try {
    const supabase = cliente ?? criarClienteServidor();
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
    linhas.sort((a, b) => {
      const ta = new Date(a.criado_em).getTime();
      const tb = new Date(b.criado_em).getTime();
      return ta !== tb ? ta - tb : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    // assina em LOTE as mídias que a thread vai renderizar: 1 round-trip pro Storage no lugar
    // de 1 server action POR BOLHA depois da hidratação (o React enfileira actions em série).
    // Falha de assinatura → bolha cai no fetch lazy de antes (degrade idêntico).
    const caminhos = caminhosParaAssinar(linhas);
    if (caminhos.length) {
      try {
        const { data: assinadas } = await supabase.storage
          .from("midia-whatsapp")
          .createSignedUrls(caminhos, 3600);
        const urlPorCaminho = new Map<string, string>();
        for (const a of assinadas ?? []) {
          if (!a.error && a.path && a.signedUrl) urlPorCaminho.set(a.path, a.signedUrl);
        }
        for (const m of linhas) {
          const url = m.midia_caminho ? urlPorCaminho.get(m.midia_caminho.trim()) : undefined;
          if (url) m.midia_url = url;
        }
      } catch {
        /* sem URLs pré-assinadas — bolhas seguem no caminho lazy */
      }
    }
    return linhas;
  } catch {
    return [];
  }
}

export async function lerSugestoesConversa(conversaId: string): Promise<SugestaoMensagem[]> {
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
