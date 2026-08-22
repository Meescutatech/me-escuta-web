import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * LEITURA DA FILA DE VALIDAÇÃO (W3 · 22/08/2026).
 *
 * Esta é a única tela onde o princípio "o agente propõe, o humano valida" vira trabalho de
 * verdade — e era a menos desenhada do sistema. O que foi MEDIDO em 22/08, no banco de
 * produção, e que motivou cada decisão daqui:
 *
 *   · 405 propostas esperando. A tela mostrava 50 e não dizia que existiam mais 355.
 *   · 124 das 405 têm o texto proposto VAZIO (`corpo = ''`) — todas da Clara, entre 16 e 19/07.
 *     A tela renderizava o cartão inteiro, com botões, e o corpo em branco. Ninguém aprova o
 *     que não consegue ler; e aprovar um texto vazio manda uma mensagem vazia para o paciente.
 *   · 405 de 405 estão VENCIDAS pela guarda de frescor da porta (nasceram entre 16 e 19/07;
 *     hoje é 22/08). Das 318 de mensagem, TODAS seriam recusadas no clique — a tela oferecia
 *     um botão Aprovar que, em 100% dos casos, estourava um erro não tratado na cara de quem
 *     clicasse. A guarda está certa; quem estava errado era o botão que não a conhecia.
 *   · 404 das 405 têm conversa, e a conversa tem lead — o nome do paciente e o que ele disse
 *     estavam a um join de distância e a tela não mostrava nem um nem outro.
 *
 * Nada aqui esconde proposta: as vazias e as vencidas continuam listadas, porque some da fila
 * quem for validado, não quem for inconveniente. O que muda é que a tela DIZ o que há de errado
 * com cada uma, antes do clique.
 */

/** Teto da página. A fila é para trabalhar, não para paginar 405 cartões. */
const TETO_PAGINA = 50;
/** Teto da agregação por agente — mesmo molde do painel (leitura estreita + detector). */
const TETO_AGREGACAO = 5_000;
/** Vale enquanto ninguém publicar a config de validade. Mesmo número que a porta usa. */
const HORAS_VALIDADE_PADRAO = 48;

/** Tipos cuja aprovação a porta recusa depois da janela de frescor. */
const TIPOS_COM_VALIDADE = new Set(["enviar_mensagem", "enviar_mensagem_humana"]);

export interface TrechoConversa {
  direcao: string;
  corpo: string;
  criadoEm: string;
}

export interface Proposta {
  id: string;
  agente: string;
  agenteRotulo: string;
  tipo: string;
  tipoRotulo: string;
  /** O que o agente quer fazer, em uma frase, sem jargão. */
  tipoExplicacao: string;
  criadoEm: string;
  /** Texto proposto. String vazia = o agente não escreveu nada (124 casos em 22/08). */
  corpo: string;
  /** É uma mensagem que sairia para o paciente? Muda o que a tela pode afirmar sobre o vazio. */
  ehMensagem: boolean;
  /** Campos extras do que foi proposto, já com rótulo legível. Vazio na maioria. */
  detalhes: Array<{ rotulo: string; valor: string }>;
  leadNome: string | null;
  leadId: string | null;
  telefone: string | null;
  /** As últimas mensagens da conversa, da mais antiga para a mais nova. */
  trecho: TrechoConversa[];
  /** null = pode aprovar. Texto = por que não pode, em português de quem usa. */
  bloqueio: string | null;
  /**
   * QUAL impedimento. Existe porque a tela precisa decidir ONDE dizer, não só O QUE dizer:
   * quando o texto está vazio, o próprio lugar do texto já carrega a frase, e repeti-la numa
   * tarja logo abaixo diz a mesma coisa duas vezes no mesmo cartão.
   */
  bloqueioTipo: "sem_texto" | "vencida" | null;
}

export interface ContagemAgente {
  agente: string;
  rotulo: string;
  qtd: number;
}

export interface DadosFila {
  /** Total REAL de propostas esperando, sem filtro. null = não foi possível contar. */
  total: number | null;
  /** Quebra por agente sobre o total real. null = a leitura não coube no teto. */
  porAgente: ContagemAgente[] | null;
  /** Página atual (no máximo TETO_PAGINA itens), já no escopo do filtro. */
  itens: Proposta[];
  /** Quantas propostas existem dentro do filtro (para dizer "mostrando X de Y"). */
  totalNoFiltro: number | null;
  /** Slug do agente filtrado, ou null para "todos". */
  filtro: string | null;
  horasValidade: number;
  /** Mensagem de falha de leitura, já sem nome de tabela. */
  erro: string | null;
}

const ROTULO_TIPO: Record<string, { rotulo: string; explicacao: string }> = {
  enviar_mensagem: {
    rotulo: "Responder no WhatsApp",
    explicacao: "O agente escreveu uma resposta e quer enviá-la ao paciente.",
  },
  enviar_mensagem_humana: {
    rotulo: "Responder no WhatsApp",
    explicacao: "Mensagem preparada para sair em nome da equipe.",
  },
  recomendar_condicoes_credito: {
    rotulo: "Sugerir condições de pagamento",
    explicacao: "Recomendação de crédito para este paciente — nada é oferecido sem você aprovar.",
  },
  atualizar_prompt: {
    rotulo: "Mudar como um agente conversa",
    explicacao: "Altera as instruções de um agente. Só administrador aplica.",
  },
};

function rotuloTipo(tipo: string) {
  return (
    ROTULO_TIPO[tipo] ?? {
      rotulo: tipo.replace(/_/g, " "),
      explicacao: "Proposta de um agente aguardando sua decisão.",
    }
  );
}

/**
 * ONDE MORA O TEXTO DA PROPOSTA, por tipo.
 *
 * Não é sempre `corpo`. Medido em 22/08 nas 405 pendentes: 404 trazem `corpo`, mas a proposta
 * de `atualizar_prompt` do Jarvis não tem a chave `corpo` — ela carrega 38.047 caracteres em
 * `prompt_novo`. Lendo só `corpo`, a tela dizia "o agente não escreveu nada, recuse" sobre a
 * ÚNICA proposta da fila com conteúdo de sobra, e ainda oferecia o botão Aprovar ao lado.
 *
 * Por isso o de-para é declarado por tipo em vez de um encadeamento de `??` solto: quando
 * aparecer um tipo novo, o lugar de dizer onde está o texto dele é aqui, e a ausência salta à
 * vista em vez de virar mais um cartão em branco.
 */
const CHAVES_TEXTO_POR_TIPO: Record<string, string[]> = {
  enviar_mensagem: ["corpo", "texto"],
  enviar_mensagem_humana: ["corpo", "texto"],
  atualizar_prompt: ["corpo", "prompt_novo"],
  recomendar_condicoes_credito: ["corpo", "texto"],
};
const CHAVES_TEXTO_PADRAO = ["corpo", "texto"];

function extrairTexto(tipo: string, payload: Record<string, unknown>): string {
  for (const chave of CHAVES_TEXTO_POR_TIPO[tipo] ?? CHAVES_TEXTO_PADRAO) {
    const v = payload?.[chave];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return "";
}

/** Campos do payload que a tela mostra além do texto — o resto é telemetria do motor. */
const ROTULO_DETALHE: Record<string, string> = {
  justificativa: "Por quê",
  agente_alvo: "Agente afetado",
  proposto_por: "Proposto por",
};

function extrairDetalhes(payload: Record<string, unknown>): Array<{ rotulo: string; valor: string }> {
  const saida: Array<{ rotulo: string; valor: string }> = [];
  for (const [chave, rotulo] of Object.entries(ROTULO_DETALHE)) {
    const bruto = payload?.[chave];
    if (bruto == null || bruto === "") continue;
    const valor = typeof bruto === "string" ? bruto : JSON.stringify(bruto);
    saida.push({ rotulo, valor: valor.length > 400 ? valor.slice(0, 400) + "…" : valor });
  }
  return saida;
}

/**
 * Por que esta proposta não pode ser aprovada — decidido AQUI, na leitura, e não no clique.
 *
 * As duas razões são as mesmas que a porta aplica; a diferença é que a porta responde depois do
 * clique, com o texto de um erro de banco, e a tela responde antes, com o texto de quem trabalha.
 * Se a porta um dia mudar de ideia e aceitar, o pior que acontece é a tela ser conservadora — o
 * contrário (tela permissiva, porta recusando) é o que produzia a tela de erro.
 */
function motivoBloqueio(
  tipo: string,
  corpo: string,
  criadoEm: string,
  horasValidade: number,
  agora: number,
): { bloqueio: string | null; bloqueioTipo: Proposta["bloqueioTipo"] } {
  if (TIPOS_COM_VALIDADE.has(tipo)) {
    if (corpo.trim().length === 0) {
      return {
        bloqueio: "O agente não escreveu nada. Não há mensagem para enviar — recuse para tirar isto da fila.",
        bloqueioTipo: "sem_texto",
      };
    }
    const idadeH = (agora - Date.parse(criadoEm)) / 3_600_000;
    if (Number.isFinite(idadeH) && idadeH > horasValidade) {
      const dias = Math.floor(idadeH / 24);
      const quanto = dias >= 2 ? `${dias} dias` : `${Math.round(idadeH)} horas`;
      return {
        bloqueio: `Escrita há ${quanto}. A conversa já seguiu — enviar isto agora responderia a uma pergunta que o paciente não lembra de ter feito. Recuse e peça uma nova.`,
        bloqueioTipo: "vencida",
      };
    }
  }
  return { bloqueio: null, bloqueioTipo: null };
}

type Supabase = ReturnType<typeof criarClienteServidor>;

/** Nomes dos agentes. Falhou? cai no slug — a fila não deixa de funcionar por falta de rótulo. */
async function lerRotulosAgente(supabase: Supabase): Promise<Record<string, string>> {
  const { data, error } = await supabase.schema("core").from("agente").select("id,nome").limit(100);
  if (error || !data) return {};
  const mapa: Record<string, string> = {};
  for (const a of data as any[]) if (a?.id) mapa[String(a.id)] = String(a.nome ?? a.id);
  return mapa;
}

function rotuloAgente(slug: string, mapa: Record<string, string>): string {
  return mapa[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

/** A janela de frescor é CONFIG, não constante — a tela tem que usar a mesma que a porta usa. */
async function lerHorasValidade(supabase: Supabase): Promise<number> {
  const { data, error } = await supabase
    .schema("core")
    .from("v_config_vigente")
    .select("payload")
    .eq("nome", "hitl.validade_proposta_horas")
    .maybeSingle();
  if (error || !data) return HORAS_VALIDADE_PADRAO;
  const h = Number((data.payload as any)?.horas);
  return Number.isFinite(h) && h > 0 ? h : HORAS_VALIDADE_PADRAO;
}

/** Quebra por agente sobre TODAS as pendentes (não sobre a página) — senão o número mente. */
async function lerPorAgente(
  supabase: Supabase,
  rotulos: Record<string, string>,
): Promise<ContagemAgente[] | null> {
  const { data, error } = await supabase
    .schema("core")
    .from("sugestao_ia")
    .select("agente")
    .eq("status", "pendente")
    .limit(TETO_AGREGACAO + 1);
  if (error || !data || data.length > TETO_AGREGACAO) return null;
  const conta = new Map<string, number>();
  for (const s of data as any[]) {
    const a = String(s?.agente ?? "").trim() || "(sem agente)";
    conta.set(a, (conta.get(a) ?? 0) + 1);
  }
  return [...conta.entries()]
    .map(([agente, qtd]) => ({ agente, rotulo: rotuloAgente(agente, rotulos), qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/**
 * Lead + trecho da conversa das propostas da página.
 *
 * Três leituras estreitas em vez de um embed: os ids da página são poucos (medido em 22/08: as
 * 405 pendentes vivem em 55 conversas), e leitura separada degrada em pedaços — sem lead a
 * proposta ainda aparece com o texto, que é o que decide a aprovação.
 */
async function lerContexto(
  supabase: Supabase,
  conversaIds: string[],
): Promise<{
  porConversa: Map<string, { leadId: string | null; telefone: string | null; nome: string | null }>;
  trechos: Map<string, TrechoConversa[]>;
}> {
  const porConversa = new Map<string, { leadId: string | null; telefone: string | null; nome: string | null }>();
  const trechos = new Map<string, TrechoConversa[]>();
  if (conversaIds.length === 0) return { porConversa, trechos };

  const [conversas, mensagens] = await Promise.all([
    supabase.schema("core").from("conversa").select("id,lead_id,telefone").in("id", conversaIds),
    supabase
      .schema("core")
      .from("mensagem")
      .select("conversa_id,direcao,corpo,criado_em")
      .in("conversa_id", conversaIds)
      .order("criado_em", { ascending: false })
      .limit(conversaIds.length * 12),
  ]);

  const leadIds = new Set<string>();
  for (const c of (conversas.data ?? []) as any[]) {
    const leadId = c?.lead_id ? String(c.lead_id) : null;
    if (leadId) leadIds.add(leadId);
    porConversa.set(String(c.id), { leadId, telefone: c?.telefone ? String(c.telefone) : null, nome: null });
  }

  if (leadIds.size > 0) {
    const { data: leads } = await supabase
      .schema("core")
      .from("lead")
      .select("lead_id,nome")
      .in("lead_id", [...leadIds]);
    const nomes = new Map<string, string | null>();
    for (const l of (leads ?? []) as any[]) nomes.set(String(l.lead_id), l?.nome ? String(l.nome) : null);
    for (const v of porConversa.values()) if (v.leadId) v.nome = nomes.get(v.leadId) ?? null;
  }

  // as 2 últimas de cada conversa, remontadas na ordem de leitura (antiga → nova)
  for (const m of (mensagens.data ?? []) as any[]) {
    const cid = String(m.conversa_id);
    const lista = trechos.get(cid) ?? [];
    if (lista.length >= 2) continue;
    lista.push({
      direcao: String(m.direcao ?? ""),
      corpo: String(m.corpo ?? "").trim(),
      criadoEm: String(m.criado_em),
    });
    trechos.set(cid, lista);
  }
  for (const [cid, lista] of trechos) trechos.set(cid, lista.reverse());

  return { porConversa, trechos };
}

export async function lerFila(filtroAgente: string | null): Promise<DadosFila> {
  const vazio: DadosFila = {
    total: null,
    porAgente: null,
    itens: [],
    totalNoFiltro: null,
    filtro: filtroAgente,
    horasValidade: HORAS_VALIDADE_PADRAO,
    erro: null,
  };
  try {
    const supabase = criarClienteServidor();
    const rotulos = await lerRotulosAgente(supabase);

    const consultaPagina = supabase
      .schema("core")
      .from("sugestao_ia")
      .select("id,agente,tipo,conversa_id,payload_proposto,criado_em", { count: "exact" })
      .eq("status", "pendente")
      .order("criado_em", { ascending: false })
      .limit(TETO_PAGINA);
    if (filtroAgente) consultaPagina.eq("agente", filtroAgente);

    const [pagina, totalGeral, porAgente, horasValidade] = await Promise.all([
      consultaPagina,
      supabase
        .schema("core")
        .from("sugestao_ia")
        .select("*", { count: "exact", head: true })
        .eq("status", "pendente"),
      lerPorAgente(supabase, rotulos),
      lerHorasValidade(supabase),
    ]);

    if (pagina.error) {
      return { ...vazio, porAgente, total: totalGeral.error ? null : totalGeral.count ?? 0, erro: "Não foi possível ler a fila agora. Recarregue a página." };
    }

    const linhas = (pagina.data ?? []) as any[];
    const conversaIds = [...new Set(linhas.map((s) => s.conversa_id).filter(Boolean).map(String))];
    const { porConversa, trechos } = await lerContexto(supabase, conversaIds);

    const agora = Date.now();
    const itens: Proposta[] = linhas.map((s) => {
      const payload = (s.payload_proposto ?? {}) as Record<string, unknown>;
      const tipo = String(s.tipo ?? "");
      const corpo = extrairTexto(tipo, payload);
      const t = rotuloTipo(tipo);
      const cid = s.conversa_id ? String(s.conversa_id) : null;
      const ctx = cid ? porConversa.get(cid) : undefined;
      const agente = String(s.agente ?? "");
      return {
        id: String(s.id),
        agente,
        agenteRotulo: rotuloAgente(agente, rotulos),
        tipo,
        tipoRotulo: t.rotulo,
        tipoExplicacao: t.explicacao,
        criadoEm: String(s.criado_em),
        corpo,
        ehMensagem: TIPOS_COM_VALIDADE.has(tipo),
        detalhes: extrairDetalhes(payload),
        leadNome: ctx?.nome ?? null,
        leadId: ctx?.leadId ?? null,
        telefone: ctx?.telefone ?? null,
        trecho: (cid ? trechos.get(cid) : undefined) ?? [],
        ...motivoBloqueio(tipo, corpo, String(s.criado_em), horasValidade, agora),
      };
    });

    return {
      total: totalGeral.error ? null : totalGeral.count ?? 0,
      porAgente,
      itens,
      totalNoFiltro: pagina.count ?? null,
      filtro: filtroAgente,
      horasValidade,
      erro: null,
    };
  } catch {
    return { ...vazio, erro: "Não foi possível ler a fila agora. Recarregue a página." };
  }
}
