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
 * ── A tabela ação → conferência dos TIPOS NOVOS ────────────────────────────────────────────────
 *
 * POR QUE ELA EXISTE EM VEZ DE LINHAS NA TABELA DO F6, hoje: a regra do Orquestrador é que a linha
 * só entra lá JUNTO de um caso de portão que a exercite com ESCRITA REAL (E-020: cobertura
 * declarada sem exercício). As migrations 0069/0075/0081/0082 não existem ainda — não há banco
 * contra o qual escrever de verdade. Então as 10 linhas ficam aqui, declaradas e testadas puras,
 * e migram para `CONFERENCIA` do F6 na fase 2, no mesmo commit do portão de escrita real.
 * O vocabulário é o DELES de propósito: a migração é mover linhas, não reescrever.
 *
 * A DIFERENÇA DELIBERADA, e ela é uma correção: `confirmarProjecao` devolve `{ok:true}` para tipo
 * que não está na tabela (`if (!temConferencia(acao)) return { ok: true }`). Para os 20 caminhos
 * antigos isso é prudente — não inventar veredito sobre o que ninguém mapeou. Para os tipos DESTA
 * NOITE é o defeito exato que o readback existe para pegar: eles são novos, o ramo no dispatcher é
 * novo, e "tipo sem ramo passa calado" é o modo de falha nº 1 do projeto. Aqui, tipo sem
 * conferência declarada é FALHA, não sucesso. Fail-closed.
 */

export type FiltroConferencia =
  | { campo: string; op: "igualPayload"; dePayload: string }
  | { campo: string; op: "igualPayloadMais1"; dePayload: string }
  | { campo: string; op: "igualEvento" }
  | { campo: string; op: "igual"; valor: string | number | boolean }
  | { campo: string; op: "naoNulo" };

export interface RegraConferenciaWebB {
  /** view ou tabela em `core` a reler. */
  fonte: string;
  /** coluna barata para o select. */
  coluna: string;
  filtros: FiltroConferencia[];
  /** por que ESTA é a chave certa. Errar uma linha reprova toda escrita bem-sucedida. */
  porque: string;
}

/** Ausência de projeção DECLARADA, com motivo — mesmo formato do F6. */
export interface ExcecaoConferenciaWebB {
  motivo: string;
  conferirLedger: boolean;
}

/**
 * NOTA DE CONTRATO que decide a forma de todas as linhas: as views da Web-B
 * (`core.v_canal_whatsapp`, `core.v_suporte_ticket`, `core.v_config_vigente`) NÃO expõem
 * `ultima_posicao`. Então a conferência é POR ESTADO ESPERADO — o canal existe, o canal está
 * ligado, a versão subiu — e não por posição carimbada. É mais forte como promessa ao usuário
 * (confere o efeito, não o carimbo) e mais fraca contra leitura atrasada, o que não acontece aqui
 * porque a projeção é síncrona na mesma transação. Pedido de `ultima_posicao` nas views registrado
 * no adendo ao Agent 3.
 */
export const CONFERENCIA_WEB_B: Readonly<Record<string, RegraConferenciaWebB>> = {
  canal_registrado: {
    fonte: "v_canal_whatsapp",
    coluna: "canal_id",
    filtros: [{ campo: "canal_id", op: "igualPayload", dePayload: "canal_id" }],
    porque: "o efeito de registrar é a linha existir. `canal_registrado` nasce ativo=false, então ativo não serve de prova.",
  },
  canal_atualizado: {
    fonte: "v_canal_whatsapp",
    coluna: "nome",
    filtros: [
      { campo: "canal_id", op: "igualPayload", dePayload: "canal_id" },
      { campo: "nome", op: "igualPayload", dePayload: "nome" },
    ],
    porque: "patch parcial: confere o campo que a tela mandou. Só existir a linha provaria nada — ela já existia antes.",
  },
  canal_ativado: {
    fonte: "v_canal_whatsapp",
    coluna: "ativo",
    filtros: [
      { campo: "canal_id", op: "igualPayload", dePayload: "canal_id" },
      { campo: "ativo", op: "igual", valor: true },
    ],
    porque: "o efeito É o estado. Ligar e a linha continuar ativo=false é exatamente o que o readback tem de pegar.",
  },
  canal_desativado: {
    fonte: "v_canal_whatsapp",
    coluna: "ativo",
    filtros: [
      { campo: "canal_id", op: "igualPayload", dePayload: "canal_id" },
      { campo: "ativo", op: "igual", valor: false },
    ],
    porque: "idem, ao contrário — e este é o caminho que mata mensagem em voo, então mentir aqui custa caro.",
  },
  canal_consentimento_registrado: {
    fonte: "v_canal_whatsapp",
    coluna: "consentimento_em",
    filtros: [
      { campo: "canal_id", op: "igualPayload", dePayload: "canal_id" },
      { campo: "consentimento_em", op: "naoNulo" },
    ],
    porque: "consentimento é o portão da sessão: 'registrado' sem a coluna preenchida deixaria a tela liberar o pareamento sem base.",
  },
  config_publicada: {
    fonte: "v_config_vigente",
    coluna: "versao",
    filtros: [
      { campo: "nome", op: "igualPayload", dePayload: "nome" },
      { campo: "versao", op: "igualPayloadMais1", dePayload: "versao_base" },
    ],
    porque:
      "a porta carimba versao = vigente+1 e a tela mandou versao_base. Conferir a VERSÃO RESULTANTE prova a publicação; conferir só o nome passaria com a versão velha.",
  },
  suporte_ticket_aberto: {
    fonte: "v_suporte_ticket",
    coluna: "id",
    filtros: [{ campo: "id", op: "igualEvento" }],
    porque:
      "ARB-26: a identidade do ticket NASCE DO EVENTO (0070 crava id = evento.id e nunca lê payload.ticket_id na abertura). " +
      "A minha regra conferia por um ticket_id que eu mesmo gerava — e que o banco ignorava —, então a releitura devolvia ZERO " +
      "para toda abertura BEM-SUCEDIDA. É a Constituição §1.1 aplicada a um id: quem manda id de fora está inventando identidade.",
  },
  suporte_ticket_comentado: {
    fonte: "suporte_ticket_comentario",
    coluna: "id",
    filtros: [{ campo: "id", op: "igualEvento" }],
    porque: "o comentário nasce com id = evento.id (CONTRATO-C §6.1). Não há coluna de posição nessa tabela.",
  },
  suporte_ticket_resolvido: {
    fonte: "v_suporte_ticket",
    coluna: "status",
    filtros: [
      { campo: "id", op: "igualPayload", dePayload: "ticket_id" },
      { campo: "status", op: "igual", valor: "resolvido" },
    ],
    porque: "o efeito é a transição de estado; a linha já existia.",
  },
};

export const EXCECOES_WEB_B: Readonly<Record<string, ExcecaoConferenciaWebB>> = {
  aceite_contato_registrado: {
    motivo:
      "ledger-only POR DESENHO (CONTRATO-C §5.5): não tem projeção, e `core.contraparte_conhecida()` consulta o evento direto. Ausência de projeção aqui é o desenho, não ramo perdido.",
    conferirLedger: true,
  },
};

/** Os tipos que ESTA trilha escreve. O portão prova que nenhum outro aparece nas actions. */
export const TIPOS_ESCRITOS_WEB_B: string[] = [
  ...Object.keys(CONFERENCIA_WEB_B),
  ...Object.keys(EXCECOES_WEB_B),
].sort();

export function regraWebB(tipo: string): RegraConferenciaWebB | null {
  return Object.prototype.hasOwnProperty.call(CONFERENCIA_WEB_B, tipo) ? CONFERENCIA_WEB_B[tipo] : null;
}

export function excecaoWebB(tipo: string): ExcecaoConferenciaWebB | null {
  return Object.prototype.hasOwnProperty.call(EXCECOES_WEB_B, tipo) ? EXCECOES_WEB_B[tipo] : null;
}

export function tipoDeclarado(tipo: string): boolean {
  return regraWebB(tipo) !== null || excecaoWebB(tipo) !== null;
}

export function motivoTipoSemConferencia(tipo: string): string {
  return (
    `escrita recusada: o tipo "${tipo}" não tem conferência de projeção declarada. ` +
    "Tipo novo sem ramo no dispatcher entra no ledger e não projeta — a tela diria 'salvo' para sempre. " +
    "Declare a conferência (ou a exceção, com motivo) antes de escrever."
  );
}

/** Valor concreto de um filtro. Puro: é o que o teste consegue exercer sem banco. */
export type FiltroResolvido =
  | { campo: string; tipo: "igual"; valor: string | number | boolean }
  | { campo: string; tipo: "naoNulo" };

export function resolverFiltro(
  filtro: FiltroConferencia,
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
 * Resolve todos os filtros. `null` = algum filtro não tem valor — e isso NÃO vira "confere sem
 * ele": um filtro que some transforma "esta linha" em "qualquer linha", e a conferência passaria
 * a aprovar a escrita de outra pessoa.
 */
export function resolverFiltros(
  regra: RegraConferenciaWebB,
  payload: Record<string, unknown>,
  eventoId: string | null,
): FiltroResolvido[] | null {
  const resolvidos: FiltroResolvido[] = [];
  for (const f of regra.filtros) {
    const r = resolverFiltro(f, payload, eventoId);
    if (!r) return null;
    resolvidos.push(r);
  }
  return resolvidos;
}
