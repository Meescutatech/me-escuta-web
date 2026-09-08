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
 * Ação que ninguém declarou. Fala com o operador primeiro (a escrita ACONTECEU, não repita) e
 * nomeia a ação para quem for consertar.
 */
export function motivoAcaoNaoDeclarada(acao: string): string {
  return `a escrita foi aceita, mas o sistema não sabe conferir "${acao}" — não repita; avise quem cuida do sistema (falta declarar a conferência desta ação)`;
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

/** Como confirmar: pela posição carimbada, pelo id do evento, por um estado, ou por efeito. */
export type ConferenciaProjecao =
  | { tabela: string; por: "posicao"; coluna: string }
  | { tabela: string; por: "evento"; coluna: string }
  | { tabela: string; por: "estado"; chave: string; campoPayload: string; naoNulo: string }
  /**
   * `filtros` (R16-20, Web-B — enxertado aqui pelo ARB-28-bis): a releitura precisa de MAIS DE UMA
   * condição. As views das telas B (`v_canal_whatsapp`, `v_suporte_ticket`, `v_config_vigente`) não
   * expõem `ultima_posicao`, então a conferência é pelo EFEITO ESPERADO — e efeito quase nunca cabe
   * num par chave/valor: "o canal X está LIGADO", "a config Y subiu para base+1", "o ticket Z está
   * RESOLVIDO".
   *
   * Espremer isso nos três modos acima teria enfraquecido a conferência EM SILÊNCIO (passaria a
   * conferir só que a linha existe — linha que já existia ANTES da ação), que é exatamente como um
   * readback vira decoração.
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
  /*
   * R27/F8 · quadro por status (0305). `proj_tarefa_andamento` carimba `ultima_posicao` com a
   * `posicao_global` do evento nos dois tipos — a posição prova que ESTE evento projetou, igual às
   * outras linhas de tarefa. "Em andamento" é carimbo (`iniciada_em`), nunca um 4º status.
   */
  tarefa_iniciada: { tabela: "tarefa", por: "posicao", coluna: "ultima_posicao" },
  tarefa_reaberta: { tabela: "tarefa", por: "posicao", coluna: "ultima_posicao" },

  mencao_criada: { tabela: "mencao", por: "posicao", coluna: "ultima_posicao" },
  mencao_promovida_tarefa: { tabela: "mencao", por: "posicao", coluna: "ultima_posicao" },
  mencao_lida: {
    tabela: "mencao",
    por: "estado",
    chave: "id",
    campoPayload: "mencao_id",
    naoNulo: "lida_em",
  },
  /*
   * R27/F8 · leitura de notificação de TAREFA (0306). Guardado por ESTADO como `mencao_lida`:
   * `proj_notificacao_lida` faz `on conflict do nothing` (primeira leitura manda), então remarcar
   * é no-op correto e a chave é a linha existir com `lida_em`. A RLS da tabela corta por
   * `usuario_id = auth.uid()`, e o ator do evento é quem lê — a leitura confere a própria linha.
   */
  notificacao_lida: {
    tabela: "notificacao_lida",
    por: "estado",
    chave: "chave",
    campoPayload: "chave",
    naoNulo: "lida_em",
  },

  /*
   * M3 (R18) — o de-para de identidade externa. Declarado na INTEGRAÇÃO `r18/integracao-web`, não na
   * trilha: a M3 saiu de uma linhagem que divergiu ANTES de produção, então ela nunca viu este
   * arquivo nem o portão do Web-B que exige o ponto único de escrita. O merge é que os apresentou.
   *
   * Modo `posicao` e não `filtros`: `core.identidade_externa` TEM `ultima_posicao` (0097), e o
   * projetor a carimba com a `posicao_global` do evento. Conferir por ela prova que ESTE evento
   * projetou. Conferir pela chave (sistema, entidade, id_externo) provaria só que a linha existe —
   * e ela existe ANTES da ação em todo revínculo, que é o caso mais comum desta tela.
   */
  identidade_externa_vinculada: {
    tabela: "identidade_externa",
    por: "posicao",
    coluna: "ultima_posicao",
  },

  /*
   * R27/F1 · envio programado (0290). `proj_envio_programado` insere `core.envio_programado` com
   * `id = e.id` na mesma transação — conferir pelo evento prova que a linha nasceu. O cancelamento
   * é guardado por ESTADO (`status='agendado'`): a chave é `cancelado_em not null`, como `mencao_lida`.
   */
  envio_programado: { tabela: "envio_programado", por: "evento", coluna: "id" },
  envio_programado_cancelado: {
    tabela: "envio_programado",
    por: "estado",
    chave: "id",
    campoPayload: "envio_programado_id",
    naoNulo: "cancelado_em",
  },

  lead_atualizado: { tabela: "lead_campo", por: "posicao", coluna: "ultima_posicao" },
  etapa_alterada: { tabela: "estado_lead", por: "posicao", coluna: "ultima_posicao" },
  dono_atribuido: { tabela: "lead", por: "posicao", coluna: "ultima_posicao" },

  /*
   * R20 · lead criado à mão. Modo `posicao` sobre `core.lead`, no molde do `dono_atribuido`:
   * `proj_lead` carimba `ultima_posicao` com a `posicao_global` do evento nos DOIS inserts
   * (`core.lead` e `core.estado_lead`), então a posição prova que ESTE evento projetou.
   *
   * Conferir por `lead_id` existir seria fraco de um jeito específico desta tela: o lead_id é
   * gerado pelo cliente, então "a linha existe" também é verdade num retry que caiu no dedupe —
   * e aí a tela diria "criei" para a segunda chamada, que não criou nada. O caminho do duplicado
   * já sai antes daqui como sucesso idempotente, com a flag.
   */
  lead_criado: { tabela: "lead", por: "posicao", coluna: "ultima_posicao" },

  conversa_assumida: { tabela: "conversa", por: "posicao", coluna: "posse_posicao" },
  conversa_devolvida: { tabela: "conversa", por: "posicao", coluna: "posse_posicao" },

  // A bolha nasce aqui, em "na_fila", na mesma transação. Sair de fato é outro evento, do sender.
  enviar_mensagem_humana: { tabela: "mensagem", por: "evento", coluna: "id" },

  /*
   * ── TELAS B (R16-20 · Web-B) ────────────────────────────────────────────────────────────────
   * Enxertadas aqui pelo ARB-28-bis: o arquivo é meu (Agent 1), o fail-closed é a base, e o modo
   * `filtros` + estas dez linhas vêm de web-b @ dde4d3c. Não há choque lógico — com as linhas NA
   * tabela elas são ações CONHECIDAS, e o fail-closed só atinge ação genuinamente fora dela.
   *
   * A regra desta casa é que a linha migra JUNTO do caso que a exercita com ESCRITA REAL (E-020).
   * O caso é `supabase/verificacao/web-b-escrita-real.sql`, verde no stack db-r16-c em 27/07:
   * 4 vacuidades · 10 recusas · 18 medidas · baseline idêntico por chave.
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
  /*
   * D70 · o nivel do canal, conferido pelo EFEITO — o `nivel` na view TEM de ser o que a acao
   * pediu. Conferir so a existencia da linha seria vacuo do pior tipo aqui: a linha do canal ja
   * existia antes da troca, entao "existe" e verdade mesmo quando nada mudou, e a tela diria
   * "salvo" para uma troca que nao aconteceu.
   *
   * ⚠️ CORRIGIDO 08/09/2026 — aqui estava escrito que numa base sem a coluna "o evento entra no
   * ledger, mas o nivel nao passa a valer" e que esta releitura reprovaria a acao. As duas frases
   * eram FALSAS, e a segunda descrevia um caminho que nao roda. O que a producao faz, medido:
   *
   *   · `porta.projetor_registro` NAO tem a linha `canal_nivel_alterado` (7 tipos `canal_*` la
   *     dentro, e este nao e um deles — `select tipo from porta.projetor_registro where tipo like
   *     'canal%'`);
   *   · `porta.aplicar_projetores` termina com `if not v_achou then raise ... errcode='PMEE1'`;
   *   · `porta.inserir_evento` faz `perform porta.aplicar_projetores(v_id)` DEPOIS do insert
   *     (posicoes 14717 e 20152 do corpo vivo) e NAO tem um unico `exception when`.
   *
   * Logo o PMEE1 aborta a transacao inteira: o evento **nao entra** no ledger, esta releitura
   * **nunca roda**, e o que a gestora ve e o texto cru do PMEE1. O desfecho e mais seguro do que
   * o que estava descrito — nao ha escrita orfa —, mas a descricao mentia em tres pontos.
   *
   * O que continua verdade e a razao desta linha existir: quando o tipo ESTIVER registrado e a
   * view expuser `nivel`, conferir so a existencia da linha seria vacuo do pior tipo, porque a
   * linha do canal ja existia antes da troca. Enquanto o banco nao entrar, o unico exercicio
   * desta regra e o teste — ver `tests/confirmar-projecao.test.ts`, secao D70.
   */
  canal_nivel_alterado: {
    tabela: "v_canal_whatsapp",
    por: "filtros",
    coluna: "nivel",
    filtros: [
      { campo: "canal_id", op: "igualPayload", dePayload: "canal_id" },
      { campo: "nivel", op: "igualPayload", dePayload: "nivel" },
    ],
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

  // FAIL-CLOSED (achado do Agent 2, R16-23). Aqui devolvia `{ok:true}` com o argumento de "não
  // inventar veredito para tipo que não conheço" — e isso é exatamente o defeito que o F6 existe
  // para tirar, reintroduzido pela porta dos fundos: ação fora do mapa declarava sucesso SEM
  // conferir nada. Pior, valia justamente para os tipos que ESTREIAM (canal_*, config_publicada,
  // suporte_*), que são os que mais precisam da rede. A prova estática do portão não pegava:
  // ela só varre os arquivos desta trilha, e quem estreia tipo novo é outra trilha.
  //
  // Agora ação desconhecida REPROVA, com o nome dela no motivo. O custo é o certo: quem acrescenta
  // uma escrita nova é obrigado a declarar como ela se confere — ou a declarar a exceção com o
  // motivo, que é a regra que a spec já pedia ("ausência de conferência NUNCA por esquecimento").
  if (!temConferencia(acao)) return { ok: false, motivo: motivoAcaoNaoDeclarada(acao) };
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
    // Releitura por EFEITO ESPERADO (ARB-28-bis). Duplicado já saiu acima como sucesso idempotente;
    // aqui o que pode faltar é dado no payload — e nesse caso a conferência FALHA em vez de conferir
    // menos: um filtro que some transforma "esta linha" em "qualquer linha".
    const filtros = resolverFiltros(regra.filtros, payload, resposta?.evento_id ?? null);
    if (!filtros) {
      return {
        ok: false,
        motivo: motivoFalhaVerificacao("faltou dado para montar a releitura da projeção"),
      };
    }
    let consulta = supabase.schema("core").from(regra.tabela).select(regra.coluna);
    for (const f of filtros) {
      consulta =
        f.tipo === "naoNulo" ? consulta.not(f.campo, "is", null) : consulta.eq(f.campo, f.valor);
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
