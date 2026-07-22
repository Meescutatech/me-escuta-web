/**
 * Lógica PURA da ficha do lead + tarefas (Rodada 8) — sem I/O, client-safe, testável com
 * node --test. Leitura/escrita ficam em lib/dados/lead-painel.ts e app/(app)/lead/actions.ts.
 *
 * CONTRATOS (combinados com as Trilhas DB/Dados — não mudar sem avisar o Orquestrador):
 *  - Definição da ficha: core.config chave 'ficha_lead' → payload { grupos: [{ chave, nome,
 *    campos: [{ slug, nome, tipo, opcoes?, editavel?, kommo_field_id? }] }] }. O parser abaixo
 *    é tolerante (chave/slug/id, campos soltos sem grupos) porque a config nasce em trilha
 *    paralela — config ausente/inválida → null (UI mostra "ficha não configurada").
 *  - Escrita: evento `lead_atualizado` payload `campos: {"<slug>": <valor|null>}` (null = limpar).
 */

export type TipoCampo = "texto" | "numero" | "booleano" | "opcao" | "data";

export interface CampoFicha {
  slug: string;
  nome: string;
  tipo: TipoCampo;
  opcoes: string[];
  editavel: boolean;
}

export interface GrupoFicha {
  chave: string;
  nome: string;
  campos: CampoFicha[];
}

const TIPOS: TipoCampo[] = ["texto", "numero", "booleano", "opcao", "data"];

function parseCampo(c: any): CampoFicha | null {
  const slug = String(c?.slug ?? c?.chave ?? c?.id ?? "").trim();
  if (!slug) return null; // sem slug não há como escrever o evento — campo fora
  const tipoRaw = String(c?.tipo ?? "texto").toLowerCase();
  const tipo = (TIPOS as string[]).includes(tipoRaw) ? (tipoRaw as TipoCampo) : "texto";
  const opcoes = Array.isArray(c?.opcoes) ? c.opcoes.map(String).filter(Boolean) : [];
  return {
    slug,
    nome: String(c?.nome ?? slug),
    tipo,
    opcoes,
    editavel: c?.editavel === true,
  };
}

/** Config vigente → grupos da ficha. Qualquer coisa fora do esperado degrada pra null (honesto). */
export function parseConfigFicha(payload: unknown): GrupoFicha[] | null {
  const p = payload as any;
  let grupos: any[] | null = null;
  if (Array.isArray(p?.grupos)) grupos = p.grupos;
  else if (Array.isArray(p?.campos)) grupos = [{ chave: "ficha", nome: "Ficha", campos: p.campos }];
  if (!grupos) return null;

  const resultado: GrupoFicha[] = [];
  for (const g of grupos) {
    const campos = (Array.isArray(g?.campos) ? g.campos : [])
      .map(parseCampo)
      .filter((c: CampoFicha | null): c is CampoFicha => c !== null);
    if (campos.length === 0) continue;
    const chave = String(g?.chave ?? g?.id ?? g?.nome ?? resultado.length);
    resultado.push({ chave, nome: String(g?.nome ?? chave), campos });
  }
  return resultado.length > 0 ? resultado : null;
}

/** tags do lead (core.lead.tags, jsonb) — aceita ["a"] e [{nome:"a"}]; resto vira []. */
export function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => (typeof t === "string" ? t : String((t as any)?.nome ?? (t as any)?.name ?? "")))
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Valor projetado (core.lead_campo.valor) → texto de exibição. Vazio = "—" honesto. */
export function valorParaTexto(tipo: TipoCampo, valor: unknown): string {
  if (valor == null || valor === "") return "—";
  if (tipo === "booleano") {
    if (valor === true || valor === "true" || valor === "sim" || valor === "Sim") return "Sim";
    if (valor === false || valor === "false" || valor === "nao" || valor === "não" || valor === "Não") return "Não";
    return String(valor);
  }
  if (tipo === "numero") {
    const n = typeof valor === "number" ? valor : Number(valor);
    return Number.isFinite(n) ? n.toLocaleString("pt-BR") : String(valor);
  }
  if (tipo === "data") {
    const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return String(valor);
  }
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

/** Valor projetado → valor inicial do editor (input/select). */
export function valorParaInput(tipo: TipoCampo, valor: unknown): string {
  if (valor == null) return "";
  if (tipo === "booleano") {
    if (valor === true || valor === "true" || valor === "sim" || valor === "Sim") return "sim";
    if (valor === false || valor === "false" || valor === "nao" || valor === "não" || valor === "Não") return "nao";
    return "";
  }
  if (tipo === "data") {
    const m = String(valor).match(/^\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : "";
  }
  return String(valor);
}

export type ValorCampo = string | number | boolean | null;

/**
 * Editor → valor do payload `campos` (contrato: null limpa o campo). Número aceita vírgula
 * decimal pt-BR; inválido NÃO vira evento — volta erro pro editor.
 */
export function inputParaValor(
  tipo: TipoCampo,
  input: string,
): { ok: true; valor: ValorCampo } | { ok: false; erro: string } {
  const s = input.trim();
  if (s === "") return { ok: true, valor: null };
  if (tipo === "numero") {
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n)) return { ok: false, erro: "número inválido" };
    return { ok: true, valor: n };
  }
  if (tipo === "booleano") {
    if (s === "sim") return { ok: true, valor: true };
    if (s === "nao") return { ok: true, valor: false };
    return { ok: false, erro: "use sim/não" };
  }
  if (tipo === "data") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, erro: "data inválida" };
    return { ok: true, valor: s };
  }
  return { ok: true, valor: s };
}

// ─────────────── datas (fuso da operação, UTC-3 fixo como no dashboard) ───────────────

function ymdSP(d: Date): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}
function hhmmSP(d: Date): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(11, 16);
}

/** "hoje 16:20" · "ontem 14:02" · "amanhã 10:00" · "21/07 09:15" — fuso America/Sao_Paulo. */
export function fmtDataHora(iso: string, agora: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = ymdSP(d);
  const hoje = ymdSP(agora);
  const difDias = Math.round((new Date(dia).getTime() - new Date(hoje).getTime()) / 86400_000);
  if (difDias === 0) return `hoje ${hhmmSP(d)}`;
  if (difDias === -1) return `ontem ${hhmmSP(d)}`;
  if (difDias === 1) return `amanhã ${hhmmSP(d)}`;
  const [, m, dd] = dia.split("-");
  return `${dd}/${m} ${hhmmSP(d)}`;
}

// ─────────────── tarefas: prazo ───────────────

export type NivelPrazo = "atrasada" | "breve" | null;

/** Nível de urgência do prazo: vencido → atrasada; nas próximas 24h → breve. */
export function nivelPrazo(prazoIso: string | null, agoraMs: number): NivelPrazo {
  if (!prazoIso) return null;
  const t = new Date(prazoIso).getTime();
  if (Number.isNaN(t)) return null;
  if (t < agoraMs) return "atrasada";
  if (t < agoraMs + 24 * 3600_000) return "breve";
  return null;
}
