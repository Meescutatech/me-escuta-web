/**
 * F12 · LEITURA dos chamados. SERVIDOR.
 *
 * Fonte: `core.v_suporte_ticket` (nasce na 0070/0071). A RLS decide o que aparece — autor vê o
 * seu, admin/owner veem todos —, então esta leitura NÃO filtra por autor: filtrar aqui daria a
 * ilusão de segurança e esconderia um erro de policy em vez de expô-lo.
 *
 * A URL assinada do anexo é gerada AQUI, com a sessão do usuário (anon key + JWT). Nenhuma chave
 * de serviço passa perto: quem decide se o objeto pode ser lido é a policy do Storage.
 */

import { criarClienteServidor } from "@/lib/supabase/server";
import {
  BUCKET_SUPORTE,
  tipoChamadoValido,
  type Ticket,
  type TipoChamado,
} from "../regras/suporte.ts";

export interface TicketsLidos {
  tickets: Ticket[];
  /** true = a view ainda não existe neste ambiente ou a leitura falhou. */
  indisponivel: boolean;
}

export async function lerTickets(): Promise<TicketsLidos> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("v_suporte_ticket")
      .select(COLUNAS_TICKET)
      .order("aberto_em", { ascending: false })
      .limit(200);
    if (error || !data) return { tickets: [], indisponivel: true };
    const tickets = (data as unknown as Record<string, unknown>[])
      .map(linhaParaTicket)
      .filter((t): t is Ticket => t !== null);
    return { tickets, indisponivel: false };
  } catch {
    return { tickets: [], indisponivel: true };
  }
}

/** `versao` entra aqui (0115) — é o campo que decide se o bug já foi corrigido. */
const COLUNAS_TICKET =
  "numero,id,tipo,titulo,descricao,onde,versao,status,resolucao,aberto_em,resolvido_em,autor_nome,autor_email,resolvido_por_nome,comentarios,anexos";

function linhaParaTicket(l: Record<string, unknown>): Ticket | null {
  const id = String(l.id ?? "").trim();
  if (!id) return null;
  const tipoBruto = String(l.tipo ?? "bug");
  const tipo: TipoChamado = tipoChamadoValido(tipoBruto) ? tipoBruto : "bug";
  return {
    numero: Number(l.numero ?? 0),
    id,
    tipo,
    titulo: String(l.titulo ?? "(sem título)"),
    descricao: String(l.descricao ?? ""),
    onde: l.onde ? String(l.onde) : null,
    versao: l.versao ? String(l.versao) : null,
    status: String(l.status ?? "aberto") === "resolvido" ? "resolvido" : "aberto",
    resolucao: l.resolucao ? String(l.resolucao) : null,
    aberto_em: String(l.aberto_em ?? ""),
    resolvido_em: l.resolvido_em ? String(l.resolvido_em) : null,
    autor_nome: l.autor_nome ? String(l.autor_nome) : null,
    autor_email: l.autor_email ? String(l.autor_email) : null,
    resolvido_por_nome: l.resolvido_por_nome ? String(l.resolvido_por_nome) : null,
    comentarios: Number(l.comentarios ?? 0),
    anexos: Number(l.anexos ?? 0),
  };
}

export interface TicketLido {
  ticket: Ticket | null;
  /** o AUTOR do chamado, que a view não expõe — só nome e e-mail. Ver a nota abaixo. */
  autorId: string | null;
  /** true = a leitura FALHOU. Diferente de `ticket: null`, que é "não existe ou não é seu". */
  indisponivel: boolean;
}

/**
 * Um chamado pelo `numero` da view (`/suporte/14`).
 *
 * `ticket: null` cobre "não existe" **e** "não é seu" — a RLS devolve vazio nos dois e não
 * distingue. Distinguir aqui vazaria a existência de chamado alheio (§5.5 da SPEC).
 *
 * DUAS LEITURAS, e a segunda tem motivo: `core.v_suporte_ticket` expõe `autor_nome` e
 * `autor_email`, mas NÃO `autor_id` — e é o `autor_id` que decide se a pessoa pode comentar
 * (`podeComentarChamado`). Ler o id da tabela em vez de alargar a view é o caminho de menor
 * raio: a view é objeto compartilhado e acrescentar coluna nela para uma tela é o tipo de
 * mudança que outro item herda sem pedir. A RLS protege as duas leituras igualmente.
 */
export async function lerTicketPorNumero(numero: number): Promise<TicketLido> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("v_suporte_ticket")
      .select(COLUNAS_TICKET)
      .eq("numero", numero)
      .limit(1);
    if (error) return { ticket: null, autorId: null, indisponivel: true };
    const linha = (data as unknown as Record<string, unknown>[])?.[0];
    if (!linha) return { ticket: null, autorId: null, indisponivel: false };
    const ticket = linhaParaTicket(linha);
    if (!ticket) return { ticket: null, autorId: null, indisponivel: false };

    const { data: dAutor } = await supabase
      .schema("core")
      .from("suporte_ticket")
      .select("autor_id")
      .eq("id", ticket.id)
      .limit(1);
    const autorId = (dAutor as unknown as Record<string, unknown>[])?.[0]?.autor_id;

    return { ticket, autorId: autorId ? String(autorId) : null, indisponivel: false };
  } catch {
    return { ticket: null, autorId: null, indisponivel: true };
  }
}

// o tipo vive em `regras/suporte.ts` (modulo PURO) porque o fio de conversa e componente CLIENT
// e o portao `cliente` reprova client que importe de `dados/`. Uma definicao so, reexportada.
export type { ComentarioTicket } from "../regras/suporte.ts";

export async function lerComentarios(ticketId: string): Promise<ComentarioTicket[]> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("suporte_ticket_comentario")
      .select("id,autor_id,texto,criado_em")
      .eq("ticket_id", ticketId)
      .order("criado_em", { ascending: true })
      .limit(200);
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map((l) => ({
      id: String(l.id ?? ""),
      autor_id: l.autor_id ? String(l.autor_id) : null,
      texto: String(l.texto ?? ""),
      criado_em: String(l.criado_em ?? ""),
    }));
  } catch {
    return [];
  }
}

export interface AnexoTicket {
  id: string;
  caminho: string;
  mime: string | null;
  nome: string | null;
  bytes: number | null;
}

export async function lerAnexos(ticketId: string): Promise<AnexoTicket[]> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("suporte_ticket_anexo")
      .select("id,caminho,mime,nome,bytes")
      .eq("ticket_id", ticketId)
      .limit(20);
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map((l) => ({
      id: String(l.id ?? ""),
      caminho: String(l.caminho ?? ""),
      mime: l.mime ? String(l.mime) : null,
      nome: l.nome ? String(l.nome) : null,
      bytes: l.bytes === null || l.bytes === undefined ? null : Number(l.bytes),
    }));
  } catch {
    return [];
  }
}

/**
 * URL assinada (~30 min) para exibir a imagem do chamado. O bucket é PRIVADO: sem isto a prévia
 * carrega como quadrado quebrado. Falha silenciosa é proposital — anexo que não abre degrada para
 * "imagem indisponível", nunca derruba a tela do chamado.
 */
export interface AnexoComUrl extends AnexoTicket {
  /** null = a URL não foi gerada. A tela mostra "imagem indisponível", nunca quadrado quebrado. */
  url: string | null;
}

/**
 * Os anexos do chamado já com a URL assinada. É o que liga os DOIS leitores que existiam e
 * nunca tiveram consumidor (`lerAnexos` e `urlAssinadaAnexo`): o anexo subia, era gravado, tinha
 * URL pronta — e não havia tela que o mostrasse.
 *
 * As URLs são geradas em paralelo porque são até 3 (MAX_ANEXOS) e cada uma é uma ida à rede;
 * em série, o pior caso triplica o tempo do primeiro byte da tela.
 */
export async function lerAnexosComUrl(ticketId: string): Promise<AnexoComUrl[]> {
  const anexos = await lerAnexos(ticketId);
  return Promise.all(
    anexos.map(async (a) => ({ ...a, url: await urlAssinadaAnexo(a.caminho) })),
  );
}

export async function urlAssinadaAnexo(caminho: string): Promise<string | null> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase.storage.from(BUCKET_SUPORTE).createSignedUrl(caminho, 1800);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
