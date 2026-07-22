import { criarClienteServidor } from "@/lib/supabase/server";
import type { Notificacao } from "@/lib/notificacoes";

/**
 * Leitura das NOTIFICAÇÕES (Rodada 13 / Bloco B) — fonte única `core.v_notificacao` (0038),
 * na mesma sessão/RLS do resto do app. A view já corta por pessoa (menção pela RLS de
 * core.mencao; tarefa por responsável = auth.uid()), então aqui não há filtro de dono: se
 * chegou, é seu.
 *
 * Degrada HONESTO (padrão do deploy-fora-de-ordem da R6): se a 0038 ainda não está no banco,
 * a view não existe → lista vazia e o sino simplesmente não mostra contador. Nada de zero
 * inventado apresentado como "você está em dia".
 */

const TETO = 200; // a visão expandida não pagina nesta rodada — o teto é explícito

export interface LeituraNotificacoes {
  itens: Notificacao[];
  /** false = não deu pra ler (view ausente/erro). A UI esconde o contador em vez de mentir. */
  disponivel: boolean;
}

export async function lerNotificacoes(): Promise<LeituraNotificacoes> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("v_notificacao")
      .select("*")
      .order("quando", { ascending: false })
      .limit(TETO);
    if (error) return { itens: [], disponivel: false };

    const itens = (data ?? []) as Notificacao[];

    // nome do lead p/ a linha "Maria Exemplo · #4821" (uma query, não N)
    const leadIds = Array.from(new Set(itens.map((n) => n.lead_id).filter(Boolean))) as string[];
    if (leadIds.length > 0) {
      const { data: leads } = await supabase
        .schema("core")
        .from("lead")
        .select("lead_id, nome")
        .in("lead_id", leadIds);
      const nomes = new Map((leads ?? []).map((l) => [l.lead_id as string, l.nome as string | null]));
      for (const n of itens) n.lead_nome = n.lead_id ? nomes.get(n.lead_id) ?? null : null;
    }

    return { itens, disponivel: true };
  } catch {
    return { itens: [], disponivel: false };
  }
}
