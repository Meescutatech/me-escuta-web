import { criarClienteServidor } from "@/lib/supabase/server";
import { ETAPAS_PADRAO, lerEtapasReais } from "./funil";
import { lerConversas } from "./conversas";

/**
 * Contadores da sidebar (r9-tokens §6) — mesma sessão/RLS:
 *  - funil: total de leads em etapas ABERTAS (head-count no banco, igual ao dashboard);
 *  - conversas: não-lidas com o MESMO proxy honesto do inbox (última mensagem é de entrada,
 *    via lerConversas — um número diferente do badge da lista seria pior que o custo da query).
 * Indisponível = null → a sidebar simplesmente não mostra contador (nada de zero inventado).
 */
export interface ContadoresSidebar {
  funil: number | null;
  naoLidas: number | null;
}

export async function lerContadoresSidebar(): Promise<ContadoresSidebar> {
  try {
    const supabase = criarClienteServidor();
    const [funil, naoLidas] = await Promise.all([
      (async () => {
        const etapas = (await lerEtapasReais()) ?? ETAPAS_PADRAO;
        const abertas = etapas.filter((e) => e.tipo === "aberto").map((e) => e.chave);
        const { count, error } = await supabase
          .schema("core")
          .from("v_lead_card")
          .select("*", { count: "exact", head: true })
          .in("etapa", abertas);
        return error ? null : count ?? 0;
      })(),
      (async () => {
        const conversas = await lerConversas();
        return conversas.filter((c) => c.nao_lida).length;
      })(),
    ]);
    return { funil, naoLidas };
  } catch {
    return { funil: null, naoLidas: null };
  }
}
