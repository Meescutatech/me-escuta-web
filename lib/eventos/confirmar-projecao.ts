/**
 * Read-back do limite de escrita (achado da verificação clicada da R15; F6 da Rodada 16):
 * "sucesso" só depois de confirmar que a projeção EXISTE — o ledger aceitar não basta. A R14/R15
 * provou ao vivo que um dispatcher sem o ramo aceita `template_criado` e perde em silêncio: o form
 * fecha "com sucesso" e a lista volta vazia.
 *
 * Por que isso é uma leitura determinística, e não polling: a projeção é SÍNCRONA na mesma
 * transação (`porta.inserir_evento` chama `porta.aplicar_projetores` antes de retornar) e os
 * projetores carimbam a posição do evento. Quando o RPC volta, a linha existe — ou nunca vai
 * existir. NÃO escreva laço de espera.
 *
 * NÃO generalizar como "dispatcher recusa tipo desconhecido": há tipos deliberadamente sem
 * projetor (ex.: `levindo_acionado` fica só no ledger). A apólice é por ação, no limite de escrita,
 * e cada ausência de conferência é DECLARADA aqui embaixo com o motivo — nunca por esquecimento.
 */

/** O que `api.registrar_evento` devolve (via `porta.recebe_evento_externo`). */
export interface RespostaRegistrarEvento {
  duplicado?: boolean;
  evento_id?: string;
  posicao_global?: number;
}

export const MOTIVO_NAO_PROJETADO =
  "o evento entrou no ledger mas a projeção não apareceu — provável ramo perdido no dispatcher (a tela voltaria a mentir); avise quem cuida do banco";

/** Falha de LEITURA da conferência ≠ "não projetou". Nunca assumir sucesso quando não deu para ver. */
export function motivoFalhaVerificacao(erro: string): string {
  return `a escrita foi aceita, mas não deu para confirmar a projeção (${erro}) — recarregue antes de repetir`;
}

/**
 * Posição a conferir na projeção, ou null quando não há o que conferir:
 * duplicado é idempotência (não é falha; a projeção vigente é a do evento original) e resposta sem
 * `posicao_global` é contrato antigo — não inventar falha onde não há chave de conferência.
 */
export function posicaoParaConferir(
  resposta: RespostaRegistrarEvento | null | undefined,
): number | null {
  if (!resposta || resposta.duplicado) return null;
  return typeof resposta.posicao_global === "number" ? resposta.posicao_global : null;
}

/** Veredito puro: `encontrou = null` significa "não havia o que conferir". */
export function avaliarProjecao(encontrou: boolean | null): { ok: boolean; motivo?: string } {
  if (encontrou === false) return { ok: false, motivo: MOTIVO_NAO_PROJETADO };
  return { ok: true };
}

/*
 * ── A tabela ação → conferência ────────────────────────────────────────────────────────────────
 *
 * DADO, não `if` espalhado, porque o modo de falha mais caro deste item é errar UMA linha: a ação
 * passa a reportar falha em toda escrita bem-sucedida, o operador para de confiar na tela, e a
 * escrita DE VERDADE aconteceu. Concentrada aqui, cada linha é testável isoladamente.
 *
 * Cada entrada foi conferida contra o corpo VIVO do projetor no banco (`pg_get_functiondef`), não
 * contra a documentação. Duas divergiram do que a spec da Fase 1 previa, e as duas teriam produzido
 * exatamente esse falso negativo:
 *
 *   · `anotacao_adicionada` — a spec mandava conferir `core.anotacao.ultima_posicao`. Essa coluna
 *     NÃO EXISTE: `proj_anotacao` grava `id = e.id` e nenhuma posição. Conferir por posição
 *     reprovaria 100% das notas salvas. A chave certa é o `evento_id`.
 *   · `mencao_lida` — `proj_mencao` tem `and m.lida_em is null` ("primeira leitura manda"). Marcar
 *     como lida uma menção JÁ lida é um no-op correto que não mexe em `ultima_posicao`. Conferir
 *     por posição reprovaria o caminho idempotente. A chave certa é o estado: `lida_em not null`.
 *
 * E uma terceira divergiu para MELHOR, então a exceção que a spec previa não existe mais:
 *
 *   · `enviar_mensagem_humana` — a spec declarava como exceção permanente, com o argumento de que
 *     a linha "só nasce quando o sender confirma o envio". Não é o que o banco faz hoje:
 *     `proj_mensagem_saida` insere em `core.mensagem` na MESMA transação, com `id = e.id`,
 *     `direcao='saida'` e `status_entrega='na_fila'` — a bolha aparece imediatamente em
 *     "aguardando" e o sender depois só promove o status. Medido: escrita pelo portão, linha
 *     presente com `status=na_fila`. Ou seja, a escrita mais cara do app (mensagem para um
 *     paciente) é CONFERÍVEL, e conferi-la é o item inteiro. A exceção foi removida em vez de
 *     copiada — declarar uma ausência que não precisa existir também é mentir para a próxima
 *     pessoa. O que continua verdade é o resto da frase: `mensagem_enviada` (o fato de ter saído
 *     mesmo) é do sender, e a UI segue sem emiti-lo.
 */

/** Como confirmar: pela posição carimbada, pelo id do evento, ou por um estado da linha. */
/**
 * Um filtro do modo `filtros` (abaixo). Vocabulário mínimo para expressar "a linha ESPERADA", que é
 * o que as telas B conferem: não basta a linha existir, ela tem de estar no estado que a ação
 * prometeu (ligado, resolvido, versão nova).
 */
export type FiltroProjecao =
  | { campo: string; op: "igualPayload"; dePayload: string }
  | { campo: string; op: "igualPayloadMais1"; dePayload: string }
  | { campo: string; op: "igualEvento" }
  | { campo: string; op: "igual"; valor: string | number | boolean }
  | { campo: string; op: "naoNulo" };

export type ConferenciaProjecao =
  | { tabela: string; por: "posicao"; coluna: string }
  | { tabela: string; por: "evento"; coluna: string }
  | { tabela: string; por: "estado"; chave: string; campoPayload: string; naoNulo: string }
  /**
   * `filtros` (R16-20, Web-B): a releitura precisa de MAIS DE UMA condição. As views das telas B
   * (`v_canal_whatsapp`, `v_suporte_ticket`, `v_config_vigente`) não expõem `ultima_posicao`, então
   * a conferência é pelo EFEITO ESPERADO — e efeito quase nunca cabe num par chave/valor: "o canal
   * X está LIGADO", "a config Y subiu para a versão base+1", "o ticket Z está RESOLVIDO".
   *
   * Espremer isso nos três modos acima teria enfraquecido a conferência em silêncio (conferir só
   * que a linha existe, quando ela já existia antes), que é a forma de o readback virar decoração.
   */
  | { tabela: string; por: "filtros"; coluna: string; filtros: FiltroProjecao[] };

/** Valor concreto de um filtro. Puro: é o que o teste exercita sem banco. */
export type FiltroResolvido =
  | { campo: string; tipo: "igual"; valor: string | number | boolean }
  | { campo: string; tipo: "naoNulo" };

export function resolverFiltro(
  filtro: FiltroProjecao,
  payload: Record<string, unknown>,
  eventoId: string | null,
): FiltroResolvido | null {
  switch (filtro.op) {
    case "igual":
      return { campo: filtro.campo, tipo: "igual", valor: filtro.valor };
    case "naoNulo":
      return { campo: filtro.campo, tipo: "naoNulo" };
    case "igualEvento":
      return eventoId ? { campo: filtro.campo, tipo: "igual", valor: eventoId } : null;
    case "igualPayload": {
      const v = payload[filtro.dePayload];
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        return { campo: filtro.campo, tipo: "igual", valor: v };
      }
      return null;
    }
    case "igualPayloadMais1": {
      const v = payload[filtro.dePayload];
      return typeof v === "number" && Number.isFinite(v)
        ? { campo: filtro.campo, tipo: "igual", valor: v + 1 }
        : null;
    }
    default:
      return null;
  }
}

/**
 * Resolve todos. `null` = algum filtro ficou sem valor — e isso NÃO vira "confere sem ele": um
 * filtro que some transforma "esta linha" em "qualquer linha", e a conferência passaria a aprovar a
 * escrita de outra pessoa.
 */
export function resolverFiltros(
  filtros: FiltroProjecao[],
  payload: Record<string, unknown>,
  eventoId: string | null,
): FiltroResolvido[] | null {
  const saida: FiltroResolvido[] = [];
  for (const f of filtros) {
    const r = resolverFiltro(f, payload, eventoId);
    if (!r) return null;
    saida.push(r);
  }
  return saida;
}

/** Ausência de conferência DECLARADA, com o motivo escrito. Nunca por esquecimento. */
export interface ExcecaoConferencia {
  motivo: string;
  /** confere ao menos que o evento existe no ledger — o que dá para provar sem mentir */
  conferirLedger: boolean;
}

export const CONFERENCIA: Readonly<Record<string, ConferenciaProjecao>> = {
  anotacao_adicionada: { tabela: "anotacao", por: "evento", coluna: "id" },

  tarefa_criada: { tabela: "tarefa", por: "posicao", coluna: "ultima_posicao" },
  tarefa_concluida: { tabela: "tarefa", por: "posicao", coluna: "ultima_posicao" },
  tarefa_reatribuida: { tabela: "tarefa", por: "posicao", coluna: "ultima_posicao" },
  tarefa_prazo_repactuado: { tabela: "tarefa", por: "posicao", coluna: "ultima_posicao" },
  tarefa_arquivada: { tabela: "tarefa", por: "posicao", coluna: "ultima_posicao" },
  tarefa_assumida: { tabela: "tarefa", por: "posicao", coluna: "ultima_posicao" },

  mencao_criada: { tabela: "mencao", por: "posicao", coluna: "ultima_posicao" },
  mencao_promovida_tarefa: { tabela: "mencao", por: "posicao", coluna: "ultima_posicao" },
  mencao_lida: {
    tabela: "mencao",
    por: "estado",
    chave: "id",
    campoPayload: "mencao_id",
    naoNulo: "lida_em",
  },

  lead_atualizado: { tabela: "lead_campo", por: "posicao", coluna: "ultima_posicao" },
  etapa_alterada: { tabela: "estado_lead", por: "posicao", coluna: "ultima_posicao" },
  dono_atribuido: { tabela: "lead", por: "posicao", coluna: "ultima_posicao" },

  conversa_assumida: { tabela: "conversa", por: "posicao", coluna: "posse_posicao" },
  conversa_devolvida: { tabela: "conversa", por: "posicao", coluna: "posse_posicao" },

  // A bolha nasce aqui, em "na_fila", na mesma transação. Sair de fato é outro evento, do sender.
  enviar_mensagem_humana: { tabela: "mensagem", por: "evento", coluna: "id" },

  /*
   * ── TELAS B (R16-20 · Web-B) ────────────────────────────────────────────────────────────────
   * As dez linhas entram AQUI, e não antes, porque a regra desta casa é que a linha migra JUNTO do
   * caso que a exercita com ESCRITA REAL (E-020). O caso é
   * `supabase/verificacao/web-b-escrita-real.sql`, verde no stack db-r16-c em 27/07:
   * 4 vacuidades · 10 recusas · 18 medidas · baseline idêntico.
   *
   * E ele não passou de primeira: REPROVOU e pegou um defeito real (ARB-26). A regra da abertura de
   * ticket conferia por `payload.ticket_id`, e a 0070 crava `id = evento.id` e nunca lê esse campo —
   * a releitura devolvia zero para toda abertura BEM-SUCEDIDA. A identidade nasce do evento; quem
   * manda id de fora está inventando identidade. Por isso a linha abaixo confere por `igualEvento`.
   */
  canal_registrado: {
    tabela: "v_canal_whatsapp",
    por: "filtros",
    coluna: "canal_id",
    filtros: [{ campo: "canal_id", op: "igualPayload", dePayload: "canal_id" }],
    // registrar nasce ativo=false, então `ativo` não serve de prova: o efeito é a linha existir.
  },
  canal_atualizado: {
    tabela: "v_canal_whatsapp",
    por: "filtros",
    coluna: "nome",
    filtros: [
      { campo: "canal_id", op: "igualPayload", dePayload: "canal_id" },
      { campo: "nome", op: "igualPayload", dePayload: "nome" },
    ],
    // patch parcial: confere o campo que a tela mandou. Só existir a linha não provaria nada.
  },
  canal_ativado: {
    tabela: "v_canal_whatsapp",
    por: "filtros",
    coluna: "ativo",
    filtros: [
      { campo: "canal_id", op: "igualPayload", dePayload: "canal_id" },
      { campo: "ativo", op: "igual", valor: true },
    ],
    // o efeito É o estado: ligar e a linha continuar false é o que o readback tem de pegar.
  },
  canal_desativado: {
    tabela: "v_canal_whatsapp",
    por: "filtros",
    coluna: "ativo",
    filtros: [
      { campo: "canal_id", op: "igualPayload", dePayload: "canal_id" },
      { campo: "ativo", op: "igual", valor: false },
    ],
    // este é o caminho que mata mensagem em voo — mentir aqui custa caro.
  },
  canal_consentimento_registrado: {
    tabela: "v_canal_whatsapp",
    por: "filtros",
    coluna: "consentimento_em",
    filtros: [
      { campo: "canal_id", op: "igualPayload", dePayload: "canal_id" },
      { campo: "consentimento_em", op: "naoNulo" },
    ],
    // consentimento é o PORTÃO da sessão: "registrado" sem a coluna preenchida liberaria o
    // pareamento de um número pessoal sem base.
  },
  config_publicada: {
    tabela: "v_config_vigente",
    por: "filtros",
    coluna: "versao",
    filtros: [
      { campo: "nome", op: "igualPayload", dePayload: "nome" },
      { campo: "versao", op: "igualPayloadMais1", dePayload: "versao_base" },
    ],
    // a porta carimba versao = vigente+1; conferir só o nome passaria com a versão VELHA.
  },
  suporte_ticket_aberto: {
    tabela: "v_suporte_ticket",
    por: "filtros",
    coluna: "id",
    filtros: [{ campo: "id", op: "igualEvento" }],
    // ARB-26: `id = evento.id` (0070). Foi aqui que o portão de escrita real reprovou.
  },
  suporte_ticket_comentado: {
    tabela: "suporte_ticket_comentario",
    por: "filtros",
    coluna: "id",
    filtros: [{ campo: "id", op: "igualEvento" }],
    // o comentário nasce com id = evento.id; a tabela não tem coluna de posição.
  },
  suporte_ticket_resolvido: {
    tabela: "v_suporte_ticket",
    por: "filtros",
    coluna: "status",
    filtros: [
      { campo: "id", op: "igualPayload", dePayload: "ticket_id" },
      { campo: "status", op: "igual", valor: "resolvido" },
    ],
    // aqui o ticket_id é legítimo: ele APONTA para um ticket que já existe, não cria identidade.
  },
};

export const EXCECOES: Readonly<Record<string, ExcecaoConferencia>> = {
  aceite_contato_registrado: {
    motivo:
      "Ledger-only POR DESENHO (CONTRATO-C §5.5, e o banco concorda: porta.projetor_registro traz o tipo com sem_projetor=true). core.contraparte_conhecida() consulta o evento direto, pelo critério de anterioridade que separa aceite verdadeiro de aceite fabricado pela própria ingestão. Projetar criaria uma segunda verdade sobre quem consentiu.",
    conferirLedger: true,
  },
  levindo_acionado: {
    motivo:
      "tipo deliberadamente SEM projetor: o acionamento vive só no ledger, para o runtime consumir. Ausência de projeção aqui é o desenho, não um ramo perdido.",
    conferirLedger: true,
  },
};

/** true = a ação tem conferência de projeção; false = é exceção declarada ou tipo não mapeado. */
export function temConferencia(acao: string): boolean {
  return Object.prototype.hasOwnProperty.call(CONFERENCIA, acao);
}

/** A exceção declarada da ação, se houver. */
export function excecaoDe(acao: string): ExcecaoConferencia | null {
  return Object.prototype.hasOwnProperty.call(EXCECOES, acao) ? EXCECOES[acao] : null;
}

/**
 * Toda ação de escrita da UI está DECLARADA: ou tem conferência, ou tem exceção com motivo.
 * O portão do F6 usa isto para provar que nada passou por esquecimento.
 */
export function acoesDeclaradas(): string[] {
  return [...Object.keys(CONFERENCIA), ...Object.keys(EXCECOES)].sort();
}

/** Resultado da escrita: sucesso comum, sucesso idempotente, ou falha com motivo. */
export interface ResultadoEscrita {
  ok: boolean;
  motivo?: string;
  /** true = a porta absorveu por idempotência; a projeção vigente é a do evento original. */
  duplicado?: boolean;
}

/*
 * ── A leitura de conferência ───────────────────────────────────────────────────────────────────
 * Único ponto com I/O do módulo. Tudo acima é puro e testado sem banco. O import do cliente é
 * `import type` — apagado na compilação, então `tests/*.test.ts` importa este arquivo sem arrastar
 * `next/headers` junto.
 *
 * Contrato com o Agent 2 (Trilha D §0.3): esta função é genérica por desenho. Para adotar em
 * `configuracoes/templates`, acrescente a linha da ação em CONFERENCIA e chame daqui — a de
 * template já está mapeada no projetor (`core.template_mensagem.ultima_posicao`); acrescente-a
 * quando for adotar, para não declarar cobertura que ninguém exerce.
 */
import type { criarClienteServidor } from "@/lib/supabase/server";

type LeitorProjecao = ReturnType<typeof criarClienteServidor>;

/**
 * Confere que a projeção correspondente ao evento EXISTE. Leitura única e determinística — a
 * projeção é síncrona na porta; não há laço de espera.
 *
 * Três desfechos que NÃO são falha e precisam ficar separados de "não projetou":
 *   · `duplicado: true`  → idempotência funcionando; não há posição nova para conferir.
 *   · contrato antigo    → resposta sem `posicao_global`; não inventar falha onde não há chave.
 *   · exceção declarada  → ação sem projeção na mesma transação (o motivo está escrito acima).
 */
export async function confirmarProjecao(
  supabase: LeitorProjecao,
  acao: string,
  payload: Record<string, unknown>,
  resposta: RespostaRegistrarEvento | null,
): Promise<ResultadoEscrita> {
  const excecao = excecaoDe(acao);
  if (excecao) {
    // Não dá para conferir a projeção — então confere o que dá: o evento existe no ledger.
    if (!excecao.conferirLedger || !resposta?.evento_id) return { ok: true };
    const { data, error } = await supabase
      .schema("core")
      .from("evento")
      .select("id")
      .eq("id", resposta.evento_id)
      .limit(1);
    if (error) return { ok: false, motivo: motivoFalhaVerificacao(error.message) };
    if ((data ?? []).length === 0) return { ok: false, motivo: MOTIVO_NAO_PROJETADO };
    return { ok: true };
  }

  if (!temConferencia(acao)) return { ok: true }; // tipo fora do mapa: não inventar veredito
  const regra = CONFERENCIA[acao];

  if (regra.por === "estado") {
    // O projetor é guardado por estado (ex.: mencao_lida só marca a PRIMEIRA leitura), então a
    // posição não é a chave — o estado é. Repetir a ação continua sendo sucesso.
    const alvo = payload[regra.campoPayload];
    if (typeof alvo !== "string" || !alvo) return { ok: true };
    const { data, error } = await supabase
      .schema("core")
      .from(regra.tabela)
      .select(regra.naoNulo)
      .eq(regra.chave, alvo)
      .not(regra.naoNulo, "is", null)
      .limit(1);
    if (error) return { ok: false, motivo: motivoFalhaVerificacao(error.message) };
    return avaliarProjecao((data ?? []).length > 0);
  }

  if (regra.por === "filtros") {
    // Releitura por EFEITO ESPERADO. Duplicado já saiu acima como sucesso idempotente; aqui o que
    // pode faltar é dado no payload — e nesse caso a conferência FALHA em vez de conferir menos:
    // um filtro que some transforma "esta linha" em "qualquer linha".
    const filtros = resolverFiltros(regra.filtros, payload, resposta?.evento_id ?? null);
    if (!filtros) {
      return { ok: false, motivo: motivoFalhaVerificacao("faltou dado para montar a releitura da projeção") };
    }
    let consulta = supabase.schema("core").from(regra.tabela).select(regra.coluna);
    for (const f of filtros) {
      consulta = f.tipo === "naoNulo" ? consulta.not(f.campo, "is", null) : consulta.eq(f.campo, f.valor);
    }
    const { data, error } = await consulta.limit(1);
    if (error) return { ok: false, motivo: motivoFalhaVerificacao(error.message) };
    return avaliarProjecao((data ?? []).length > 0);
  }

  if (regra.por === "evento") {
    // Projeção sem coluna de posição (core.anotacao): a linha nasce com id = id do evento.
    if (resposta?.duplicado || !resposta?.evento_id) return { ok: true };
    const { data, error } = await supabase
      .schema("core")
      .from(regra.tabela)
      .select(regra.coluna)
      .eq(regra.coluna, resposta.evento_id)
      .limit(1);
    if (error) return { ok: false, motivo: motivoFalhaVerificacao(error.message) };
    return avaliarProjecao((data ?? []).length > 0);
  }

  const posicao = posicaoParaConferir(resposta);
  if (posicao === null) return { ok: true }; // duplicado ou contrato antigo
  const { data, error } = await supabase
    .schema("core")
    .from(regra.tabela)
    .select(regra.coluna)
    .eq(regra.coluna, posicao)
    .limit(1);
  if (error) return { ok: false, motivo: motivoFalhaVerificacao(error.message) };
  return avaliarProjecao((data ?? []).length > 0);
}
