import type { Papel } from "@/lib/membros";

/**
 * TEMPLATES DE MENSAGEM — lógica pura (SPEC-TEMPLATES-MENSAGENS, GO 25/07).
 * Resposta rápida com variáveis {{nome}}, inserida pelo menu `/` do composer e enviada pelo
 * caminho EXISTENTE (enviar_mensagem_humana). NÃO é template HSM da Meta (janela 24h).
 *
 * Três regras que moram aqui e em nenhum outro lugar:
 *  · substituição acontece NA ESCOLHA do template (nunca por parsing no envio) — §5.2;
 *  · placeholder que sobrar ({{...}}) BLOQUEIA o envio local com aviso — §5.3, GO 10.5;
 *  · o catálogo de variáveis é do web; o banco não o conhece de propósito — §2.1.
 *
 * Permissão: espelha a matriz §4 para esconder botão que a porta recusaria — a defesa real
 * vive no banco (0046: guarda admin/owner em api.registrar_evento), aqui é só ergonomia.
 */

export interface TemplateMensagem {
  id: string;
  titulo: string;
  atalho: string;
  corpo: string;
  ativo: boolean;
  autor_id: string | null;
  atualizado_em: string | null;
  arquivado_em: string | null;
  motivo_arquivo: string | null;
}

/** Só as variáveis CONFIÁVEIS chegam aqui (§5.2): nome ruim de lead nem entra no objeto. */
export interface VariaveisTemplate {
  nome?: string;
  telefone?: string;
  atendente?: string;
}

/** Catálogo v1 (GO 10.3). A ficha do lead é a extensão natural — fora da v1. */
export const CATALOGO_VARIAVEIS = [
  { slug: "nome", rotulo: "Nome do lead", exemplo: "Maria" },
  { slug: "telefone", rotulo: "Telefone do lead", exemplo: "(31) 99999-0000" },
  { slug: "atendente", rotulo: "Quem está enviando", exemplo: "Sara" },
] as const;

/** Limite REAL do WhatsApp (Meta Cloud API, text.body) — o mesmo V8 da porta (0046). */
export const LIMITE_CORPO = 4096;

/** Comandos fixos do composer — a porta também recusa (V5), aqui é ergonomia do form. */
export const ATALHOS_RESERVADOS = ["nota", "tarefa", "template"];

const RE_SLUG = /^[a-z0-9_]{2,32}$/;
/** Escrita canônica: {{slug}}, com tolerância a espaço interno ({{ nome }}). */
const RE_VARIAVEL = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;
/** Qualquer coisa com cara de placeholder — {{Nome}}, {{x y}} — conta como pendente. */
const RE_PLACEHOLDER = /\{\{([^{}]*)\}\}/g;

export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Mesma gramática do V3 da porta (0046): [a-z0-9_]{2,32}. */
export function atalhoValido(atalho: string): boolean {
  return RE_SLUG.test(atalho) && !ATALHOS_RESERVADOS.includes(atalho);
}

/** "Boas-vindas à Me Escuta" → "boas_vindas_a_me_escuta" (sugestão editável do form). */
export function atalhoDeTitulo(titulo: string): string {
  return normalizar(titulo)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

/**
 * Substitui as variáveis do catálogo QUE TÊM VALOR; o resto fica literal no texto — e é o
 * placeholder literal que trava o envio depois (§5.3). Nunca inventa valor.
 */
export function substituirVariaveis(corpo: string, variaveis: VariaveisTemplate): string {
  return corpo.replace(RE_VARIAVEL, (original, slug: string) => {
    const valor = (variaveis as Record<string, string | undefined>)[slug];
    return valor && valor.trim() ? valor : original;
  });
}

/** Placeholders que sobraram no texto (únicos, na ordem em que aparecem). */
export function placeholdersPendentes(texto: string): string[] {
  const vistos = new Set<string>();
  for (const m of texto.matchAll(RE_PLACEHOLDER)) {
    const cru = `{{${m[1].trim()}}}`;
    if (!vistos.has(cru)) vistos.add(cru);
  }
  return [...vistos];
}

/** Variáveis usadas no corpo que NÃO existem no catálogo — aviso na edição (§5.3). */
export function variaveisForaDoCatalogo(corpo: string): string[] {
  const conhecidas = new Set<string>(CATALOGO_VARIAVEIS.map((v) => v.slug));
  const fora = new Set<string>();
  for (const m of corpo.matchAll(RE_PLACEHOLDER)) {
    const slug = m[1].trim();
    if (!conhecidas.has(slug)) fora.add(slug);
  }
  return [...fora];
}

/** Filtro do menu `/`: prefixo do atalho OU substring do título, sem acento/caixa. */
export function filtrarTemplates(templates: TemplateMensagem[], termo: string): TemplateMensagem[] {
  const alvo = normalizar(termo);
  return templates.filter(
    (t) => t.ativo && (normalizar(t.atalho).startsWith(alvo) || normalizar(t.titulo).includes(alvo)),
  );
}

/** Criar/editar/arquivar template: admin e owner (§4). Todo membro USA — isso não passa por aqui. */
export function podeGerirTemplates(meuPapel: Papel | null): boolean {
  return meuPapel === "admin" || meuPapel === "owner";
}

/** Validação do form ANTES da porta — os mesmos V2/V3/V8, para recusa instantânea com motivo. */
export function validarFormTemplate(f: { titulo: string; atalho: string; corpo: string }): string | null {
  if (!f.titulo.trim()) return "dê um título ao template";
  if (!f.corpo.trim()) return "escreva o corpo da mensagem";
  if (ATALHOS_RESERVADOS.includes(f.atalho)) return `"/${f.atalho}" é comando do composer — escolha outro atalho`;
  if (!RE_SLUG.test(f.atalho)) return "atalho: use letras minúsculas, números e _, de 2 a 32 caracteres";
  if (f.corpo.length > LIMITE_CORPO) return `o corpo passou de ${LIMITE_CORPO} caracteres — o WhatsApp não aceita`;
  return null;
}
