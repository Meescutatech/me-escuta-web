/**
 * Lógica PURA da ficha do lead + tarefas (Rodada 8) — sem I/O, client-safe, testável com
 * node --test. Leitura/escrita ficam em lib/dados/lead-painel.ts e app/(app)/lead/actions.ts.
 *
 * CONTRATOS (validados contra a config REAL `ficha_lead` v1 no remoto, 52 campos/7 grupos):
 *  - Definição: core.config `ficha_lead` → payload { grupos: [{ nome, editavel?, campos:
 *    [{ slug, rotulo, tipo, opcoes?, kommo_field_id? }] }] }. `editavel` vem no GRUPO
 *    (Principal/Qualificação true) e vale pros campos dele; campo pode sobrescrever.
 *    Tipos reais: selecao · texto · texto_longo · data · data_hora · numero · url ·
 *    endereco · arquivo — os dois últimos não têm editor (read-only), nunca "vira texto".
 *  - Valores: core.lead_campo.valor é jsonb CRU (preserva tipo).
 *  - Escrita: evento `lead_atualizado` payload `campos: {"<slug>": <valor|null>}`
 *    (null = limpar; só slugs da config). Contrato fixo — mudar só via Orquestrador.
 */

export type TipoCampo =
  | "texto"
  | "texto_longo"
  | "numero"
  | "booleano"
  | "selecao"
  | "data"
  | "data_hora"
  | "url"
  | "outro"; // endereco/arquivo/desconhecido — exibe, não edita

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

const TIPOS_EDITAVEIS: TipoCampo[] = [
  "texto", "texto_longo", "numero", "booleano", "selecao", "data", "data_hora", "url",
];

function normalizarTipo(raw: unknown): TipoCampo {
  const t = String(raw ?? "texto").toLowerCase();
  if (t === "opcao") return "selecao"; // alias
  return (TIPOS_EDITAVEIS as string[]).includes(t) ? (t as TipoCampo) : "outro";
}

function parseCampo(c: any, grupoEditavel: boolean): CampoFicha | null {
  const slug = String(c?.slug ?? c?.chave ?? c?.id ?? "").trim();
  if (!slug) return null; // sem slug não há como escrever o evento — campo fora
  const tipo = normalizarTipo(c?.tipo);
  const opcoes = Array.isArray(c?.opcoes) ? c.opcoes.map(String).filter(Boolean) : [];
  // editavel: campo sobrescreve; senão herda do grupo. Tipo sem editor nunca é editável.
  const editavelBase = typeof c?.editavel === "boolean" ? c.editavel : grupoEditavel;
  return {
    slug,
    nome: String(c?.nome ?? c?.rotulo ?? slug),
    tipo,
    opcoes,
    editavel: editavelBase && tipo !== "outro",
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
    const grupoEditavel = g?.editavel === true;
    const campos = (Array.isArray(g?.campos) ? g.campos : [])
      .map((c: any) => parseCampo(c, grupoEditavel))
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

// ─────────────── datas (fuso da operação, UTC-3 fixo como no dashboard) ───────────────

const OFFSET_SP = "-03:00";

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

// ─────────────── valor projetado ⇄ exibição/editor ───────────────

/** Valor projetado (core.lead_campo.valor, jsonb cru) → texto de exibição. Vazio = "—". */
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
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(valor);
  }
  if (tipo === "data_hora") {
    const d = new Date(String(valor));
    if (Number.isNaN(d.getTime())) return String(valor);
    const [ano, mes, dia] = ymdSP(d).split("-");
    return `${dia}/${mes}/${ano} ${hhmmSP(d)}`;
  }
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

/** Valor projetado → valor inicial do editor (input/select/datetime-local). */
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
  if (tipo === "data_hora") {
    const d = new Date(String(valor));
    if (Number.isNaN(d.getTime())) return "";
    return `${ymdSP(d)}T${hhmmSP(d)}`; // datetime-local no fuso da operação
  }
  return String(valor);
}

export type ValorCampo = string | number | boolean | null;

/**
 * Editor → valor do payload `campos` (contrato: null limpa o campo). Número aceita vírgula
 * decimal pt-BR; data_hora entra no fuso da operação e sai ISO; inválido NÃO vira evento.
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
  if (tipo === "data_hora") {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return { ok: false, erro: "data/hora inválida" };
    const d = new Date(`${s}:00${OFFSET_SP}`);
    if (Number.isNaN(d.getTime())) return { ok: false, erro: "data/hora inválida" };
    return { ok: true, valor: d.toISOString() };
  }
  if (tipo === "outro") return { ok: false, erro: "campo sem editor" };
  return { ok: true, valor: s };
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
