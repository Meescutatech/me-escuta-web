import { criarClienteServidor } from "@/lib/supabase/server";
import {
  ordenarTemplates,
  type CategoriaTemplate,
  type DefinicaoTemplate,
  type StatusTemplate,
  type TemplateWhatsapp,
} from "@/lib/templates-whatsapp";

/**
 * Leitura de `core.template_whatsapp` (SPEC-B §4). O tipo e toda a lógica são puros e moram em
 * `lib/templates-whatsapp.ts`; aqui só a ida ao banco.
 *
 * ⚠ **HOJE A TABELA NÃO EXISTE.** Medido em 07/08/2026: a projeção está sendo criada em paralelo
 * (trilha B1). Esta leitura foi escrita contra a forma DECLARADA na spec e degrada quando a
 * tabela não estiver lá — que é exatamente o caso do dia em que este código foi escrito.
 *
 * Degrade honesto (padrão D-C6, o mesmo de `lerTemplates`): tabela ausente ou erro de leitura ⇒
 * **lista vazia COM SAÍDA**, nunca tela morta. A tela diz o que falta e oferece o próximo passo;
 * o popover do composer diz "nenhum template aprovado ainda para este número" e leva para
 * escrever o primeiro. Tela vazia sem saída é o que faz alguém abrir outra aba.
 */

export interface TemplatesWhatsappLidos {
  templates: TemplateWhatsapp[];
  /** `true` = a leitura falhou (a projeção da SPEC-B ainda não subiu neste ambiente). */
  indisponivel: boolean;
}

const VAZIO: TemplatesWhatsappLidos = { templates: [], indisponivel: true };

const COLUNAS =
  "id,canal_id,nome,idioma,categoria,definicao,status,meta_template_id,motivo_status,autor_id,criado_em,atualizado_em,arquivado_em";

/**
 * `categoria_submetida` é pedida num SEGUNDO braço, e não junto: o PostgREST recusa a consulta
 * INTEIRA por uma coluna inexistente, e a spec (§4) não crava essa coluna na projeção — ela é a
 * peça que falta para a tela cumprir o §8.4 ("mostrar quando a Meta recategorizou"). Pedindo
 * separado, o dia em que a Turbina acrescentar a coluna a tela liga sozinha; enquanto isso a
 * lista aparece inteira, só sem a seta de recategorização. Ver ARB no relatório da B4.
 */
const COLUNAS_COM_RECATEGORIZACAO = `${COLUNAS},categoria_submetida`;

const STATUS_VALIDOS: StatusTemplate[] = [
  "rascunho",
  "enviando",
  "pendente",
  "aprovado",
  "recusado",
  "pausado",
  "desativado",
];
const CATEGORIAS_VALIDAS: CategoriaTemplate[] = ["UTILITY", "MARKETING", "AUTHENTICATION"];

/**
 * Status desconhecido NÃO derruba a lista e NÃO vira "aprovado": vira `desativado`, que é o
 * estado que não deixa enviar. É a mesma escolha do projetor da §4 diante de um status que não
 * conhece — só que aqui a consequência de errar para o lado permissivo seria mandar mensagem
 * apoiada num template que a Meta não aprovou.
 */
function comoStatus(v: unknown): StatusTemplate {
  const s = String(v ?? "");
  return (STATUS_VALIDOS as string[]).includes(s) ? (s as StatusTemplate) : "desativado";
}

function comoCategoria(v: unknown): CategoriaTemplate {
  const c = String(v ?? "").toUpperCase();
  return (CATEGORIAS_VALIDAS as string[]).includes(c) ? (c as CategoriaTemplate) : "UTILITY";
}

function comoCategoriaOuNulo(v: unknown): CategoriaTemplate | null {
  const c = String(v ?? "").toUpperCase();
  return (CATEGORIAS_VALIDAS as string[]).includes(c) ? (c as CategoriaTemplate) : null;
}

/** O jsonb pode vir torto de um replay antigo; a tela nunca quebra por causa disso. */
function comoDefinicao(v: unknown): DefinicaoTemplate {
  const d = (v ?? {}) as Record<string, unknown>;
  const botoes = Array.isArray(d.botoes) ? d.botoes : [];
  const exemplos = d.exemplos && typeof d.exemplos === "object" ? (d.exemplos as Record<string, unknown>) : {};
  return {
    cabecalho: typeof d.cabecalho === "string" && d.cabecalho ? d.cabecalho : null,
    corpo: typeof d.corpo === "string" ? d.corpo : "",
    rodape: typeof d.rodape === "string" && d.rodape ? d.rodape : null,
    botoes: botoes
      .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
      .map((b) => ({
        tipo: (["QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE"].includes(String(b.tipo))
          ? String(b.tipo)
          : "QUICK_REPLY") as TemplateWhatsapp["definicao"]["botoes"][number]["tipo"],
        texto: String(b.texto ?? ""),
        url: b.url ? String(b.url) : null,
        telefone: b.telefone ? String(b.telefone) : null,
      })),
    exemplos: Object.fromEntries(Object.entries(exemplos).map(([k, val]) => [k, String(val ?? "")])),
  };
}

export async function lerTemplatesWhatsapp(): Promise<TemplatesWhatsappLidos> {
  try {
    const supabase = criarClienteServidor();
    const consultar = (colunas: string) =>
      supabase.schema("core").from("template_whatsapp").select(colunas).limit(500);

    let { data, error } = await consultar(COLUNAS_COM_RECATEGORIZACAO);
    if (error) ({ data, error } = await consultar(COLUNAS));
    if (error || !data) return VAZIO;

    // Rótulo do canal: o apelido do número, para a coluna "Número" da lista. Falha de leitura
    // aqui NÃO derruba a lista — o template aparece com o canal em branco, que é honesto, em vez
    // de sumir da tela por causa de uma coluna decorativa.
    const apelidos = await lerApelidosDeCanal(supabase);

    const templates = (data as any[])
      .filter((t) => t?.id && t?.nome)
      .map(
        (t): TemplateWhatsapp => ({
          id: String(t.id),
          canal_id: String(t.canal_id ?? ""),
          nome: String(t.nome),
          idioma: String(t.idioma ?? "pt_BR"),
          categoria: comoCategoria(t.categoria),
          definicao: comoDefinicao(t.definicao),
          status: comoStatus(t.status),
          meta_template_id: t.meta_template_id ? String(t.meta_template_id) : null,
          motivo_status: t.motivo_status ? String(t.motivo_status) : null,
          categoria_submetida: comoCategoriaOuNulo(t.categoria_submetida),
          autor_id: t.autor_id ? String(t.autor_id) : null,
          criado_em: t.criado_em ? String(t.criado_em) : null,
          atualizado_em: t.atualizado_em ? String(t.atualizado_em) : null,
          arquivado_em: t.arquivado_em ? String(t.arquivado_em) : null,
          canal_rotulo: apelidos[String(t.canal_id ?? "")] ?? null,
        }),
      );

    return { templates: ordenarTemplates(templates), indisponivel: false };
  } catch {
    return VAZIO;
  }
}

/** Os canais para o seletor do construtor: `phone_number_id` → apelido. Nunca o id cru na tela. */
export interface CanalParaTemplate {
  phone_number_id: string;
  rotulo: string;
  /** `true` quando é número de teste — o selo que, por regra do M7, nunca se esconde. */
  teste: boolean;
}

export async function lerCanaisParaTemplate(): Promise<CanalParaTemplate[]> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("canal_whatsapp")
      .select("phone_number_id,apelido,numero_e164,finalidade,ativo")
      .eq("ativo", true)
      .limit(50);
    if (error || !data) return [];
    return (data as any[])
      .filter((c) => c?.phone_number_id)
      .map((c) => ({
        phone_number_id: String(c.phone_number_id),
        // O rótulo NUNCA é o `phone_number_id` (regra do M7, `regras/numero.ts`): sem apelido
        // legível, o chip degrada para texto neutro em vez de expor o id.
        rotulo: String(c.apelido ?? "").trim() || "número sem apelido",
        teste: c.finalidade === "teste",
      }));
  } catch {
    return [];
  }
}

async function lerApelidosDeCanal(
  supabase: ReturnType<typeof criarClienteServidor>,
): Promise<Record<string, string>> {
  try {
    const { data, error } = await supabase
      .schema("core")
      .from("canal_whatsapp")
      .select("phone_number_id,apelido")
      .limit(50);
    if (error || !data) return {};
    const mapa: Record<string, string> = {};
    for (const c of data as any[]) {
      const apelido = String(c?.apelido ?? "").trim();
      if (c?.phone_number_id && apelido) mapa[String(c.phone_number_id)] = apelido;
    }
    return mapa;
  } catch {
    return {};
  }
}
