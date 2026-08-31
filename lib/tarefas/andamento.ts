import { criarClienteServidor } from "@/lib/supabase/server";
import { ensaioTarefasLigado, visaoTarefasDeEnsaio } from "@/lib/dados/tarefas-ensaio";

/**
 * Leitura do "EM ANDAMENTO" (F8 · 0305): os ids das tarefas pendentes com `iniciada_em`.
 *
 * Fica separada de `lib/dados/tarefas-visao.ts` de propósito: aquela leitura é de outra frente e
 * lista colunas por nome — acrescentar `iniciada_em` lá quebraria a tela inteira em produção
 * enquanto a 0305 não estiver aplicada (a view recusa a coluna → lista vazia). Aqui a degradação é
 * honesta e local: sem a coluna, o conjunto vem vazio e o quadro mostra tudo em A fazer.
 */
export interface EmAndamento {
  ids: string[];
  /** false = a coluna ainda não existe no banco (0305 não aplicada) ou a leitura falhou. */
  disponivel: boolean;
}

export async function lerEmAndamento(): Promise<EmAndamento> {
  if (ensaioTarefasLigado()) return { ids: visaoTarefasDeEnsaio().emAndamento, disponivel: true };
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("v_tarefa")
      .select("id")
      .eq("em_andamento", true);
    if (error) return { ids: [], disponivel: false };
    return { ids: (data ?? []).map((r: { id: string }) => String(r.id)), disponivel: true };
  } catch {
    return { ids: [], disponivel: false };
  }
}
