import { criarClienteServidor } from "@/lib/supabase/server";
import { caminhosParaAssinar } from "@/lib/conversas/midia";
import {
  TTL_ASSINATURA_SEG,
  criarArmazem,
  expirar,
  guardar,
  obter as obterDoCache,
  precisaAssinar,
} from "@/lib/conversas/cache-midia";
import {
  LIMITE_PAGINA,
  decodificar,
  filtroKeyset,
  houveCorte,
  proximoCursor,
} from "@/lib/conversas/paginacao";
import { parseTags } from "./ficha-calculos";
import { clausulaEscopo, type Escopo } from "@/lib/departamentos/escopo";

/**
 * M6 · O PREDICADO DE ESCOPO vem de `lib/departamentos/escopo.ts` — puro, sem rede, testável por
 * `node --test` sem resolver o alias `@/`. É a linha que o C9 mede, e um predicado que só pode ser
 * exercitado subindo o Next inteiro é um predicado que ninguém exercita.
 */
export { clausulaEscopo } from "@/lib/departamentos/escopo";


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
  /**
   * M6 — o carimbo de roteamento congelado (`core.conversa.area`, imutável). Vem para a lista por
   * UM motivo só: separar a faixa "Sem departamento" (D6-g) do resto. NÃO vira rótulo na linha da
   * conversa nesta rodada — ARB-R18-03: o chip que entra na linha é o NÚMERO (M7); o departamento
   * seria a segunda marca competindo por atenção, e constante em 85% dos casos (73 de 86).
   */
  area?: string | null;
}

/**
 * Uma página do inbox — mesma forma que `DadosFunil`, que é o padrão da casa para "mostrei uma
 * parte e estou dizendo isso".
 */
export interface PaginaConversas {
  conversas: ConversaResumo[];
  /**
   * Total do FILTRO no servidor (`visivel_inbox`), não o tamanho do array. `null` quando a
   * contagem falha — e aí a UI mostra "50+" ou omite, nunca "50" fingindo ser o total.
   */
  total: number | null;
  /** Existe conversa além das carregadas. A tela DECLARA, no molde do aviso do funil. */
  corte: boolean;
  /** Cursor da próxima página; `null` quando acabou de verdade. */
  proximoCursor: string | null;
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
async function lerPrevias(
  supabase: Supabase,
  ids: string[],
  colunasComOrigem = PREVIA_COM_ORIGEM,
): Promise<any[]> {
  // o degrade tira `timestamp_origem` do select E da ordenação — pedir ordem por coluna que não
  // existe erraria do mesmo jeito que pedi-la no select
  const semOrigem = colunasComOrigem
    .split(",")
    .filter((c) => c !== "timestamp_origem")
    .join(",");
  const buscar = (colunas: string, porOrigem: boolean) => {
    const base = supabase.schema("core").from("mensagem").select(colunas).in("conversa_id", ids);
    const ordenada = porOrigem
      ? base.order("timestamp_origem", { ascending: false, nullsFirst: false })
      : base;
    return ordenada.order("criado_em", { ascending: false }).limit(800);
  };
  let { data, error } = await buscar(colunasComOrigem, true);
  if (error) ({ data, error } = await buscar(semOrigem, false));
  return error || !data ? [] : (data as any[]);
}

/**
 * F22 — total de conversas do filtro do inbox, `head`-count: o Postgres conta e devolve só o
 * número, nenhuma linha trafega. É a requisição mais barata que existe, e é ela que tira a
 * mentira de "Todas · 50" quando são 94.
 *
 * Erro → `null`, e `null` faz a UI mostrar "50+" ou omitir. Nunca um total inventado.
 */
export async function contarConversasVisiveis(
  cliente?: Supabase,
  escopo?: Escopo | null,
): Promise<number | null> {
  try {
    const supabase = cliente ?? criarClienteServidor();
    const base = supabase
      .schema("core")
      .from("v_conversa")
      .select("*", { count: "exact", head: true })
      .eq("visivel_inbox", true);
    const clausula = clausulaEscopo(escopo);
    const { count, error } = await (clausula ? base.or(clausula) : base);
    return error ? null : count ?? 0;
  } catch {
    return null;
  }
}

/**
 * M6 · Pendência POR DEPARTAMENTO — o insumo do ponto no departamento INATIVO (D6-f).
 *
 * Por que existe: sem a opção "Todos" (morta pelo D6-f), quem opera em duas áreas fica CEGO na área
 * que não está olhando. O ponto é o que impede "só um por vez" de virar armadilha — é o padrão do
 * Slack (BENCHMARK §3-bis.2): marca de pendência no contexto que NÃO está ativo.
 *
 * TEM/NÃO TEM, nunca número: número no header cai na ARB-R17-33 e no 755 do Kommo
 * (`components/sidebar.tsx:119-120`). O `Map` devolve contagem porque quem chama decide o corte, e o
 * header usa só `> 0`.
 *
 * "Pendência" aqui é EXATAMENTE o proxy do inbox — "a última mensagem é de entrada". Não invento um
 * segundo conceito de pendência: dois conceitos com o mesmo nome divergem, e é a doença que este
 * schema já tem em `dono`/`dono_id` (E-053).
 *
 * O CUSTO, declarado em vez de escondido: é uma leitura A MAIS no layout. O `PLANO-TECNICO-M6.md`
 * §5.3 previu "zero consulta a mais" reaproveitando a consulta de `contarNaoLidas`, e isso está
 * ERRADO — `contarNaoLidas` passou a ser ESCOPADA (ela alimenta o contador que aponta para a tela
 * escopada), e derivar o mapa por-área a partir dela devolveria só as áreas dentro do escopo ativo,
 * que é justamente o contrário do que o ponto precisa saber. Derivar o contador escopado deste mapa
 * também não serve: as duas leituras têm o mesmo teto de `LIMITE_PAGINA`, e somar as áreas do escopo
 * dentro das 50 mais recentes GLOBAIS daria um número diferente do badge da lista escopada — e o
 * código exige por escrito que os dois batam.
 */
export async function contarNaoLidasPorArea(
  cliente?: Supabase,
): Promise<Map<string | null, number> | null> {
  try {
    const supabase = cliente ?? criarClienteServidor();
    const { data: convs, error } = await supabase
      .schema("core")
      .from("v_conversa")
      .select("id,area")
      .eq("visivel_inbox", true)
      .order("ultima_entrada_em", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(LIMITE_PAGINA);
    if (error || !convs) return null;
    const porConversa = new Map<string, string | null>();
    for (const c of convs as any[]) porConversa.set(String(c.id), c.area ? String(c.area) : null);
    if (porConversa.size === 0) return new Map();

    const previas = await lerPrevias(
      supabase,
      [...porConversa.keys()],
      "conversa_id,direcao,timestamp_origem,criado_em",
    );
    const ultimaDirecao = new Map<string, string>();
    for (const m of previas) {
      const k = String(m.conversa_id);
      if (!ultimaDirecao.has(k)) ultimaDirecao.set(k, String(m.direcao));
    }
    const mapa = new Map<string | null, number>();
    for (const [id, area] of porConversa) {
      if (ultimaDirecao.get(id) !== "entrada") continue;
      mapa.set(area, (mapa.get(area) ?? 0) + 1);
    }
    return mapa;
  } catch {
    return null;
  }
}

/**
 * F25 — o contador de não-lidas da barra lateral, por uma consulta ESTREITA.
 *
 * O que ele custava: `lerConversas().filter(c => c.nao_lida).length` — a leitura INTEIRA do inbox
 * (50 conversas + join de leads em v_lead_card + 800 mensagens de prévia + config do funil) para
 * produzir UM número. E a barra lateral vive no layout: /funil, /tarefas e /configuracoes pagavam
 * isso também, a cada `router.refresh()`.
 *
 * O que ele custa agora: os ids das conversas visíveis + a direção da última mensagem de cada uma.
 * Sem join de lead, sem `corpo`, sem config. Mesmas 2 requisições, payload de outra ordem.
 *
 * O PROXY NÃO MUDA — e isso é requisito, não detalhe. "Não-lida" continua sendo "a última mensagem
 * é de entrada", exatamente como a lista calcula, porque um número diferente do badge da lista
 * seria pior que o custo da consulta. É a mesma regra, lida mais barato; se divergir, o item falhou.
 *
 * Indisponível é `null` (a barra lateral esconde o contador), nunca zero inventado.
 */
export async function contarNaoLidas(
  cliente?: Supabase,
  escopo?: Escopo | null,
): Promise<number | null> {
  try {
    const supabase = cliente ?? criarClienteServidor();
    const clausula = clausulaEscopo(escopo);
    const comEscopo = supabase
      .schema("core")
      .from("v_conversa")
      .select("id")
      .eq("visivel_inbox", true);
    const { data: convs, error } = await (clausula ? comEscopo.or(clausula) : comEscopo)
      .order("ultima_entrada_em", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(LIMITE_PAGINA);
    if (error || !convs) return null;
    if (convs.length === 0) return 0;

    const ids = convs.map((c: any) => String(c.id));
    // só `conversa_id` e `direcao`: o que decide o proxy. `corpo` é o que pesa, e não é preciso
    // para contar. A ordem é a mesma da prévia (hora real da mensagem), senão "a última" seria outra.
    const previas = await lerPrevias(supabase, ids, "conversa_id,direcao,timestamp_origem,criado_em");
    const ultimaDirecao = new Map<string, string>();
    for (const m of previas) {
      const k = String(m.conversa_id);
      if (!ultimaDirecao.has(k)) ultimaDirecao.set(k, String(m.direcao));
    }
    return ids.filter((id) => ultimaDirecao.get(id) === "entrada").length;
  } catch {
    return null;
  }
}

/*
 * O `head`-count de verdade — 1 requisição, ZERO payload — depende de uma coluna que ainda não
 * existe. Fica escrito para o dia em que existir, e não é comentário de intenção: é o pedido que
 * está na mesa da Trilha C.
 *
 *   core.conversa.ultima_saida_em, mantida pelo projetor de saída com greatest(), espelhando
 *   ultima_entrada_em. Com ela:
 *
 *     supabase.schema("core").from("v_conversa")
 *       .select("*", { count: "exact", head: true })
 *       .eq("visivel_inbox", true)
 *       .gt("ultima_entrada_em", "coalesce(ultima_saida_em, '-infinity')")
 *
 * Hoje o predicado NÃO é expressável: core.conversa tem ultima_entrada_em e não tem a de saída,
 * então "a última mensagem é de entrada" não cabe em SQL sem a coluna. Por isso a consulta acima
 * estreita em vez de colapsar — e por isso ela ainda lê duas vezes.
 */

const PAGINA_VAZIA: PaginaConversas = {
  conversas: [],
  total: null,
  corte: false,
  proximoCursor: null,
};

export async function lerConversas(
  opcoes: {
    cliente?: Supabase;
    cursor?: string | null;
    limite?: number;
    /**
     * Quantas o operador já tem na tela antes desta página. Quem acumula é o cliente, então é ele
     * quem sabe — deduzir aqui ("veio com cursor, logo já tem uma página cheia") erraria toda vez
     * que uma página voltasse incompleta, e erraria escondendo conversa.
     */
    jaCarregadas?: number;
    /**
     * M6 — o escopo de departamento ativo. Omitido, a leitura é exatamente a de antes (é o que os
     * portões F21/F22/F25 exercitam). Presente, ele entra como PREDICADO NA CONSULTA — é esta
     * linha que o C9 mede, e é o que separa escopo de filtro de cliente.
     */
    escopo?: Escopo | null;
  } = {},
): Promise<PaginaConversas> {
  const {
    cliente,
    cursor: cursorCru,
    limite = LIMITE_PAGINA,
    jaCarregadas = 0,
    escopo = null,
  } = opcoes;
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
    // F22: o total do filtro vem do servidor, em paralelo com a página. Cursor inválido vira
    // `null` (= começar do começo) em vez de derrubar a lista ou, pior, virar consulta sem filtro.
    const cursor = decodificar(cursorCru);
    const totalPromise = contarConversasVisiveis(supabase, escopo);

    const base = supabase
      .schema("core")
      .from("v_conversa")
      .select("id,telefone,lead_id,mode,dono_atual,status,atualizado_em,ultima_entrada_em,area")
      .eq("visivel_inbox", true);
    // M6 — o escopo é a PRIMEIRA cláusula, antes do keyset: as duas são `or` e o PostgREST as une
    // por AND, então a ordem não muda o resultado; a ordem aqui é para quem lê ver que a página é
    // um recorte DO ESCOPO, e não o escopo um recorte da página.
    const comEscopo = clausulaEscopo(escopo) ? base.or(clausulaEscopo(escopo)!) : base;
    const comCursor = cursor ? comEscopo.or(filtroKeyset(cursor)) : comEscopo;
    const { data, error } = await comCursor
      .order("ultima_entrada_em", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(limite);
    const total = await totalPromise;
    if (error || !data || data.length === 0) return { ...PAGINA_VAZIA, total };

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

    const conversas = data.map((c: any) => {
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
        area: c.area ? String(c.area) : null,
      };
    });

    // Quantas o operador tem na mão depois desta página vs. quantas existem no filtro.
    const corte = houveCorte(jaCarregadas + conversas.length, total, limite);
    return { conversas, total, corte, proximoCursor: proximoCursor(conversas, corte) };
  } catch {
    return PAGINA_VAZIA;
  }
}

/**
 * F13 — cache de URL assinada, POR PROCESSO. Não é cache de dado: é cache de credencial de leitura,
 * e some no deploy. Módulo, e não parâmetro, de propósito: o ganho depende de sobreviver ENTRE
 * requisições (é a cada `router.refresh()` que a URL mudava), e um cache por requisição não faria
 * nada. O que ele nunca faz é estender a validade — quem decide isso é o TTL da assinatura.
 */
const ARMAZEM_MIDIA = criarArmazem();

/** Colunas da projeção de entrega (Trilha A, migration 0024 — contrato fechado, SPEC RF-5/6). */
const COLUNAS_BASE = "id,direcao,tipo_conteudo,corpo,criado_em";
const COLUNAS_COM_STATUS = `${COLUNAS_BASE},status_entrega,erro_codigo,autor,timestamp_origem`;
/** + colunas da pipeline de mídia (contrato rodada 5, migration em paralelo). */
const COLUNAS_COM_MIDIA = `${COLUNAS_COM_STATUS},midia_caminho,midia_mime`;

export async function lerMensagens(
  conversaId: string,
  cliente?: Supabase,
  /**
   * Instante da leitura. Existe para que a expiração do cache de mídia seja MEDÍVEL: "a URL muda
   * depois do TTL" é asserção de portão, e sem esta costura ela só poderia ser afirmada (ou o
   * portão teria de esperar 50 minutos). Em produção ninguém passa — o padrão é o relógio.
   */
  agoraMs?: number,
): Promise<Mensagem[]> {
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
        // F13: a URL assinada É a chave de cache do navegador. `createSignedUrls` devolve token
        // novo a cada chamada, e `lerMensagens` roda a cada router.refresh() — então, sem isto, o
        // mesmo `src` muda e a foto é BAIXADA DE NOVO, a cada refresh, para sempre.
        const agora = agoraMs ?? Date.now();
        expirar(ARMAZEM_MIDIA, agora); // poda: cache de processo que só cresce vira vazamento
        const faltando = precisaAssinar(ARMAZEM_MIDIA, caminhos, agora);
        if (faltando.length) {
          const { data: assinadas } = await supabase.storage
            .from("midia-whatsapp")
            .createSignedUrls(faltando, TTL_ASSINATURA_SEG);
          for (const a of assinadas ?? []) {
            if (!a.error && a.path && a.signedUrl) guardar(ARMAZEM_MIDIA, a.path, a.signedUrl, agora);
          }
        }
        for (const m of linhas) {
          const caminho = m.midia_caminho?.trim();
          const url = caminho ? obterDoCache(ARMAZEM_MIDIA, caminho, agora) : null;
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
