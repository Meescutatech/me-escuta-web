/**
 * F9 · REGRAS PURAS do registro de números de WhatsApp.
 *
 * Fonte de leitura: `core.v_canal_whatsapp` (ARB-21). Escrita: SÓ por `api.registrar_evento`, com
 * os quatro tipos que os dois lados do contrato nomearam idêntico —
 * `canal_registrado` · `canal_atualizado` · `canal_ativado` · `canal_desativado`.
 *
 * Quatro coisas que o executor não descobre sozinho e que estão codificadas aqui:
 *
 *  1. `phone_number_id` CONTINUA sendo a chave, e o canal não oficial recebe um id LOCAL
 *     `lite:<slug-do-apelido>` — nunca o número. Pôr o telefone pessoal da fono numa chave
 *     primária lida por todo `authenticated` seria expor o número dela no catálogo
 *     (CONTRATO-C §4.4). O número fica em `numero_e164`, atrás da RLS de papel.
 *  2. CADASTRAR NÃO É LIGAR. `canal_registrado` nasce `ativo=false`; ligar é um segundo evento,
 *     com autor, que passa pela guarda de consentimento (CONTRATO-C §4.3).
 *  3. `provedor` NÃO é alterável depois do registro — a porta recusa. Um canal que troca de
 *     provedor troca de regime de filtro, e o histórico já ingerido não é reprocessável.
 *  4. Ativar sem `inbox_desde` DESPEJA O HISTÓRICO INTEIRO NO INBOX (0025:31-34, medido: o canal
 *     de produção está hoje nesse estado). ARB-18.1 fez disso guarda na porta; aqui é campo
 *     obrigatório do formulário, para a recusa não ser a primeira notícia.
 */

import { montarEnvelope, payloadSeguro, type EnvelopeEvento, type VereditoEscrita } from "./porta.ts";

export type Provedor = "waba" | "nao_oficial";
export type Papel = "owner" | "admin" | "membro";

/**
 * Uma linha de `core.v_canal_whatsapp`.
 *
 * `inbox_desde` foi pedido no adendo da fase 1 e a `0069` o ENTREGOU na view. A leitura mantém o
 * caminho de degrade mesmo assim: `null` significa "ausente OU não legível", e os dois exigem o
 * corte na ativação — o dano do falso negativo é uma pergunta a mais; o do falso positivo é o
 * histórico inteiro do número no inbox de todo mundo, e isso não tem desfazer barato.
 */
export interface Canal {
  canal_id: string;
  nome: string;
  provedor: Provedor;
  ativo: boolean;
  numero: string | null;
  waba_id: string | null;
  area_efetiva: string | null;
  pareado_em: string | null;
  consentimento_em: string | null;
  consentimento_titular: string | null;
  consentimento_texto_versao: string | null;
  risco_ban_aceito: boolean;
  desativado_em: string | null;
  criado_em: string | null;
  /** null = ausente OU não legível por esta tela. Os dois casos exigem o corte na ativação. */
  inbox_desde: string | null;
}

export const PROVEDORES: Provedor[] = ["waba", "nao_oficial"];

export function provedorValido(v: unknown): v is Provedor {
  return typeof v === "string" && (PROVEDORES as string[]).includes(v);
}

export function rotuloProvedor(p: Provedor): string {
  return p === "waba" ? "Oficial (WhatsApp Cloud API)" : "Não oficial (biblioteca)";
}

/** Gerir canais é ação de gestão. A defesa real é a guarda da porta; aqui é ergonomia. */
export function podeGerirCanais(papel: Papel | null): boolean {
  return papel === "admin" || papel === "owner";
}

// ───────────────────────────────── id do canal não oficial ─────────────────────────────────

export const PREFIXO_LITE = "lite:";

/** "Sarah Müller" → "sarah-muller". Estável, legível e sem acento — é o que vira chave primária. */
export function slugApelido(nome: string): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function canalIdNaoOficial(nome: string): string {
  return `${PREFIXO_LITE}${slugApelido(nome)}`;
}

export function ehCanalNaoOficialId(id: string): boolean {
  return (id ?? "").startsWith(PREFIXO_LITE);
}

// ───────────────────────────────────── validação do form ─────────────────────────────────────

export interface FormCanal {
  /** só o WABA declara: é o id da Meta. No não oficial o id é derivado do nome. */
  canalId: string;
  nome: string;
  provedor: Provedor;
  numeroE164: string;
  wabaId: string;
  area: string;
}

/** Campo → motivo em PT-BR. Motivo NOMEIA o limite violado, nunca "valor inválido". */
export type Problemas = Partial<Record<keyof FormCanal | "inboxDesde" | "consentimento" | "papel", string>>;

/** E.164: '+' e 8 a 15 dígitos, o primeiro diferente de zero. */
export const E164 = /^\+[1-9]\d{7,14}$/;

export function numeroE164Valido(v: string): boolean {
  return E164.test((v ?? "").trim());
}

export function validarRegistroCanal(f: FormCanal): Problemas {
  const p: Problemas = {};
  const nome = (f.nome ?? "").trim();

  if (nome.length === 0) {
    p.nome = "dê um nome ao canal — é por ele que a operação identifica o número (e, no não oficial, é ele que vira o id `lite:`)";
  } else if (nome.length > 60) {
    p.nome = "o nome passa de 60 caracteres";
  }

  if (!provedorValido(f.provedor)) {
    p.provedor = "escolha oficial (WABA) ou não oficial — o banco só aceita esses dois, e o valor decide se o filtro da borda roda";
  }

  if (f.provedor === "waba") {
    const id = (f.canalId ?? "").trim();
    if (id.length === 0) {
      p.canalId = "o canal oficial precisa do phone_number_id da Meta — é a chave da conversa, não dá para inventar depois";
    } else if (ehCanalNaoOficialId(id)) {
      p.canalId = "id começando por `lite:` é reservado ao canal não oficial";
    }
    if (!numeroE164Valido(f.numeroE164)) {
      p.numeroE164 = "informe o número em E.164 (+55 e DDD, sem espaço) — ex.: +5511999998888";
    }
  } else if (f.provedor === "nao_oficial") {
    // id derivado: o apelido é o nome da fono, e é o que torna `lite:jade` legível no ledger.
    if (nome.length > 0 && slugApelido(nome).length === 0) {
      p.nome = "o nome precisa ter ao menos uma letra ou número — o id do canal (`lite:…`) sai dele";
    }
    // numero_e164 é OPCIONAL aqui: o número é da fono e pode nem ser conhecido no cadastro.
    if ((f.numeroE164 ?? "").trim().length > 0 && !numeroE164Valido(f.numeroE164)) {
      p.numeroE164 = "número em formato inválido — use E.164 (+55…) ou deixe em branco";
    }
    if ((f.wabaId ?? "").trim().length > 0) {
      p.wabaId = "canal não oficial não tem WABA — deixe em branco";
    }
  }

  return p;
}

export function semProblemas(p: Problemas): boolean {
  return Object.keys(p).length === 0;
}

/** O id que o evento vai carregar: declarado (WABA) ou derivado do nome (não oficial). */
export function canalIdDoForm(f: FormCanal): string {
  return f.provedor === "nao_oficial" ? canalIdNaoOficial(f.nome) : (f.canalId ?? "").trim();
}

// ───────────────────────────────────── ativar / desativar ─────────────────────────────────────

export interface PedidoAtivacao {
  canal: Canal;
  /** ISO. Obrigatório quando o canal ainda não tem corte (ou quando não dá para saber). */
  inboxDesde: string;
  papel: Papel | null;
}

export function validarAtivacao(pedido: PedidoAtivacao): Problemas {
  const p: Problemas = {};
  const { canal, papel } = pedido;

  if (!podeGerirCanais(papel)) {
    p.papel = "ligar e desligar canal exige admin ou owner";
  }

  if (canal.provedor === "nao_oficial" && !canal.consentimento_em) {
    p.consentimento =
      "este número é de uma pessoa: sem o consentimento dela registrado, o canal não liga. O banco recusa a linha, não só a tela";
  }

  if (!canal.inbox_desde && (pedido.inboxDesde ?? "").trim().length === 0) {
    p.inboxDesde =
      "defina a data de corte do inbox antes de ligar — sem ela o histórico inteiro do número cai no inbox de todo mundo (0025)";
  } else if ((pedido.inboxDesde ?? "").trim().length > 0 && !dataIsoValida(pedido.inboxDesde)) {
    p.inboxDesde = "data de corte inválida — informe uma data real";
  }

  return p;
}

export function dataIsoValida(iso: string): boolean {
  const t = Date.parse((iso ?? "").trim());
  return Number.isFinite(t);
}

/**
 * O aviso obrigatório de desativação (EARS de F9). `pendentes = null` é o caso REAL hoje: não há
 * view nem RPC sobre `pgmq fila_saida`, e `ops`/`pgmq` estão fora da Data API — a web NÃO
 * CONSEGUE contar o que está em voo. Pedido registrado ao Agent 3; enquanto não existir, a
 * confirmação é INCONDICIONAL, que é mais estrito do que o EARS pedia e nunca menos.
 */
export function avisoDesativacao(pendentes: number | null): string {
  if (pendentes === null) {
    return (
      "Desligar este canal transforma cada mensagem ainda na fila de saída em falha PERMANENTE — " +
      "o sender não retenta, e a mensagem não volta sozinha. Esta tela não consegue contar quantas " +
      "estão em voo (a fila fica fora da API de dados), então confirme sabendo que pode não ser zero."
    );
  }
  if (pendentes === 0) {
    return "Nenhuma mensagem pendente na fila de saída deste canal agora. Desligar interrompe o envio a partir de já.";
  }
  const plural = pendentes === 1 ? "mensagem pendente" : "mensagens pendentes";
  return (
    `Há ${pendentes} ${plural} na fila de saída deste canal. Desligar transforma cada uma em falha ` +
    `PERMANENTE — o sender não retenta e elas não voltam sozinhas.`
  );
}

/**
 * O que a tela promete depois de gravar. NÃO é "aplicado agora": o runtime cacheia canal por 60 s
 * — e cacheia também a AUSÊNCIA (`canais.ts:45-47`), com canal desconhecido virando falha
 * permanente no sender (`sender.ts:258-259`). Dizer só "demora um minuto" esconde a metade cara.
 */
export const AVISO_APLICACAO_RUNTIME =
  "O runtime relê os canais a cada 60 segundos. Até lá, mensagem enviada por um canal recém-criado pode falhar — e essa falha é permanente, não volta sozinha. Espere um minuto antes de usar.";

/** Vai junto do canal não oficial, sempre, sem opção de fechar. O dano não é da empresa. */
export const AVISO_RISCO_BAN =
  "Número pessoal conectado por biblioteca não oficial: o WhatsApp pode banir. O ban atinge o WhatsApp PESSOAL de quem cedeu o número — contatos, grupos e histórico dela — e não é reversível.";

// ───────────────────────────────────────── payloads ─────────────────────────────────────────

export interface PayloadECanalId {
  canalId: string;
  payload: Record<string, unknown>;
}

export function payloadCanalRegistrado(f: FormCanal): PayloadECanalId {
  const canalId = canalIdDoForm(f);
  const payload: Record<string, unknown> = {
    canal_id: canalId,
    nome: (f.nome ?? "").trim(),
    provedor: f.provedor,
  };
  const numero = (f.numeroE164 ?? "").trim();
  const waba = (f.wabaId ?? "").trim();
  const area = (f.area ?? "").trim();
  if (numero) payload.numero_e164 = numero;
  if (waba) payload.waba_id = waba;
  if (area) payload.area = area;
  return { canalId, payload };
}

/**
 * Patch parcial. `provedor` NUNCA entra — a porta recusa a alteração, e mandar o campo só para
 * ser recusado transforma um "salvar" comum em erro na cara da gestora.
 */
export function payloadCanalAtualizado(
  canalId: string,
  patch: { nome?: string; numeroE164?: string; wabaId?: string; area?: string },
): Record<string, unknown> {
  const payload: Record<string, unknown> = { canal_id: canalId };
  if (patch.nome !== undefined) payload.nome = patch.nome.trim();
  if (patch.numeroE164 !== undefined) payload.numero_e164 = patch.numeroE164.trim();
  if (patch.wabaId !== undefined) payload.waba_id = patch.wabaId.trim();
  if (patch.area !== undefined) payload.area = patch.area.trim();
  return payload;
}

export function payloadCanalAtivado(canalId: string, inboxDesde: string, motivo?: string): Record<string, unknown> {
  const payload: Record<string, unknown> = { canal_id: canalId };
  const corte = (inboxDesde ?? "").trim();
  if (corte) payload.inbox_desde = corte;
  const m = (motivo ?? "").trim();
  if (m) payload.motivo = m;
  return payload;
}

export function payloadCanalDesativado(canalId: string, motivo?: string): Record<string, unknown> {
  const payload: Record<string, unknown> = { canal_id: canalId };
  const m = (motivo ?? "").trim();
  if (m) payload.motivo = m;
  return payload;
}

export type TipoEventoCanal =
  | "canal_registrado"
  | "canal_atualizado"
  | "canal_ativado"
  | "canal_desativado";

/**
 * Envelope pronto + guarda antissegredo aplicada ANTES de sair da máquina. A porta também
 * recusa (CONTRATO-C §4.3); recusar aqui é o que transforma o erro em teste vermelho.
 */
export function envelopeCanal(
  tipo: TipoEventoCanal,
  idExterno: string,
  payload: Record<string, unknown>,
): { ok: true; envelope: EnvelopeEvento } | { ok: false; motivo: string } {
  const seguro: VereditoEscrita = payloadSeguro(payload);
  if (!seguro.ok) return { ok: false, motivo: seguro.motivo! };
  return { ok: true, envelope: montarEnvelope(tipo, idExterno, payload) };
}

// ──────────────────────────────────────── apresentação ────────────────────────────────────────

export type EstadoCanal = "ativo" | "inativo" | "bloqueado_sem_consentimento";

export function estadoDoCanal(c: Canal): EstadoCanal {
  if (c.ativo) return "ativo";
  if (c.provedor === "nao_oficial" && !c.consentimento_em) return "bloqueado_sem_consentimento";
  return "inativo";
}

export function rotuloEstadoCanal(e: EstadoCanal): string {
  if (e === "ativo") return "Ligado";
  if (e === "bloqueado_sem_consentimento") return "Desligado · falta consentimento";
  return "Desligado";
}

/**
 * Credencial: presença ou ausência, NUNCA o valor — nem mascarado. A web não tem como saber se o
 * token existe (ele é env do RUNTIME), então a tela diz o que sabe e não finge.
 */
export const TEXTO_CREDENCIAL_DESCONHECIDA =
  "A credencial deste canal vive no ambiente do runtime — esta tela não lê, não mostra e não guarda token.";

/**
 * COLUNA COM VALOR ÚNICO SOME (decisão do Orquestrador sobre o mockup r10).
 *
 * Uma coluna em que todas as linhas dizem a mesma coisa não é informação: é ruído com custo de
 * largura. Enquanto todo canal for `comercial`, ÁREA sai; enquanto todo canal for oficial,
 * PROVEDOR sai. Voltam sozinhas no instante em que a segunda área ou o primeiro canal não oficial
 * aparecer — e é aí que elas passam a significar alguma coisa.
 *
 * Regra deliberadamente NÃO aplicada a `nome`, `numero` e `estado`: essas três são a identidade e
 * o estado da linha, e sumir com elas deixaria a tabela sem sujeito mesmo quando o valor coincide.
 */
export interface ColunasVisiveis {
  provedor: boolean;
  area: boolean;
}

export function colunasVisiveis(canais: Canal[]): ColunasVisiveis {
  if (canais.length === 0) return { provedor: false, area: false };
  const provedores = new Set(canais.map((c) => c.provedor));
  const areas = new Set(canais.map((c) => c.area_efetiva ?? "comercial"));
  return { provedor: provedores.size > 1, area: areas.size > 1 };
}

export function ordenarCanais(canais: Canal[]): Canal[] {
  return [...canais].sort(
    (a, b) =>
      Number(b.ativo) - Number(a.ativo) ||
      a.provedor.localeCompare(b.provedor) ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
}
