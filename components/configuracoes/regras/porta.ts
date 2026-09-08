/**
 * O LIMITE DE ESCRITA das telas B (F9 canais · F11 sessão lite · F12 suporte · F14 config) —
 * parte PURA. Sem I/O, sem React: tudo aqui é provável com `node --test`.
 *
 * O READBACK em si é do Agent 1 (`lib/eventos/confirmar-projecao.ts`, F6) — não reescrevo, uso.
 * O que mora AQUI é o que aquele módulo não tem e as telas B precisam:
 *
 *  1. CLASSIFICAÇÃO DO ERRO DA PORTA por errcode (ARB-21). O texto da recusa continua sendo o do
 *     banco, cru; o que muda por errcode é o que a tela FAZ depois.
 *  2. GUARDA ANTISSEGREDO no payload — espelho da guarda da porta, para o erro virar teste
 *     vermelho aqui em vez de 400 em produção lá.
 *  3. A TABELA AÇÃO → CONFERÊNCIA DOS TIPOS NOVOS, no mesmo vocabulário da tabela do F6, com uma
 *     diferença deliberada: aqui é FAIL-CLOSED. Ver o bloco da tabela.
 */

// ───────────────────────────── classificação do erro da porta ─────────────────────────────

export interface VereditoEscrita {
  ok: boolean;
  motivo?: string;
}

/**
 * O que a TELA faz depois:
 *  - `conflito_versao`   → recarregar e refazer (F14: duas gestoras publicando)
 *  - `descarte_esperado` → PMEE3: o filtro da borda barrou. NÃO é falha, não retentar
 *  - `sem_bloco_conversa`→ PMEE2: evento de mensagem sem o bloco `conversa` (F8)
 *  - `permissao`         → papel insuficiente: degradar a tela para leitura
 *  - `recusa`            → a porta recusou o conteúdo com motivo legível: manter o form aberto
 *  - `indisponivel`      → o objeto do banco ainda não existe neste ambiente (migration não subiu)
 *  - `outro`             → o resto
 */
export type ClasseErroPorta =
  | "conflito_versao"
  | "descarte_esperado"
  | "sem_bloco_conversa"
  | "permissao"
  | "recusa"
  | "indisponivel"
  | "outro";

/**
 * ARMADILHA MEDIDA, e é o motivo desta função existir: `raise exception ... using errcode =
 * 'serialization_failure'` chega ao PostgREST como SQLSTATE **"40001"**, não como a palavra. Quem
 * comparar com a string do plpgsql nunca casa, e o conflito de versão — que o CONTRATO-C §7.3
 * protegeu com três camadas — vira "erro genérico" na tela. Aceito as duas formas, sempre.
 */
const POR_SQLSTATE: Record<string, ClasseErroPorta> = {
  "40001": "conflito_versao", // serialization_failure
  "42501": "permissao", // insufficient_privilege
  "23514": "recusa", // check_violation
  "22023": "recusa", // invalid_parameter_value
  "23505": "recusa", // unique_violation
  "23503": "recusa", // foreign_key_violation
  PMEE3: "descarte_esperado", // contraparte desconhecida em canal não oficial
  PMEE2: "sem_bloco_conversa",
  /*
   * D70 · PMEE1 = `porta.aplicar_projetores` não achou o tipo em `porta.projetor_registro`, e por
   * isso ABORTOU a transação inteira (o `perform` acontece depois do insert, na mesma transação,
   * e `porta.inserir_evento` não tem `exception when` nenhum — medido no corpo vivo em 08/09).
   *
   * É `indisponivel` pela definição desta lista: o objeto do banco ainda não existe neste
   * ambiente. `canal_nivel_definido` está exatamente nesse estado em produção hoje — a migration
   * que registra o tipo não subiu —, e sem esta linha a recusa chegaria como "outro", que é a
   * classe do erro que ninguém sabe explicar.
   */
  PMEE1: "indisponivel",
  "42883": "indisponivel", // undefined_function
  "42P01": "indisponivel", // undefined_table
  "42703": "indisponivel", // undefined_column
  PGRST202: "indisponivel", // função não encontrada no schema cache
  PGRST205: "indisponivel", // tabela/view não encontrada no schema cache
};

const POR_NOME: Record<string, ClasseErroPorta> = {
  serialization_failure: "conflito_versao",
  insufficient_privilege: "permissao",
  check_violation: "recusa",
  invalid_parameter_value: "recusa",
  unique_violation: "recusa",
  foreign_key_violation: "recusa",
  undefined_function: "indisponivel",
  undefined_table: "indisponivel",
  undefined_column: "indisponivel",
};

export function classificarErroPorta(codigo: string | null | undefined): ClasseErroPorta {
  const c = (codigo ?? "").trim();
  if (!c) return "outro";
  return POR_SQLSTATE[c] ?? POR_SQLSTATE[c.toUpperCase()] ?? POR_NOME[c.toLowerCase()] ?? "outro";
}

/** true quando a tela deve mandar recarregar antes de tentar de novo. */
export function exigeRecarregar(classe: ClasseErroPorta): boolean {
  return classe === "conflito_versao";
}

// ───────────────────────────── envelope + guarda antissegredo ─────────────────────────────

export interface EnvelopeEvento {
  tipo: string;
  id_externo: string;
  versao_payload: 1;
  payload: Record<string, unknown>;
}

/**
 * `ator` e `origem` NÃO são enviados — a porta os sobrescreve do JWT (0066:331-333). Mandá-los
 * daqui seria teatro. O nome do parâmetro do RPC é `p`, exatamente.
 */
export function montarEnvelope(
  tipo: string,
  idExterno: string,
  payload: Record<string, unknown>,
): EnvelopeEvento {
  return { tipo, id_externo: idExterno, versao_payload: 1, payload };
}

/**
 * ESPELHO da guarda antissegredo da porta (CONTRATO-C §4.3): o banco recusa evento `canal_*` cujo
 * payload tenha chave com cara de segredo, porque o ledger é append-only e segredo gravado nele
 * não sai mais. Espelho AQUI pelo mesmo motivo do `contrato-followup`: recusa que só existe no
 * banco chega ao operador como erro de sistema, e payload montado errado vira 400 em produção em
 * vez de teste vermelho.
 *
 * A regex é a do banco. A porta olha só as chaves de PRIMEIRO NÍVEL (`jsonb_object_keys`); eu olho
 * todos os níveis — mais estrito de propósito: não existe payload meu que precise de uma chave
 * dessas em nível nenhum.
 */
export const CHAVE_SUSPEITA = /token|secret|senha|password|api[_-]?key|qr/i;

export function chavesSuspeitas(valor: unknown, prefixo = ""): string[] {
  if (!valor || typeof valor !== "object") return [];
  if (Array.isArray(valor)) {
    return valor.flatMap((v, i) => chavesSuspeitas(v, `${prefixo}[${i}]`));
  }
  const achados: string[] = [];
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    const caminho = prefixo ? `${prefixo}.${k}` : k;
    if (CHAVE_SUSPEITA.test(k)) achados.push(caminho);
    achados.push(...chavesSuspeitas(v, caminho));
  }
  return achados;
}

export const MOTIVO_PAYLOAD_COM_SEGREDO =
  "o payload do evento tem chave com cara de segredo e não pode ir para o ledger (append-only: segredo gravado lá não sai mais). Token de canal vive no ambiente, nunca no banco";

export function payloadSeguro(payload: Record<string, unknown>): VereditoEscrita {
  const achados = chavesSuspeitas(payload);
  if (achados.length === 0) return { ok: true };
  return { ok: false, motivo: `${MOTIVO_PAYLOAD_COM_SEGREDO} (chave: ${achados.join(", ")})` };
}

/*
 * ── A tabela ação → conferência ────────────────────────────────────────────────────────────────
 *
 * ELA NÃO MORA MAIS AQUI. As dez linhas migraram para `CONFERENCIA`/`EXCECOES` do F6
 * (`lib/eventos/confirmar-projecao.ts`) em 27/07, junto do caso que as exercita com ESCRITA REAL —
 * `supabase/verificacao/web-b-escrita-real.sql`, verde no db-r16-c. Era a condição do E-020:
 * cobertura declarada sem exercício é cobertura que ninguém viu funcionar.
 *
 * Ficam aqui só a lista dos tipos que ESTA trilha escreve — derivada da tabela do F6, para não
 * existirem duas verdades — e o motivo do fail-closed, que continua sendo do meu limite de escrita.
 */

// caminho RELATIVO com extensão, não o alias `@/`: este módulo é carregado por `node --test`, que
// não resolve o alias do tsconfig. O alias fica nos módulos que só o Next carrega.
import { CONFERENCIA, EXCECOES } from "../../../lib/eventos/confirmar-projecao.ts";

/** Os tipos que a Web-B escreve. O portão `tipos_declarados` reprova literal fora desta lista. */
export const TIPOS_ESCRITOS_WEB_B: string[] = [
  "canal_registrado",
  "canal_atualizado",
  "canal_ativado",
  "canal_desativado",
  "canal_consentimento_registrado",
  // D70 · o nivel do canal. Estreia com a linha em CONFERENCIA (conferencia por EFEITO: o `nivel`
  // resultante na view), nao com excecao — o efeito e legivel, entao nao ha o que declarar como
  // inconferivel. Foi o portao `tipos_declarados` que exigiu esta linha aqui: sem ela, o literal
  // "canal_nivel_definido" na action reprova estaticamente antes de chegar a producao.
  "canal_nivel_definido",
  "config_publicada",
  "suporte_ticket_aberto",
  "suporte_ticket_comentado",
  "suporte_ticket_resolvido",
  "aceite_contato_registrado",
].sort();

/**
 * Todo tipo desta trilha tem conferência OU exceção declarada na tabela do F6. Se alguém acrescentar
 * um tipo à lista acima sem a linha lá, isto devolve false e o limite de escrita RECUSA antes de
 * gravar — recusar depois de gravar num ledger append-only seria tarde.
 */
export function tipoDeclarado(tipo: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(CONFERENCIA, tipo) ||
    Object.prototype.hasOwnProperty.call(EXCECOES, tipo)
  );
}

export function motivoTipoSemConferencia(tipo: string): string {
  return (
    `escrita recusada: o tipo "${tipo}" não tem conferência de projeção declarada. ` +
    "Tipo novo sem ramo no dispatcher entra no ledger e não projeta — a tela diria 'salvo' para sempre. " +
    "Declare a conferência (ou a exceção, com motivo) em lib/eventos/confirmar-projecao.ts antes de escrever."
  );
}
