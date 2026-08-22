import { criarClienteServidor } from "@/lib/supabase/server";
import {
  HORAS_VALIDADE_PADRAO,
  TIPOS_COM_VALIDADE,
  agruparPorAgente,
  extrairDetalhes,
  extrairTexto,
  motivoBloqueio,
  rotuloAgente,
  rotuloTipo,
} from "@/lib/fila/calculos";
import type { ContagemAgente, Proposta, TrechoConversa } from "@/lib/fila/calculos";

export type { ContagemAgente, Proposta, TrechoConversa };

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
 *
 * O que DECIDE (qual texto, qual impedimento, qual ordem) mora em `lib/fila/calculos.ts`, sem
 * banco e com teste. Aqui só se lê.
 */

/** Teto da página. A fila é para trabalhar, não para paginar 405 cartões. */
const TETO_PAGINA = 50;
/** Teto da agregação por agente — mesmo molde do painel (leitura estreita + detector). */
const TETO_AGREGACAO = 5_000;

/**
 * Quantas mensagens ler por conversa da página, para montar o trecho de 2 falas.
 *
 * Era 12 e passou a 60 em 22/08. O motivo: a leitura é UMA consulta com `in (…ids)` ordenada
 * por data, e o teto é global — não por conversa. Com 12, bastava uma conversa movimentada
 * concentrar as 600 mensagens mais recentes da página para TODAS as outras 49 saírem sem trecho,
 * sem a tela dizer por quê. Continua sendo leitura barata: 50 × 60 = 3.000 linhas de três colunas
 * estreitas. E o que o teto ainda não alcançar agora é DECLARADO (`trechoIncerto`), não calado.
 */
const MENSAGENS_POR_CONVERSA = 60;

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

type Supabase = ReturnType<typeof criarClienteServidor>;

/** Nomes dos agentes. Falhou? cai no slug — a fila não deixa de funcionar por falta de rótulo. */
async function lerRotulosAgente(supabase: Supabase): Promise<Record<string, string>> {
  const { data, error } = await supabase.schema("core").from("agente").select("id,nome").limit(100);
  if (error || !data) return {};
  const mapa: Record<string, string> = {};
  for (const a of data as any[]) if (a?.id) mapa[String(a.id)] = String(a.nome ?? a.id);
  return mapa;
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
  return agruparPorAgente(data as Array<{ agente?: unknown }>, rotulos);
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
  /** true = a leitura de mensagens bateu no teto; conversa sem trecho pode ser corte, não vazio. */
  saturou: boolean;
}> {
  const porConversa = new Map<string, { leadId: string | null; telefone: string | null; nome: string | null }>();
  const trechos = new Map<string, TrechoConversa[]>();
  if (conversaIds.length === 0) return { porConversa, trechos, saturou: false };

  const tetoMensagens = conversaIds.length * MENSAGENS_POR_CONVERSA;
  const [conversas, mensagens] = await Promise.all([
    supabase.schema("core").from("conversa").select("id,lead_id,telefone").in("id", conversaIds),
    supabase
      .schema("core")
      .from("mensagem")
      .select("conversa_id,direcao,corpo,criado_em")
      .in("conversa_id", conversaIds)
      .order("criado_em", { ascending: false })
      .limit(tetoMensagens),
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
  const linhasMensagem = (mensagens.data ?? []) as any[];
  for (const m of linhasMensagem) {
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

  // A leitura encheu o teto OU falhou: nos dois casos, "sem trecho" deixa de significar "conversa
  // vazia" e passa a significar "não sabemos". A tela tem de dizer isso — silêncio, não.
  const saturou = Boolean(mensagens.error) || linhasMensagem.length >= tetoMensagens;

  return { porConversa, trechos, saturou };
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
    const { porConversa, trechos, saturou } = await lerContexto(supabase, conversaIds);

    const agora = Date.now();
    const itens: Proposta[] = linhas.map((s) => {
      const payload = (s.payload_proposto ?? {}) as Record<string, unknown>;
      const tipo = String(s.tipo ?? "");
      const corpo = extrairTexto(tipo, payload);
      const t = rotuloTipo(tipo);
      const cid = s.conversa_id ? String(s.conversa_id) : null;
      const ctx = cid ? porConversa.get(cid) : undefined;
      const agente = String(s.agente ?? "");
      const trecho = (cid ? trechos.get(cid) : undefined) ?? [];
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
        trecho,
        // só é "incerto" quem tem conversa, ficou sem trecho E a leitura saturou. Proposta sem
        // conversa não tem trecho por natureza, e dizer "não carregou" ali seria inventar dúvida.
        trechoIncerto: Boolean(cid) && trecho.length === 0 && saturou,
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
