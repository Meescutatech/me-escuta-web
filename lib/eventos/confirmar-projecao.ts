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
export type ConferenciaProjecao =
  | { tabela: string; por: "posicao"; coluna: string }
  | { tabela: string; por: "evento"; coluna: string }
  | { tabela: string; por: "estado"; chave: string; campoPayload: string; naoNulo: string };

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
};

export const EXCECOES: Readonly<Record<string, ExcecaoConferencia>> = {
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
