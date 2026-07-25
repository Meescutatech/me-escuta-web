import { criarClienteServidor } from "@/lib/supabase/server";
import type { TemplateMensagem } from "@/lib/templates";

/**
 * Leitura dos TEMPLATES DE MENSAGEM (SPEC-TEMPLATES-MENSAGENS §7). O tipo e toda a lógica
 * (substituição, filtro, permissão) são puros e moram em `lib/templates.ts`; aqui só a ida
 * ao banco — `core.template_mensagem` (0046), RLS de membro ativo.
 *
 * Degrade honesto (padrão D-C6): banco sem a 0046 ou erro de leitura → lista vazia. O menu
 * do composer mostra só nota/tarefa e a página de gestão mostra o vazio — nunca tela morta.
 */

export interface TemplatesLidos {
  templates: TemplateMensagem[];
  /** true = a leitura falhou (provavelmente a 0046 ainda não subiu neste ambiente). */
  indisponivel: boolean;
}

export async function lerTemplates(): Promise<TemplatesLidos> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("template_mensagem")
      .select("id,titulo,atalho,corpo,ativo,autor_id,atualizado_em,arquivado_em,motivo_arquivo")
      .limit(500);
    if (error || !data) return { templates: [], indisponivel: true };
    const templates = (data as any[])
      .filter((t) => t.id && t.atalho && typeof t.corpo === "string")
      .map(
        (t): TemplateMensagem => ({
          id: String(t.id),
          titulo: String(t.titulo ?? t.atalho),
          atalho: String(t.atalho),
          corpo: String(t.corpo),
          ativo: t.ativo !== false,
          autor_id: t.autor_id ? String(t.autor_id) : null,
          atualizado_em: t.atualizado_em ? String(t.atualizado_em) : null,
          arquivado_em: t.arquivado_em ? String(t.arquivado_em) : null,
          motivo_arquivo: t.motivo_arquivo ? String(t.motivo_arquivo) : null,
        }),
      )
      .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
    return { templates, indisponivel: false };
  } catch {
    return { templates: [], indisponivel: true };
  }
}

/**
 * Nome REAL do membro em `core.v_membro` — a fonte do `{{atendente}}` (§5.1). De propósito
 * NÃO usa o fallback de e-mail do `lerMencionaveis`: sem nome cadastrado, a variável fica
 * não resolvida e trava o envio, em vez de mandar "aqui é a diogo.tambasco" pro cliente.
 */
export async function lerNomeMembro(usuarioId: string | null): Promise<string | null> {
  if (!usuarioId) return null;
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("v_membro")
      .select("nome")
      .eq("id", usuarioId)
      .maybeSingle();
    if (error || !data) return null;
    const nome = String((data as any).nome ?? "").trim();
    return nome || null;
  } catch {
    return null;
  }
}
