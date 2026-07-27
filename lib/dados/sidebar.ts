import { criarClienteServidor } from "@/lib/supabase/server";
import { ETAPAS_PADRAO, lerEtapasReais } from "./funil";
import { contarNaoLidas } from "./conversas";
import { contarVencidas } from "./tarefas-visao";

/**
 * Contadores da sidebar (r9-tokens §6) — mesma sessão/RLS:
 *  - funil: total de leads em etapas ABERTAS (head-count no banco, igual ao dashboard);
 *  - conversas: não-lidas com o MESMO proxy honesto do inbox (última mensagem é de entrada) —
 *    F25: via `contarNaoLidas`, consulta ESTREITA. Antes era `lerConversas()` inteira (join de
 *    lead + 800 mensagens de prévia + config) para produzir um número, e a barra lateral vive no
 *    layout: /funil, /tarefas e /configuracoes pagavam a leitura do inbox sem mostrar o inbox.
 *    O proxy é o mesmo de propósito — um número diferente do badge da lista seria pior que o custo;
 *  - tarefas: VENCIDAS agora (R14 — a fila vermelha; head-count em core.v_tarefa).
 * Indisponível = null → a sidebar simplesmente não mostra contador (nada de zero inventado).
 */
export interface ContadoresSidebar {
  funil: number | null;
  naoLidas: number | null;
  tarefasVencidas: number | null;
}

export async function lerContadoresSidebar(): Promise<ContadoresSidebar> {
  try {
    const supabase = criarClienteServidor();
    const [funil, naoLidas, tarefasVencidas] = await Promise.all([
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
      contarNaoLidas(),
      contarVencidas(),
    ]);
    return { funil, naoLidas, tarefasVencidas };
  } catch {
    return { funil: null, naoLidas: null, tarefasVencidas: null };
  }
}
