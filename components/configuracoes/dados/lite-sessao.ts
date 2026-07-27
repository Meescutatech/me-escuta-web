/**
 * F11 · LEITURA da sessão não oficial + CLIENTE da rota interna do runtime. SERVIDOR, sempre.
 *
 * A divisão é a da ARB-18.5, e não é arbitrária:
 *   • STATUS vem do BANCO (`core.v_sessao_canal`, sobre `ops.sessao_canal`). Sobrevive a restart
 *     do runtime — e esta noite o runtime é reimplantado várias vezes.
 *   • QR e COMANDOS vêm da ROTA INTERNA do runtime, e o QR nunca toca o banco: QR de WhatsApp é
 *     credencial viva, quem lê pareia. Guardá-lo numa tabela seria dar a sessão da fono a todo
 *     mundo que tenha `select`.
 *   • O CONTADOR vem de `core.v_descarte_borda`, e passa por `sanitizarLinhaDescarte` — allowlist
 *     de colunas, para que uma coluna nova na view não vire PII na tela por descuido.
 *
 * A WEB NUNCA FALA COM O PROVEDOR. Se falasse, o token de instância teria de chegar ao browser.
 * `RUNTIME_LITE_TOKEN` é lido AQUI, no servidor, e é a única env secreta desta trilha (declarada
 * em `regras/portao.ts`, onde o portão a confere).
 */

import { criarClienteServidor } from "@/lib/supabase/server";
import {
  MOTIVO_CREDENCIAL_PROVEDOR,
  MOTIVO_RUNTIME_MUDO,
  MOTIVO_SEM_ROTA,
  TIMEOUT_RUNTIME_MS,
  estadoSessaoValido,
  normalizarRespostaRuntime,
  sanitizarLinhaDescarte,
  type EstadoSessao,
  type LinhaDescarte,
  type RespostaSessaoRuntime,
  type SessaoCanal,
} from "../regras/lite-sessao.ts";

// ────────────────────────────────── status, pelo banco ──────────────────────────────────

export interface SessaoLida {
  sessao: SessaoCanal | null;
  /** true = a view não existe neste ambiente (0081 ainda não subiu) ou a leitura falhou. */
  indisponivel: boolean;
}

export async function lerSessao(canalId: string): Promise<SessaoLida> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("v_sessao_canal")
      .select("canal_id,canal_nome,provedor,status,detalhe,qr_expira_em,ultimo_batimento,atualizado_em")
      .eq("canal_id", canalId)
      .maybeSingle();
    if (error) return { sessao: null, indisponivel: true };
    if (!data) return { sessao: null, indisponivel: false }; // sem linha = nunca houve sessão
    const l = data as Record<string, unknown>;
    const status: EstadoSessao = estadoSessaoValido(l.status) ? l.status : "desconectado";
    return {
      sessao: {
        canal_id: String(l.canal_id ?? canalId),
        canal_nome: l.canal_nome ? String(l.canal_nome) : null,
        provedor: l.provedor ? String(l.provedor) : null,
        status,
        detalhe: l.detalhe ? String(l.detalhe) : null,
        qr_expira_em: l.qr_expira_em ? String(l.qr_expira_em) : null,
        ultimo_batimento: l.ultimo_batimento ? String(l.ultimo_batimento) : null,
        atualizado_em: l.atualizado_em ? String(l.atualizado_em) : null,
      },
      indisponivel: false,
    };
  } catch {
    return { sessao: null, indisponivel: true };
  }
}

// ────────────────────────────────── contador cego ──────────────────────────────────

export interface DescartesLidos {
  linhas: LinhaDescarte[];
  indisponivel: boolean;
}

export async function lerDescartes(canalId: string, dias = 7): Promise<DescartesLidos> {
  try {
    const supabase = criarClienteServidor();
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .schema("core")
      .from("v_descarte_borda")
      .select("canal_id,canal_nome,provedor,dia,motivo,quantidade,primeiro_em,ultimo_em")
      .eq("canal_id", canalId)
      .gte("dia", desde)
      .limit(200);
    if (error || !data) return { linhas: [], indisponivel: true };
    // allowlist SEMPRE, mesmo com o select nomeando as colunas: o select é uma promessa, a
    // sanitização é uma garantia.
    return {
      linhas: (data as unknown as Record<string, unknown>[]).map(sanitizarLinhaDescarte),
      indisponivel: false,
    };
  } catch {
    return { linhas: [], indisponivel: true };
  }
}

/**
 * Quanto deste canal FOI guardado nas últimas 24 h — a outra metade do sinal de nono dígito. Sem
 * este número, "descartou 300" não distingue "número pessoal movimentado" de "filtro barrando
 * paciente conhecido".
 *
 * PROXY DECLARADO: conto CONVERSAS tocadas na janela (`core.conversa.atualizado_em`), não
 * mensagens — `core.mensagem` não carrega `phone_number_id`, e a conversa carrega. Para o sinal,
 * o que importa é "passou alguma coisa?", e zero conversa tocada responde isso sem ambiguidade.
 */
export async function contarConversasTocadas24h(canalId: string): Promise<number | null> {
  try {
    const supabase = criarClienteServidor();
    const desde = new Date(Date.now() - 86_400_000).toISOString();
    const { count, error } = await supabase
      .schema("core")
      .from("conversa")
      .select("id", { count: "exact", head: true })
      .eq("phone_number_id", canalId)
      .gte("atualizado_em", desde);
    if (error) return null;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

// ──────────────────────────── comandos e QR, pela rota do runtime ────────────────────────────

export interface ResultadoRuntime {
  ok: boolean;
  resposta?: RespostaSessaoRuntime;
  motivo?: string;
}

function base(): { url: string; token: string } | null {
  const url = (process.env.RUNTIME_LITE_URL ?? "").replace(/\/+$/, "");
  const token = process.env.RUNTIME_LITE_TOKEN ?? "";
  if (!url || !token) return null;
  return { url, token };
}

async function chamar(caminho: string, metodo: "GET" | "POST"): Promise<ResultadoRuntime> {
  const cfg = base();
  if (!cfg) return { ok: false, motivo: MOTIVO_SEM_ROTA };
  try {
    const resp = await fetch(`${cfg.url}${caminho}`, {
      method: metodo,
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(TIMEOUT_RUNTIME_MS),
      cache: "no-store",
    });
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, motivo: MOTIVO_CREDENCIAL_PROVEDOR };
    }
    if (!resp.ok) return { ok: false, motivo: `o runtime respondeu ${resp.status}` };
    return { ok: true, resposta: normalizarRespostaRuntime(await resp.json()) };
  } catch (err) {
    const abortou = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, motivo: abortou ? MOTIVO_RUNTIME_MUDO : `falha ao falar com o runtime: ${String(err)}` };
  }
}

/** Cria a sessão. A resposta traz o QR quando houver — ele é desenhado e morre. */
export function criarSessaoNoRuntime(canalId: string): Promise<ResultadoRuntime> {
  return chamar(`/lite/sessao/${encodeURIComponent(canalId)}`, "POST");
}

export function lerEstadoNoRuntime(canalId: string): Promise<ResultadoRuntime> {
  return chamar(`/lite/sessao/${encodeURIComponent(canalId)}`, "GET");
}

export function desconectarNoRuntime(canalId: string): Promise<ResultadoRuntime> {
  return chamar(`/lite/sessao/${encodeURIComponent(canalId)}/desconectar`, "POST");
}
