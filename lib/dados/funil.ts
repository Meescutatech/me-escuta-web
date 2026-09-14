import { criarClienteServidor } from "@/lib/supabase/server";
import {
  DEGRAU_COLUNAS_CARD,
  escolherProximaTarefa,
  montarUltimaMensagem,
  type ProximaTarefa,
  MINIMO_BUSCA,
  TETO_BUSCA,
  TETO_CARDS,
  chavesDoBoard,
  etapasDoBoard,
  houveCorte,
  planoBusca,
  recortarBusca,
} from "./funil-calculos";
import { parseTags } from "./ficha-calculos";
import { SLA_PADRAO_DECLARADO, interpretarSlaEtapas, type SlaEtapas } from "./funil-ordenacao";
import { ETAPAS_PADRAO, mapearEtapas, type EtapaFunil, type TipoEtapa } from "./funil-etapas";

/**
 * Reexportado para não tocar nos quatro importadores existentes (`dashboard.ts`, `sidebar.ts`,
 * `conversas/page.tsx` e este arquivo). A definição mora em `funil-etapas.ts` porque o servidor
 * MCP precisa dela SEM arrastar `next/headers` junto — ver o cabeçalho de lá.
 */
export { ETAPAS_PADRAO, type EtapaFunil, type TipoEtapa };

/**
 * Camada de leitura do FUNIL. Casada com o schema real (Agent 2, migrations 0009+0010) —
 * "Contrato de leitura do board" no CONTRATO-EVENTOS-MVP:
 *  - ETAPAS: core.v_config_vigente (nome='funil_vendas', versão vigente) → payload.etapas
 *            [{chave, nome, ordem, cor, tipo}]  (chave, NÃO id; cor hex; tipo aberto/ganho/perdido)
 *  - CARDS:  core.v_lead_card → {lead_id, nome, telefone, etapa, entrou_etapa_em, valor, origem,
 *            dono, tags, kommo_lead_id}  (dono = um campo; nome/telefone/valor podem ser NULL;
 *            idade/paciente entram na 0011 — não contar com eles ainda)
 *
 * Só dado real (Rodada 7, D3): sem cards, o board mostra o estado vazio honesto. As ETAPAS_PADRAO
 * são estrutura de config (espelho do funil_vendas), não dado de lead — valem só como fallback
 * estrutural se a config não puder ser lida.
 */

export type Origem = "wa" | "ig" | "meta" | "ind";
export type TipoResp = "dm" | "sara" | "fono";
export type AgenteProp = "clara" | "lev";

export interface PropostaPendente {
  agente: AgenteProp;
  texto: string; // resumo curto (pode conter <b>)
}

export interface CardLead {
  lead_id: string;
  nome: string | null;
  idade: number | null; // vem só na 0011 — hoje null pra cards reais
  telefone: string | null;
  etapa: string; // = chave da etapa
  entrou_etapa_em: string | null;
  valor: number | null;
  origem: Origem | null;
  responsavel: { tipo: TipoResp; nome: string } | null; // dono_nome (vínculo uuid) > derivado de `dono` legado
  dono_id: string | null; // uuid de core.usuario (0060) — base do "meus leads"
  dono_nome: string | null; // resolvido pela view em core.usuario
  tags: string[]; // core.lead.tags (jsonb) — a view já retorna; base do filtro por tag
  proposta: PropostaPendente | null; // não vem da view ainda — null até o laço de sugestões chegar no card
  kommo_lead_id?: string | null;
  /**
   * R20: o lead tem tarefa PENDENTE? `null` = não foi possível saber (leitura falhou ou bateu no
   * teto). Três estados, não dois — e o null é o que impede o filtro "sem próxima ação" de acusar
   * lead saudável por causa de uma consulta que não voltou.
   */
  tem_tarefa_pendente: boolean | null;
  /**
   * "A primeira coisa que ela quer saber é que dia foi que ele mandou isso" (workshop 12/08).
   *
   * ── R23/W2 · o que estava errado até 22/08 ────────────────────────────────────────────────
   * Este campo existia, o componente sabia desenhá-lo, e `montarCard` NUNCA o preenchia — a
   * `v_lead_card` tinha 17 colunas e nenhuma de mensagem. A consequência não era só a linha
   * faltando: a ordem "Sem resposta há mais tempo" comparava `undefined` com `undefined`, caía
   * no desempate e entregava ORDEM ALFABÉTICA DE UUID. Um menu que promete uma coisa e faz outra.
   * Agora vem das três colunas do contrato (`ultima_mensagem_corpo/_em/_direcao`), e 71 dos 97
   * cards do board têm mensagem no banco (medido em 22/08).
   *
   * Segue OPCIONAL: se a migration da view não tiver descido, a leitura cai no degrau sem as três
   * colunas e o campo volta `undefined` — o card não desenha a linha em vez de inventar uma.
   * `de`: quem falou por último — é o que separa "ele não respondeu" de "eu não respondi".
   */
  ultima_mensagem?: { texto: string; em: string; de: "cliente" | "nos" } | null;
  /**
   * Compromisso marcado com o lead no futuro — o que PAUSA o relógio da prioridade (D55 item 4).
   * Hoje é derivado da tarefa pendente com `prazo` no futuro, que é o único compromisso datado que
   * o schema guarda. Medido em 22/08: `core.tarefa` tem 0 linhas, então nada pausa hoje — a
   * mecânica está pronta e inerte, e é assim que ela deve ficar até haver compromisso de verdade.
   */
  compromisso_em?: string | null;
  /** H5 · cidade DECLARADA pelo paciente (ficha) — `undefined` quando a view ainda não a expõe. */
  cidade?: string | null;
  /**
   * W-D6 (10/09) · a PRÓXIMA TAREFA do lead (benchmark de tarefas §4 item 1). Três estados, como
   * `tem_tarefa_pendente`: `undefined` = a leitura de tarefas não voltou (o card não afirma nada);
   * `null` = nenhuma pendente — e isso é o alerta "sem próxima ação", em cinza, que a régua do
   * Kommo nunca mostrou a ninguém; objeto = a de prazo mais cedo entre as pendentes.
   */
  proxima_tarefa?: ProximaTarefa | null;
  /**
   * W-D6 · AUDIOMETRIA no card (card G4 do board): o mesmo de-para do drawer (`Sim`/`Não` na
   * projeção `core.lead_campo`, slug `audiometria`). `undefined` = projeção não lida; `null` =
   * ficha sem o campo. O card só desenha ✓/✗ quando sabe — nunca pinta o gate no escuro.
   */
  audiometria?: "fez" | "nao_fez" | null;
  /**
   * W-D6 · departamento do lead para o segmented "Pré-venda · Pós-venda · Todos". Hoje só a fixture
   * de ensaio preenche — `core.lead` não carrega área; quem carrega é a conversa. `undefined` passa
   * por todo recorte: recortar sem saber seria esconder lead por falta de dado.
   */
  departamento?: string | null;
}

export interface DadosFunil {
  /** Só as etapas de COLUNA (config vigente menos `no_board`) — é o que o board desenha. */
  etapas: EtapaFunil[];
  /**
   * R23 · a config inteira, incluindo as `no_board`. A busca no servidor acha lead em etapa que
   * não é coluna (hoje `arquivado`), e o resultado precisa saber dizer o NOME dessa etapa —
   * mostrar a chave crua ("arquivado") no lugar do nome seria a UI confessando que não sabe.
   */
  todasEtapas: EtapaFunil[];
  cards: CardLead[];
  /** Leitura bateu no TETO_CARDS — a UI avisa que o board mostra os mais recentes, nunca finge completude. */
  corte: boolean;
  /**
   * Prazo por etapa + limiares da cor (D56). Vem de `core.config` chave `sla_etapas`; quando ela
   * não existe, vem o `SLA_PADRAO_DECLARADO` com `daConfig: false` — e a legenda do board DIZ que
   * está no padrão. Padrão silencioso faria o rótulo do card mentir.
   */
  sla: SlaEtapas;
}

// ─────────────── leitura real ───────────────

const MAPA_ORIGEM: Record<string, Origem> = {
  whatsapp: "wa", wa: "wa", instagram: "ig", ig: "ig",
  meta: "meta", "meta ads": "meta", facebook: "meta", ind: "ind", indicacao: "ind", "indicação": "ind",
};

/**
 * Deriva um responsável exibível do campo `dono`. Regra do spec (legenda de chips): o chip é um
 * ATOR REAL atribuído (IA=Clara | humano nomeado). Artefato de import (`kommo:<id>`), `humano:<uid>`
 * sem nome legível, ou null → SEM chip (não inventar ator — feedback 19/07).
 */
function donoParaResponsavel(dono: string | null): { tipo: TipoResp; nome: string } | null {
  if (!dono) return null;
  const d = dono.trim();
  if (/^kommo:/i.test(d) || /^humano:/i.test(d) || /^sistema$/i.test(d) || /^bot$/i.test(d)) return null;
  if (/clara|jarvis|\bia\b/i.test(d)) return { tipo: "dm", nome: "Clara" }; // cor decidida por respEhIA
  const tipo: TipoResp = /sara/i.test(d) ? "sara" : /fono/i.test(d) ? "fono" : "dm";
  return { tipo, nome: d };
}

/** Cliente injetável — mesma razão de spec que em conversas.ts (portões do F24a/F25). */
type Supabase = ReturnType<typeof criarClienteServidor>;

export async function lerEtapasReais(cliente?: Supabase): Promise<EtapaFunil[] | null> {
  const supabase = cliente ?? criarClienteServidor();
  const { data, error } = await supabase
    .schema("core")
    .from("v_config_vigente")
    .select("payload")
    .eq("nome", "funil_vendas")
    .maybeSingle();
  if (error || !data) return null;
  return mapearEtapas(data.payload);
}

/** Teto da leitura de tarefas pendentes. Hoje `core.tarefa` tem 0 linhas — folga larga. */
const TETO_TAREFAS_PENDENTES = 5000;

/**
 * R20 · quais leads têm tarefa PENDENTE. Uma leitura estreita (`lead_id` das pendentes), no molde
 * F24a: teto+1 como detector. Devolve `null` quando não dá para saber — e aí todo card fica com
 * `tem_tarefa_pendente = null`, o que faz o filtro "sem próxima ação" não acusar ninguém.
 *
 * Por que não `count` por lead: a pergunta é binária ("tem próxima ação?"), e contar convidaria a
 * mostrar "3 tarefas" no card — que é justamente o cemitério de 755 itens do Kommo que o comentário
 * da sidebar manda não repetir.
 */
interface TarefasDoBoard {
  /** leads com ao menos uma tarefa pendente */
  pendente: Set<string>;
  /** lead → prazo futuro mais PRÓXIMO (o compromisso que pausa o relógio, D55 item 4) */
  compromisso: Map<string, string>;
  /** W-D6 · lead → a próxima tarefa (prazo mais cedo entre as pendentes; sem prazo por último) */
  proxima: Map<string, ProximaTarefa>;
}

/**
 * W-D6: as colunas que a linha "Próxima tarefa" do card precisa, em degrau. `responsavel_id` é
 * do Bloco A e pode não existir num banco antigo — pedir coluna inexistente derruba a consulta,
 * e derrubar a leitura de tarefas apagaria o chip "sem próxima ação" inteiro por causa de um
 * nome de responsável. Desce um degrau por erro, como a escada de `lerCardsReais`.
 */
const DEGRAU_COLUNAS_TAREFA = [
  "id,lead_id,prazo,titulo,responsavel_id,responsavel",
  "id,lead_id,prazo,titulo,responsavel",
  "lead_id,prazo",
];

async function lerLeadsComTarefaPendente(
  supabase: Supabase,
  agora: number,
): Promise<TarefasDoBoard | null> {
  const consulta = (colunas: string) =>
    supabase
      .schema("core")
      .from("tarefa")
      .select(colunas)
      .eq("status", "pendente")
      .not("lead_id", "is", null)
      .limit(TETO_TAREFAS_PENDENTES + 1);
  let { data, error } = await consulta(DEGRAU_COLUNAS_TAREFA[0]);
  for (let i = 1; error && i < DEGRAU_COLUNAS_TAREFA.length; i++) {
    ({ data, error } = await consulta(DEGRAU_COLUNAS_TAREFA[i]));
  }
  if (error || !data || data.length > TETO_TAREFAS_PENDENTES) return null;

  const pendente = new Set<string>();
  const compromisso = new Map<string, string>();
  const porLead = new Map<string, Array<{ id: string; status: string; prazo: string | null; titulo: string; responsavel_id: string | null; responsavel: string | null }>>();
  for (const r of data as any[]) {
    const id = String(r.lead_id);
    pendente.add(id);
    if (r.id != null) {
      const lista = porLead.get(id) ?? [];
      lista.push({
        id: String(r.id),
        status: "pendente",
        prazo: r.prazo ? String(r.prazo) : null,
        titulo: r.titulo ? String(r.titulo) : "Tarefa sem título",
        responsavel_id: r.responsavel_id ? String(r.responsavel_id) : null,
        responsavel: r.responsavel ? String(r.responsavel) : null,
      });
      porLead.set(id, lista);
    }
    // "compromisso marcado" = tarefa aberta com data no FUTURO. É a leitura que o benchmark §3.2
    // já dá como equivalente ("audiometria/consulta agendada com data, ou tarefa aberta com prazo
    // futuro"); prazo VENCIDO não pausa nada — vencido é justamente o oposto de agendado.
    const t = r.prazo ? new Date(String(r.prazo)).getTime() : NaN;
    if (!Number.isNaN(t) && t > agora) {
      const atual = compromisso.get(id);
      // o mais PRÓXIMO manda: é a data em que o relógio volta a correr
      if (!atual || t < new Date(atual).getTime()) compromisso.set(id, String(r.prazo));
    }
  }
  const proxima = new Map<string, ProximaTarefa>();
  for (const [id, lista] of porLead) {
    const p = escolherProximaTarefa(lista);
    if (p) proxima.set(id, { id: p.id, titulo: p.titulo, prazo: p.prazo, responsavel_id: p.responsavel_id, responsavel: p.responsavel });
  }
  return { pendente, compromisso, proxima };
}

/** Teto da leitura de audiometria. É uma linha por lead com o campo preenchido — folga larga. */
const TETO_AUDIOMETRIA = 5000;

/**
 * W-D6 · a AUDIOMETRIA de cada lead, para o ✓/✗ do card (G4). Mesmo vocabulário do drawer
 * (`components/funil/drawer-card.tsx`, `audiometriaDoValor`): "Sim"/"Não" na projeção
 * `core.lead_campo`, slug `audiometria`. `null` = não deu para ler — e aí NENHUM card desenha o
 * gate, em vez de todos aparecerem como "sem audiometria" por causa de uma consulta que não voltou.
 */
async function lerAudiometriaPorLead(
  supabase: Supabase,
): Promise<Map<string, "fez" | "nao_fez"> | null> {
  const { data, error } = await supabase
    .schema("core")
    .from("lead_campo")
    .select("lead_id,valor")
    .eq("campo", "audiometria")
    .limit(TETO_AUDIOMETRIA + 1);
  if (error || !data || data.length > TETO_AUDIOMETRIA) return null;
  const m = new Map<string, "fez" | "nao_fez">();
  for (const r of data as any[]) {
    const v = r.valor == null ? "" : String(r.valor).trim().toLowerCase();
    if (v === "sim" || v === "true") m.set(String(r.lead_id), "fez");
    else if (v === "nao" || v === "n\u00e3o" || v === "false") m.set(String(r.lead_id), "nao_fez");
  }
  return m;
}

/**
 * `core.config` nome='sla_etapas' (D56) — o prazo por etapa e os limiares da cor.
 *
 * Molde do `motivo_perda`/`atribuicao_responsavel`: config é DADO versionado, relido a cada
 * passada, e mudar prazo não exige deploy nem restart (Constituição Art. IV). O degrau é
 * DECLARADO: sem a config, volta o `SLA_PADRAO_DECLARADO` com `daConfig: false`, e o board mostra
 * o aviso. Cair num padrão calado faria o rótulo do card afirmar uma urgência que ninguém definiu.
 */
export async function lerSlaEtapas(cliente?: Supabase): Promise<SlaEtapas> {
  try {
    const supabase = cliente ?? criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("v_config_vigente")
      .select("payload")
      .eq("nome", "sla_etapas")
      .maybeSingle();
    if (error || !data) return SLA_PADRAO_DECLARADO;
    return interpretarSlaEtapas((data as any).payload) ?? SLA_PADRAO_DECLARADO;
  } catch {
    return SLA_PADRAO_DECLARADO;
  }
}

/**
 * ⚠️ EXPORTADA e com `cliente?` desde 22/08 — e o motivo não é simetria com as vizinhas.
 *
 * O DEGRAU desta função (`DEGRAU_COLUNAS_CARD`, logo abaixo) é a única coisa que
 * separa "board sem a linha de última mensagem" de "board VAZIO" no dia em que a migration da
 * `v_lead_card` não tiver descido: pedir coluna inexistente ao PostgREST derruba a consulta
 * INTEIRA, não só a coluna. Até aqui esse degrau era intestável — a função criava o cliente por
 * dentro, e nenhum teste podia forçar o erro da primeira chamada. Degrau silencioso que ninguém
 * exercita é degrau que ninguém sabe se ainda existe.
 *
 * `lerEtapasReais`, `lerSlaEtapas` e `buscarLeads` já aceitavam cliente injetado pela mesma razão
 * (portões do F24a/F25). Esta era a que faltava. Ver tests/funil-degrau-colunas.test.ts.
 */
export async function lerCardsReais(
  chavesEtapas: string[],
  cliente?: Supabase,
): Promise<{ cards: CardLead[]; corte: boolean }> {
  const supabase = cliente ?? criarClienteServidor();
  // Só etapas do board (config vigente) — 'arquivado' etc. NUNCA entram nem roubam vaga do
  // teto. Order determinístico (mais recentes primeiro + lead_id de desempate): se o volume
  // passar do teto, o corte é estável entre reloads e a UI avisa (flag `corte`).
  // As duas leituras são independentes e disparam juntas — a de tarefas nunca atrasa o board, e
  // se ela falhar o board aparece igual (com `tem_tarefa_pendente = null`).
  const consulta = (colunas: string) =>
    supabase
      .schema("core")
      .from("v_lead_card")
      .select(colunas)
      .in("etapa", chavesEtapas)
      .order("entrou_etapa_em", { ascending: false, nullsFirst: false })
      .order("lead_id", { ascending: true })
      .limit(TETO_CARDS);

  const agora = Date.now();
  // O DEGRAU é o que separa "board sem a linha de mensagem" de "board VAZIO": pedir coluna
  // inexistente ao PostgREST derruba a consulta inteira, não só a coluna.
  //
  // H5 (merge de 14/09) · a escada tem TRÊS degraus — com cidade → sem cidade → base. Desce UM
  // por erro, e é essa a diferença que importa: com dois degraus só, o dia em que faltasse a
  // coluna de cidade derrubaria a primeira consulta e o fallback cairia DIRETO na base, perdendo
  // a linha de última mensagem, que funciona em produção hoje. Perde-se só o que falta.
  let [{ data, error }, comTarefa] = await Promise.all([
    consulta(DEGRAU_COLUNAS_CARD[0]),
    lerLeadsComTarefaPendente(supabase, agora),
  ]);
  for (let i = 1; error && i < DEGRAU_COLUNAS_CARD.length; i++) {
    ({ data, error } = await consulta(DEGRAU_COLUNAS_CARD[i]));
  }
  if (error || !data) return { cards: [], corte: false }; // leitura indisponível → board vazio honesto
  const cards = (data as any[]).map((r: any) => {
    const id = String(r.lead_id);
    // `tem_tarefa_pendente` só é conhecido quando a leitura de tarefas voltou; a busca (que não a
    // faz) passa `null` e o filtro "sem próxima ação" corretamente não acusa ninguém por ela.
    const card = montarCard(
      r,
      comTarefa == null ? null : comTarefa.pendente.has(id),
      comTarefa?.compromisso.get(id) ?? null,
    );
    if (comTarefa != null) card.proxima_tarefa = comTarefa.proxima.get(id) ?? null;
    return card;
  });
  return { cards, corte: houveCorte(cards.length, TETO_CARDS) };
}

/**
 * Linha de `core.v_lead_card` → `CardLead`. Fonte ÚNICA da montagem: o board e a busca leem as
 * mesmas colunas e precisam produzir o mesmo card — se a derivação do chip de responsável ou do
 * mapa de origem divergisse entre os dois, o mesmo lead teria duas caras conforme o caminho.
 */
function montarCard(
  r: any,
  temTarefaPendente: boolean | null = null,
  compromissoEm: string | null = null,
): CardLead {
  const origemRaw = r.origem ? String(r.origem).toLowerCase() : null;
  // vínculo por uuid (0060) tem precedência sobre o texto legado na hora do chip
  const donoNome = r.dono_nome ? String(r.dono_nome) : null;
  return {
    lead_id: String(r.lead_id),
    nome: r.nome ?? null,
    idade: null, // 0011
    telefone: r.telefone ?? null,
    etapa: String(r.etapa ?? "novo"),
    entrou_etapa_em: r.entrou_etapa_em ?? null,
    valor: r.valor != null ? Number(r.valor) : null,
    origem: origemRaw ? (MAPA_ORIGEM[origemRaw] ?? null) : null,
    responsavel: donoNome
      ? { tipo: (/sara/i.test(donoNome) ? "sara" : /fono/i.test(donoNome) ? "fono" : "dm") as TipoResp, nome: donoNome }
      : donoParaResponsavel(r.dono ?? null),
    dono_id: r.dono_id ?? null,
    dono_nome: donoNome,
    tags: parseTags(r.tags),
    proposta: null,
    kommo_lead_id: r.kommo_lead_id ?? null,
    tem_tarefa_pendente: temTarefaPendente,
    ultima_mensagem: montarUltimaMensagem(r),
    // H5 · a cidade só existe quando a view a expõe. Ausente ≠ vazio: `undefined` é "a view não
    // tem a coluna", `null` é "tem, e este lead não declarou". O card não desenha nenhum dos dois.
    // Até este merge o tipo declarava `cidade` e NINGUÉM a preenchia: a view tinha a coluna
    // (conferido em produção 14/09), o card sabia desenhá-la, e a consulta nunca a pedia.
    cidade: "cidade" in r ? (r.cidade ? String(r.cidade) : null) : undefined,
    compromisso_em: compromissoEm,
  };
}


/** Fonte única do board. Etapas reais (senão padrão estrutural); cards só reais — vazio é vazio. */
export async function lerFunil(cliente?: Supabase): Promise<DadosFunil> {
  try {
    // etapas e SLA são independentes e disparam juntos — o SLA nunca atrasa o board, e se ele
    // falhar o board aparece igual, no padrão declarado e com o aviso na legenda.
    const [etapasLidas, sla] = await Promise.all([lerEtapasReais(cliente), lerSlaEtapas(cliente)]);
    const todasEtapas = etapasLidas ?? ETAPAS_PADRAO; // cards filtram pelas chaves da config
    // W-D6: a audiometria (✓/✗ do card) é leitura própria, concorrente com os cards, e mora AQUI e
    // não dentro de `lerCardsReais` — o degrau de colunas daquela função é medido por um teste que
    // conta as consultas à `v_lead_card`, e uma consulta a outra tabela no meio dele viraria ruído
    // na régua. Falhou = `audiometria` fica `undefined` em todo card: nenhum gate pintado no escuro.
    const [{ cards, corte }, audiometria] = await Promise.all([
      lerCardsReais(chavesDoBoard(todasEtapas), cliente),
      lerAudiometriaPorLead(cliente ?? criarClienteServidor()),
    ]);
    if (audiometria != null) for (const c of cards) c.audiometria = audiometria.get(c.lead_id) ?? null;
    return { etapas: etapasDoBoard(todasEtapas), todasEtapas, cards, corte, sla };
  } catch {
    return {
      etapas: ETAPAS_PADRAO,
      todasEtapas: ETAPAS_PADRAO,
      cards: [],
      corte: false,
      sla: SLA_PADRAO_DECLARADO,
    };
  }
}

/*
 * ── R23 · Trilha E — A BUSCA VAI AO BANCO ───────────────────────────────────────────────────
 *
 * O que havia: `filtrarCards` (lib/dados/funil-filtros.ts) roda no navegador, sobre o array que o
 * board já carregou. Ela continua existindo e continua certa — é o filtro do que está na tela.
 * O que ela nunca pôde ser é BUSCA, porque busca é a pergunta "existe em algum lugar?", e o que
 * está na tela não é o universo.
 *
 * Três recortes tiram lead do alcance do filtro do cliente, e os três são reais hoje:
 *   1. etapa `no_board` — 582 dos 679 leads estão em `arquivado`, que deixou de ser coluna;
 *   2. TETO_CARDS (2.000) — o board lê os mais recentes e corta o resto (o Kommo já tem 690 e
 *      cresce; o dia em que passar de 2.000, o corte é silencioso para quem digita um nome);
 *   3. o filtro de etapa/responsável/período que o operador já tenha ligado.
 *
 * Esta função responde a pergunta certa no lugar certo: um `ilike` sobre `core.v_lead_card`
 * INTEIRA, sem filtro de etapa, com teto próprio e ordenação determinística. Custa uma ida ao
 * servidor por busca — medida em 17/08/2026 entre 232 e 251 ms, contra 292 ms que o board gastava
 * carregando os 582 arquivados em TODA visita, achando ou não.
 */

export interface ResultadoBusca {
  termo: string;
  cards: CardLead[];
  /** Havia mais que o teto — a UI diz "refine", nunca deixa o operador achar que viu tudo. */
  truncado: boolean;
  /** A leitura falhou. Diferente de "achou zero" — e a UI precisa dizer coisas diferentes. */
  erro: boolean;
}

const VAZIO: Omit<ResultadoBusca, "termo"> = { cards: [], truncado: false, erro: false };

/**
 * Busca por nome OU telefone em TODO o `core.v_lead_card`, ignorando etapa e teto do board.
 *
 * Telefone: a coluna guarda só dígitos ("5527998316220" — verificado nas 628 linhas com telefone),
 * então uma busca digitada com máscara precisa ser reduzida a dígitos antes de comparar. É a mesma
 * regra de `buscaCasa`, e as duas continuam tendo que concordar — o teste compara as duas.
 */
export async function buscarLeads(termo: string, cliente?: Supabase): Promise<ResultadoBusca> {
  const plano = planoBusca(termo); // puro e testado em funil-calculos.ts
  if (plano == null) return { termo, ...VAZIO };
  const supabase = cliente ?? criarClienteServidor();

  // Repare no que NÃO está aqui: nenhum `.in("etapa", …)`. É a ausência que faz a busca alcançar
  // os 582 leads em `arquivado` — a etapa que deixou de ser coluna do board.
  const consulta = (colunas: string) =>
    supabase
      .schema("core")
      .from("v_lead_card")
      .select(colunas)
      .or(plano.or)
      .order("entrou_etapa_em", { ascending: false, nullsFirst: false })
      .order("lead_id", { ascending: true })
      .limit(plano.limite);

  // mesmo degrau do board: sem as três colunas de última mensagem, a busca acha do mesmo jeito e
  // o resultado sai sem a linha — em vez de a busca inteira responder "erro".
  let { data, error } = await consulta(plano.colunas);
  if (error) ({ data, error } = await consulta(planoBusca(termo, false)!.colunas));

  if (error || !data) return { termo, cards: [], truncado: false, erro: true };
  const { cards, truncado } = recortarBusca(data as any[]);
  // arrow explícita: `.map(montarCard)` passaria o ÍNDICE no lugar de `temTarefaPendente`
  return { termo, cards: cards.map((r) => montarCard(r)), truncado, erro: false };
}
