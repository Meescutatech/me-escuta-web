/**
 * F11 · REGRAS PURAS da sessão do canal NÃO OFICIAL (WhatsApp de uma pessoa, não da empresa).
 *
 * O desenho está partido em dois de propósito (ARB-18.5, merge dos dois contratos):
 *   • STATUS  → `ops.sessao_canal`, lido pela UI em `core.v_sessao_canal`. Sobrevive a restart do
 *               runtime, e NUNCA carrega segredo.
 *   • QR e COMANDOS → rota interna do runtime. O QR **jamais toca o banco**: QR de WhatsApp é
 *               credencial viva — quem lê, pareia. Ele trafega runtime → tela e morre.
 *
 * Três achados que a tela precisa carregar, cada um com um jeito próprio de mentir se ignorado:
 *
 *  (a) `IsConnected` ≠ `IsLoggedIn` (lido em `handlers.go` do WuzAPI): são TRÊS estados de
 *      conexão, não dois — desconectado · conectado-aguardando-pareamento · logado. Uma tela com
 *      um booleano mente. O banco acrescenta um quarto que a minha spec não tinha: `banido`.
 *  (b) O QR EXPIRA EM SEGUNDOS e é reemitido. A tela relê; nunca guarda.
 *  (c) O CONTADOR É CEGO. Ele existe para responder "o filtro está funcionando?" sem responder
 *      "quem foi barrado?". Por isso `sanitizarLinhaDescarte` é allowlist, não blocklist: se a
 *      view um dia ganhar uma coluna com PII, a tela não passa a mostrar por descuido.
 */

import { montarEnvelope, payloadSeguro, type EnvelopeEvento } from "./porta.ts";
import type { Canal, Papel } from "./canais.ts";
import { podeGerirCanais } from "./canais.ts";

/** Vocabulário do banco (`ops.sessao_canal.status` check). É ele que manda, não o meu rascunho. */
export type EstadoSessao = "desconectado" | "aguardando_qr" | "conectado" | "banido";

export const ESTADOS_SESSAO: EstadoSessao[] = ["desconectado", "aguardando_qr", "conectado", "banido"];

export function estadoSessaoValido(v: unknown): v is EstadoSessao {
  return typeof v === "string" && (ESTADOS_SESSAO as string[]).includes(v);
}

export interface SessaoCanal {
  canal_id: string;
  canal_nome: string | null;
  provedor: string | null;
  status: EstadoSessao;
  /** mensagem legível do provedor. Nunca QR, nunca credencial. */
  detalhe: string | null;
  qr_expira_em: string | null;
  ultimo_batimento: string | null;
  atualizado_em: string | null;
}

/**
 * O achado (a), como função. Recebe as três flags que o provedor devolve separadas e devolve UM
 * estado. Quem colapsar `conectado = IsConnected` vai chamar de "conectado" uma sessão que só
 * abriu socket e ainda não pareou — e a tela dirá que está tudo certo enquanto nada chega.
 */
export function estadoDeFlags(f: {
  conectado: boolean;
  logado: boolean;
  banido?: boolean;
}): EstadoSessao {
  if (f.banido) return "banido";
  if (f.logado) return "conectado";
  if (f.conectado) return "aguardando_qr";
  return "desconectado";
}

export type EventoSessao =
  | "pediu_sessao"
  | "qr_recebido"
  | "pareou"
  | "caiu"
  | "desconectou"
  | "banido";

/** Máquina de estados da tela. Determinística e sem I/O — é o que o polling alimenta. */
export function proximoEstado(atual: EstadoSessao, evento: EventoSessao): EstadoSessao {
  if (evento === "banido") return "banido";
  if (atual === "banido") return "banido"; // só sai por intervenção humana no provedor
  switch (evento) {
    case "pediu_sessao":
      return atual === "conectado" ? "conectado" : "aguardando_qr";
    case "qr_recebido":
      return atual === "conectado" ? "conectado" : "aguardando_qr";
    case "pareou":
      return "conectado";
    case "caiu":
    case "desconectou":
      return "desconectado";
    default:
      return atual;
  }
}

export const INTERVALO_RELEITURA_MS = 5_000;

/**
 * EARS: relê a cada 5 s ENQUANTO aguarda pareamento; PARA de reler quando conecta. Devolver
 * `null` (e não 0) obriga quem chama a decidir explicitamente — um número sempre positivo viraria
 * polling eterno contra o runtime.
 */
export function intervaloRelituraMs(estado: EstadoSessao): number | null {
  return estado === "aguardando_qr" ? INTERVALO_RELEITURA_MS : null;
}

export function devoRelerEstado(estado: EstadoSessao): boolean {
  return intervaloRelituraMs(estado) !== null;
}

/** O QR expira em segundos. Sem `qr_expira_em` a tela assume expirado — nunca desenha QR velho. */
export function qrExpirado(qrExpiraEm: string | null | undefined, agoraMs: number): boolean {
  const t = Date.parse((qrExpiraEm ?? "").trim());
  if (!Number.isFinite(t)) return true;
  return t <= agoraMs;
}

export function rotuloEstadoSessao(e: EstadoSessao): string {
  switch (e) {
    case "conectado":
      return "Conectado";
    case "aguardando_qr":
      return "Aguardando pareamento";
    case "banido":
      return "Banido pelo WhatsApp";
    default:
      return "Desconectado";
  }
}

export function descricaoEstadoSessao(e: EstadoSessao): string {
  switch (e) {
    case "conectado":
      return "O número está pareado e as mensagens de contraparte conhecida entram no sistema.";
    case "aguardando_qr":
      return "Abra o WhatsApp no celular dela, em Aparelhos conectados, e leia o código. Ele expira em segundos e é redesenhado sozinho.";
    case "banido":
      return "O WhatsApp bloqueou este número. Não há reconexão possível por aqui — e o bloqueio atinge o WhatsApp pessoal de quem cedeu o número.";
    default:
      return "Nenhuma sessão ativa. Nada deste número entra no sistema.";
  }
}

// ─────────────────────────────── o portão de criação de sessão ───────────────────────────────

export interface ContextoCriacaoSessao {
  papel: Papel | null;
  canal: Canal | null;
  /** F8 (bloco `conversa` obrigatório) em produção E verificado por V8. Gate duro. */
  f8Pronto: boolean;
}

export interface VereditoSessao {
  pode: boolean;
  /** o motivo do PRIMEIRO bloqueio, na ordem de prioridade abaixo. Vai na tela, não no console. */
  motivo?: string;
  /** o que não bloqueia mas o operador precisa saber antes de parear. */
  avisos: string[];
}

/**
 * Ordem de prioridade deliberada: papel → provedor → CONSENTIMENTO → F8. O consentimento vem
 * antes do F8 porque é o único bloqueio cujo dano é de terceiro: a fono perde o WhatsApp dela, e
 * ninguém nesta conversa pode consentir no lugar dela. Se o motivo mostrado fosse "falta F8",
 * alguém destravaria o F8 e acharia que resolveu.
 */
export function podeCriarSessao(ctx: ContextoCriacaoSessao): VereditoSessao {
  const avisos: string[] = [];
  if (!podeGerirCanais(ctx.papel)) {
    return { pode: false, motivo: "criar sessão exige admin ou owner", avisos };
  }
  if (!ctx.canal) {
    return { pode: false, motivo: "registre o canal antes — a sessão se pendura num canal existente", avisos };
  }
  if (ctx.canal.provedor !== "nao_oficial") {
    return {
      pode: false,
      motivo: "só canal não oficial tem sessão por pareamento — o canal oficial fala com a Meta por token",
      avisos,
    };
  }
  if (!ctx.canal.consentimento_em) {
    return {
      pode: false,
      motivo:
        "sem o consentimento da titular registrado, a sessão não abre. O número é dela: um ban tira o WhatsApp PESSOAL dela, sem volta, e ninguém aqui pode consentir no lugar dela",
      avisos,
    };
  }
  if (!ctx.f8Pronto) {
    return {
      pode: false,
      motivo:
        "F8 (bloco `conversa` obrigatório na ingestão) precisa estar em produção e verificado antes de parear — sem ele o histórico que chega mistura pessoas no ledger, e ledger não devolve",
      avisos,
    };
  }
  if (!ctx.canal.ativo) {
    avisos.push(
      "O canal está desligado: parear conecta a sessão, mas nada é ingerido enquanto ele não for ligado.",
    );
  }
  return { pode: true, avisos };
}

// ─────────────────────────────────── consentimento (portão) ───────────────────────────────────

export const TERMO_VERSAO = "v1";

export type MeioConsentimento = "assinatura" | "whatsapp" | "presencial" | "video";
export const MEIOS_CONSENTIMENTO: MeioConsentimento[] = ["assinatura", "whatsapp", "presencial", "video"];

export function meioConsentimentoValido(v: unknown): v is MeioConsentimento {
  return typeof v === "string" && (MEIOS_CONSENTIMENTO as string[]).includes(v);
}

/**
 * O texto do termo. Não é jurídico e não tenta ser: é a fono sabendo, ANTES, o que pode perder.
 * O conteúdo é do Diogo e do Croqui — o que esta trilha garante é que (1) não dá para abrir sessão
 * sem registrar aceite, e (2) o texto nomeia o dano. O item (2) é testado, não confiado: o teste
 * exige as palavras do dano, e mudar o texto sem elas REPROVA.
 *
 * Mudou o texto? Sobe a versão. Consentimento dado sobre um texto antigo não cobre um texto novo —
 * é para isso que `consentimento_texto_versao` existe no banco.
 */
export const TERMO_CANAL_PESSOAL = [
  "Este número é seu, pessoal. Conectá-lo ao sistema usa uma biblioteca NÃO OFICIAL do WhatsApp.",
  "O WhatsApp pode banir números conectados assim. Se isso acontecer, o bloqueio atinge o SEU WhatsApp pessoal — suas conversas, seus grupos, seus contatos, o seu histórico. Não é reversível, e não é um chip da empresa: é o seu.",
  "Enquanto o número estiver conectado, a empresa passa a ler no sistema as mensagens que chegarem dele vindas de pessoas já cadastradas como lead ou paciente. Mensagem de quem não é nosso conhecido é descartada na borda e não é guardada em lugar nenhum.",
  "Você pode pedir a desconexão a qualquer momento.",
].join("\n\n");

/** As palavras que o termo TEM de conter para ser um consentimento informado, não um rodapé. */
export const TERMO_EXIGE_DIZER = [
  "não oficial",
  "banir",
  "pessoal",
  "não é reversível",
  "descartada",
] as const;

export function termoNomeiaODano(texto: string): boolean {
  const t = (texto ?? "").toLowerCase();
  return TERMO_EXIGE_DIZER.every((frase) => t.includes(frase.toLowerCase()));
}

export interface FormConsentimento {
  canalId: string;
  titularNome: string;
  meio: MeioConsentimento;
  /** ISO. Quando a titular aceitou de fato — pode ser antes de alguém digitar aqui. */
  aceitoEm: string;
  textoVersao: string;
  aceiteMarcado: boolean;
}

export type ProblemasConsentimento = Partial<Record<keyof FormConsentimento, string>>;

export function validarConsentimento(f: FormConsentimento, agoraMs: number): ProblemasConsentimento {
  const p: ProblemasConsentimento = {};
  if ((f.titularNome ?? "").trim().length < 2) {
    p.titularNome = "diga de quem é o número — o consentimento é de uma pessoa com nome, não do canal";
  }
  if (!meioConsentimentoValido(f.meio)) {
    p.meio = "informe como ela consentiu: assinatura, WhatsApp, presencial ou vídeo";
  }
  const t = Date.parse((f.aceitoEm ?? "").trim());
  if (!Number.isFinite(t)) {
    p.aceitoEm = "informe quando ela consentiu";
  } else if (t > agoraMs) {
    p.aceitoEm = "a data do consentimento está no futuro — consentimento não se registra antes de acontecer";
  }
  if ((f.textoVersao ?? "").trim().length === 0) {
    p.textoVersao = "a versão do termo precisa ser registrada — sem ela, um aceite sobre texto antigo passaria a valer para um texto novo";
  }
  if (!f.aceiteMarcado) {
    p.aceiteMarcado = "confirme que a titular leu e concordou com o termo acima";
  }
  return p;
}

export function payloadConsentimento(f: FormConsentimento): Record<string, unknown> {
  return {
    canal_id: f.canalId,
    titular_nome: (f.titularNome ?? "").trim(),
    texto_versao: (f.textoVersao ?? "").trim(),
    meio: f.meio,
    aceito_em: (f.aceitoEm ?? "").trim(),
  };
}

export function envelopeConsentimento(
  idExterno: string,
  payload: Record<string, unknown>,
): { ok: true; envelope: EnvelopeEvento } | { ok: false; motivo: string } {
  const seguro = payloadSeguro(payload);
  if (!seguro.ok) return { ok: false, motivo: seguro.motivo! };
  return { ok: true, envelope: montarEnvelope("canal_consentimento_registrado", idExterno, payload) };
}

// ──────────────────────────────────── o contador cego ────────────────────────────────────

/**
 * As ÚNICAS colunas que a tela aceita de `core.v_descarte_borda`. Allowlist, não blocklist: o
 * contador existe para provar que o filtro funciona sem guardar quem ele barrou, e uma coluna
 * nova na view não pode virar PII na tela por omissão de quem escreveu o componente.
 */
export const CAMPOS_DESCARTE = [
  "canal_id",
  "canal_nome",
  "provedor",
  "dia",
  "motivo",
  "quantidade",
  "primeiro_em",
  "ultimo_em",
] as const;

export type CampoDescarte = (typeof CAMPOS_DESCARTE)[number];
export type LinhaDescarte = Record<CampoDescarte, unknown>;

export function sanitizarLinhaDescarte(bruta: Record<string, unknown>): LinhaDescarte {
  const limpa = {} as LinhaDescarte;
  for (const campo of CAMPOS_DESCARTE) limpa[campo] = bruta?.[campo] ?? null;
  return limpa;
}

export interface ResumoDescartes {
  total: number;
  porMotivo: { motivo: string; quantidade: number }[];
  desde: string | null;
  ate: string | null;
}

export function resumirDescartes(linhas: LinhaDescarte[]): ResumoDescartes {
  let total = 0;
  const porMotivo = new Map<string, number>();
  let desde: string | null = null;
  let ate: string | null = null;
  for (const l of linhas) {
    const q = Number(l.quantidade ?? 0);
    if (Number.isFinite(q)) total += q;
    const m = String(l.motivo ?? "desconhecido");
    porMotivo.set(m, (porMotivo.get(m) ?? 0) + (Number.isFinite(q) ? q : 0));
    const p = l.primeiro_em ? String(l.primeiro_em) : null;
    const u = l.ultimo_em ? String(l.ultimo_em) : null;
    if (p && (!desde || p < desde)) desde = p;
    if (u && (!ate || u > ate)) ate = u;
  }
  return {
    total,
    porMotivo: [...porMotivo.entries()]
      .map(([motivo, quantidade]) => ({ motivo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade || a.motivo.localeCompare(b.motivo)),
    desde,
    ate,
  };
}

export const ROTULO_MOTIVO_DESCARTE: Record<string, string> = {
  contraparte_desconhecida: "contraparte não é lead nem paciente",
  telefone_ilegivel: "telefone ilegível",
  canal_inativo: "canal desligado",
  grupo: "mensagem de grupo",
  status_broadcast: "status/transmissão",
};

/**
 * O sinal do NONO DÍGITO — a forma mais provável desta feature falhar sem ninguém ver.
 * O WhatsApp entrega 12 dígitos e o formulário 13 (`APRENDIZADOS.md` §8): um filtro que compare
 * telefone cru classifica PACIENTE CONHECIDO como desconhecido e descarta em silêncio. A mensagem
 * não é reentregue. Aqui não dá para provar que o oráculo está certo — dá para acender a suspeita
 * quando o padrão bate: descarte crescendo com zero mensagem persistida na mesma janela.
 */
export interface SinalFiltro {
  suspeito: boolean;
  motivo?: string;
}

export function suspeitaFiltroCego(janela: {
  descartados24h: number;
  persistidas24h: number;
}): SinalFiltro {
  if (janela.descartados24h > 0 && janela.persistidas24h === 0) {
    return {
      suspeito: true,
      motivo:
        `${janela.descartados24h} mensagem(ns) descartada(s) nas últimas 24 h e NENHUMA guardada. ` +
        "Pode ser normal (número pessoal recebe muita conversa de fora), mas é também a cara de um filtro " +
        "comparando telefone cru em vez da chave canônica — nesse caso ele está barrando paciente conhecido, " +
        "e o WhatsApp não reentrega. Confira o oráculo antes de assumir que é normal.",
    };
  }
  return { suspeito: false };
}

// ─────────────────────────────── contrato com a rota do runtime ───────────────────────────────

/**
 * O que a rota interna do runtime devolve. A web NUNCA fala com o provedor: se falasse, o token
 * de instância teria de chegar ao browser. O QR vem daqui, é desenhado e morre — não é gravado,
 * não é logado, não vai para o banco.
 */
export interface RespostaSessaoRuntime {
  estado: EstadoSessao;
  /** código CRU do QR (WuzAPI devolve o código, não a imagem). Quem desenha é o cliente. */
  qr?: string | null;
  qr_expira_em?: string | null;
  desde?: string | null;
  motivo?: string | null;
}

export const TIMEOUT_RUNTIME_MS = 10_000;

export const MOTIVO_RUNTIME_MUDO =
  "sem resposta do runtime em 10 segundos — não é QR vazio nem carregando infinito: o serviço não respondeu";

export const MOTIVO_CREDENCIAL_PROVEDOR =
  "a credencial do provedor está ausente ou inválida no runtime (a tela não vê, não guarda e não mostra credencial nenhuma)";

export const MOTIVO_SEM_ROTA =
  "a rota interna de sessão do runtime não está configurada neste ambiente — sem ela não há como criar sessão nem obter QR";

/** Normaliza a resposta do runtime; qualquer coisa fora do contrato vira desconectado + motivo. */
export function normalizarRespostaRuntime(bruta: unknown): RespostaSessaoRuntime {
  const b = (bruta ?? {}) as Record<string, unknown>;
  const estado = estadoSessaoValido(b.estado) ? b.estado : "desconectado";
  const qr = typeof b.qr === "string" && b.qr.length > 0 ? b.qr : null;
  return {
    estado,
    qr,
    qr_expira_em: typeof b.qr_expira_em === "string" ? b.qr_expira_em : null,
    desde: typeof b.desde === "string" ? b.desde : null,
    motivo: typeof b.motivo === "string" ? b.motivo : null,
  };
}
