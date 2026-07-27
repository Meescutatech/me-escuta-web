/**
 * F12 · REGRAS PURAS do chamado de suporte (bug e ideia).
 *
 * Contrato fechado (ARB-18.4 / ARB-21): tipos `suporte_ticket_aberto` · `suporte_ticket_comentado`
 * · `suporte_ticket_resolvido`; estado `aberto | resolvido`; leitura em `core.v_suporte_ticket`;
 * anexo no bucket privado `suporte-anexos` com caminho `<uid>/<ticket_id>/<arquivo>`.
 *
 * O caminho do anexo NÃO é convenção de organização: **a RLS por autor depende dele**. A policy
 * do Storage compara `(storage.foldername(name))[1]` com `auth.uid()`. Errar a primeira pasta faz
 * uma de duas coisas, as duas ruins: o upload é recusado, ou — se um dia a policy afrouxar — o
 * print de tela de uma pessoa passa a ser legível por outra. Por isso `caminhoAnexoSuporte` é a
 * única forma de montar caminho nesta trilha, e ela é testada contra nome hostil.
 *
 * `lib/conversas/anexo.ts` NÃO serve aqui, e isto é correção da minha própria spec: ele rejeita
 * PDF, os limites dele são da META (5 MB imagem / 16 MB áudio) e a mensagem de recusa fala em
 * WhatsApp — texto errado para quem está anexando print de bug. Reusar exigiria generalizar
 * prefixo, tabela de mime e limite; o custo é o mesmo de escrever a regra certa aqui.
 */

import { montarEnvelope, payloadSeguro, type EnvelopeEvento } from "../../configuracoes/regras/porta.ts";
import type { Papel } from "../../configuracoes/regras/canais.ts";

export type TipoChamado = "bug" | "ideia";
export type StatusTicket = "aberto" | "resolvido";

export const TIPOS_CHAMADO: TipoChamado[] = ["bug", "ideia"];

export function tipoChamadoValido(v: unknown): v is TipoChamado {
  return typeof v === "string" && (TIPOS_CHAMADO as string[]).includes(v);
}

export function rotuloTipo(t: TipoChamado): string {
  return t === "bug" ? "Problema" : "Ideia";
}

/** Uma linha de `core.v_suporte_ticket`. */
export interface Ticket {
  numero: number;
  id: string;
  tipo: TipoChamado;
  titulo: string;
  descricao: string;
  onde: string | null;
  status: StatusTicket;
  resolucao: string | null;
  aberto_em: string;
  resolvido_em: string | null;
  autor_nome: string | null;
  autor_email: string | null;
  resolvido_por_nome: string | null;
  comentarios: number;
  anexos: number;
}

/** Reportar bug NÃO é ação de gestor — é o primeiro tipo aberto a `membro` sem guarda de papel. */
export function podeAbrirChamado(papel: Papel | null): boolean {
  return papel !== null;
}

/** Resolver, sim, é de gestão: a porta exige admin/owner em `suporte_ticket_resolvido`. */
export function podeResolverChamado(papel: Papel | null): boolean {
  return papel === "admin" || papel === "owner";
}

/** EARS opcional: gestor escolhe bug ou ideia; para os demais o padrão é bug. */
export function podeEscolherTipo(papel: Papel | null): boolean {
  return papel === "admin" || papel === "owner";
}

/** Quem não escolhe, reporta bug: é o caso de 9 em cada 10 e evita um clique obrigatório. */
export const TIPO_PADRAO: TipoChamado = "bug";

// ─────────────────────────────────── código citável ───────────────────────────────────

/**
 * `S-014` a partir do campo `numero` da view (ARB-21). O número é derivado (`row_number` sobre
 * `aberto_em`), nunca coluna — um identity seria RENUMERADO pelo replay e o "chamado 7" do Diogo
 * viraria o 4.
 */
export function codigoTicket(numero: number): string {
  const n = Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : 0;
  return `S-${String(n).padStart(3, "0")}`;
}

// ──────────────────────────────────── validação do form ────────────────────────────────────

export const LIMITE_TITULO = 140;
export const LIMITE_DESCRICAO = 4000;

export interface FormChamado {
  tipo: TipoChamado;
  titulo: string;
  descricao: string;
  /** rota de origem, capturada da tela — o campo mais útil e o que ninguém preenche direito. */
  onde: string;
}

export type ProblemasChamado = Partial<Record<keyof FormChamado, string>>;

export function validarChamado(f: FormChamado): ProblemasChamado {
  const p: ProblemasChamado = {};
  const titulo = (f.titulo ?? "").trim();
  const descricao = (f.descricao ?? "").trim();

  if (titulo.length === 0) {
    p.titulo = "escreva um título — é por ele que o chamado é encontrado depois";
  } else if (titulo.length > LIMITE_TITULO) {
    p.titulo = `o título passa de ${LIMITE_TITULO} caracteres (tem ${titulo.length}) — o resto cabe na descrição`;
  }

  if (descricao.length === 0) {
    p.descricao = "descreva o que aconteceu: o que você esperava e o que apareceu";
  } else if (descricao.length > LIMITE_DESCRICAO) {
    p.descricao = `a descrição passa de ${LIMITE_DESCRICAO} caracteres (tem ${descricao.length})`;
  }

  if (!tipoChamadoValido(f.tipo)) {
    p.tipo = "escolha problema ou ideia";
  }

  return p;
}

export function semProblemasChamado(p: ProblemasChamado): boolean {
  return Object.keys(p).length === 0;
}

/**
 * O botão fica DESABILITADO com título vazio — o formulário não submete com obrigatório em branco
 * (`APRENDIZADOS.md` §7: submeter para receber vermelho é o padrão que a casa já pagou para
 * abandonar).
 */
export function podeEnviarChamado(f: FormChamado, papel: Papel | null): boolean {
  return podeAbrirChamado(papel) && semProblemasChamado(validarChamado(f));
}

/**
 * A rota vai para o ledger, então entra normalizada: só o pathname. Query e hash são cortados —
 * não porque as nossas rotas os usem, mas porque o ledger é append-only e o que entra não sai.
 */
export function normalizarRota(rota: string): string {
  const r = (rota ?? "").trim();
  if (r.length === 0) return "";
  const semHash = r.split("#")[0];
  const semQuery = semHash.split("?")[0];
  return semQuery.startsWith("/") ? semQuery.slice(0, 200) : "";
}

export const AVISO_PII =
  "Não cole dado de paciente aqui (nome completo, telefone, exame, diagnóstico). O chamado é gravado no ledger, que é append-only: o que entra não sai.";

// ──────────────────────────────────────── anexo ────────────────────────────────────────

export const LIMITE_ANEXO_BYTES = 10 * 1024 * 1024;
export const MAX_ANEXOS = 3;

const MIME_ANEXO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const ACCEPT_ANEXO_SUPORTE = Object.keys(MIME_ANEXO).join(",");

export type ResultadoAnexoSuporte =
  | { ok: true; mime: string; ext: string }
  | { ok: false; motivo: string };

function mb(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/** A recusa NOMEIA o limite violado — nunca "arquivo inválido". */
export function validarAnexoSuporte(a: { type: string; size: number }): ResultadoAnexoSuporte {
  const mime = (a?.type ?? "").split(";")[0].trim().toLowerCase();
  const ext = MIME_ANEXO[mime];
  if (!ext) {
    return {
      ok: false,
      motivo: "só imagem nesta versão (JPEG, PNG, WebP ou GIF) — PDF e vídeo ficam para depois",
    };
  }
  if (!Number.isFinite(a.size) || a.size <= 0) return { ok: false, motivo: "arquivo vazio" };
  if (a.size > LIMITE_ANEXO_BYTES) {
    return { ok: false, motivo: `a imagem tem ${mb(a.size)} e o limite é ${mb(LIMITE_ANEXO_BYTES)}` };
  }
  return { ok: true, mime, ext };
}

/** Bucket PRIVADO próprio. Não é `anexos-lead`: o expurgo de mídia daquele bucket cruza com
 * `core.anexo.path`, e um print de bug sem `lead_id` ficaria órfão — ou pior, seria alcançado. */
export const BUCKET_SUPORTE = "suporte-anexos";

/**
 * `<uid>/<ticket_id>/<arquivo>` — a RLS por autor DEPENDE desta forma (ARB-21).
 * O nome do arquivo é higienizado: `/`, `..`, controle e espaço viram `_`. Um nome com barra
 * criaria uma pasta a mais e empurraria o arquivo para fora do escopo do dono.
 */
export function nomeArquivoSeguro(nome: string, extPadrao = "bin"): string {
  const bruto = (nome ?? "").normalize("NFKD").trim();
  const base = bruto.split(/[\\/]/).pop() ?? "";
  const limpo = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .replace(/_+/g, "_")
    .slice(0, 80);
  return limpo.length > 0 ? limpo : `anexo.${extPadrao}`;
}

export function caminhoAnexoSuporte(uid: string, ticketId: string, nomeArquivo: string): string {
  return `${uid}/${ticketId}/${nomeArquivoSeguro(nomeArquivo)}`;
}

/** A primeira pasta é o dono. Se isto for falso, a policy de INSERT do Storage recusa o upload. */
export function primeiraPasta(caminho: string): string {
  return (caminho ?? "").split("/")[0] ?? "";
}

export interface AnexoDoEvento {
  caminho: string;
  mime: string;
  nome: string;
  bytes: number;
}

// ──────────────────────────────────────── payloads ────────────────────────────────────────

export interface PedidoAbertura {
  ticketId: string;
  form: FormChamado;
  anexos: AnexoDoEvento[];
}

/**
 * O `ticket_id` é gerado por nós, de propósito: o contrato o aceita opcional (e usa `evento.id`
 * quando ausente), mas mandá-lo é o que torna o READBACK determinístico — sem ele a tela teria de
 * adivinhar qual linha nasceu do seu evento.
 */
export function payloadTicketAberto(p: PedidoAbertura): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ticket_id: p.ticketId,
    tipo: p.form.tipo,
    titulo: (p.form.titulo ?? "").trim(),
    descricao: (p.form.descricao ?? "").trim(),
    anexos: p.anexos.map((a) => ({ caminho: a.caminho, mime: a.mime, nome: a.nome, bytes: a.bytes })),
  };
  const onde = normalizarRota(p.form.onde);
  if (onde) payload.onde = onde;
  return payload;
}

export function payloadTicketComentado(ticketId: string, texto: string): Record<string, unknown> {
  return { ticket_id: ticketId, texto: (texto ?? "").trim() };
}

export function payloadTicketResolvido(ticketId: string, resolucao: string): Record<string, unknown> {
  return { ticket_id: ticketId, resolucao: (resolucao ?? "").trim() };
}

export type TipoEventoSuporte =
  | "suporte_ticket_aberto"
  | "suporte_ticket_comentado"
  | "suporte_ticket_resolvido";

export function envelopeSuporte(
  tipo: TipoEventoSuporte,
  idExterno: string,
  payload: Record<string, unknown>,
): { ok: true; envelope: EnvelopeEvento } | { ok: false; motivo: string } {
  const seguro = payloadSeguro(payload);
  if (!seguro.ok) return { ok: false, motivo: seguro.motivo! };
  return { ok: true, envelope: montarEnvelope(tipo, idExterno, payload) };
}

// ──────────────────────────────────────── listagem ────────────────────────────────────────

export type AbaTicket = "abertos" | "resolvidos" | "todos";

export function filtrarTickets(tickets: Ticket[], aba: AbaTicket): Ticket[] {
  const filtrados =
    aba === "todos" ? [...tickets] : tickets.filter((t) => (aba === "abertos" ? t.status === "aberto" : t.status === "resolvido"));
  return filtrados.sort((a, b) => b.aberto_em.localeCompare(a.aberto_em) || b.numero - a.numero);
}

export function contarPorAba(tickets: Ticket[]): Record<AbaTicket, number> {
  return {
    abertos: tickets.filter((t) => t.status === "aberto").length,
    resolvidos: tickets.filter((t) => t.status === "resolvido").length,
    todos: tickets.length,
  };
}

/**
 * O que a tela faz quando o upload falha (EARS): o chamado NÃO é gravado sem a imagem por
 * conta própria — enviar sem anexo vira escolha explícita de quem está reportando.
 */
export const MOTIVO_UPLOAD_FALHOU =
  "a imagem não subiu, então o chamado não foi enviado. Tente de novo ou escolha enviar sem a imagem.";
