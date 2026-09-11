import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * O QUE O AGENTE CRIOU — o histórico real, lido de `core.v_tarefa`.
 *
 * 11/09/2026. A tela de um agente tinha uma seção "Últimas execuções" que, fora do ensaio, sempre
 * caía num vazio dizendo "ainda não executou · está desligado". As duas metades eram falsas: o
 * Jarvis está `ativo = true` e criou tarefas de verdade em produção, com motivo e próximo passo
 * escritos por ele. O trace passo a passo (o que o componente desenha) **não é gravado** — nunca
 * foi —, então não existe de onde tirá-lo.
 *
 * O que existe é a CONSEQUÊNCIA de cada passada: a tarefa. `origem = 'jarvis_conversa'` é a marca
 * que o próprio runtime grava (mesma coluna que `lib/tarefas/foco.ts` já usa para desenhar o arco
 * do Jarvis na lista). Uma tarefa = uma execução observável, com hora, lead e razão.
 *
 * Devolve `null` quando não conseguiu ler. Quem chama NÃO mostra a seção nesse caso — seção vazia
 * afirmando "ainda não executou" é exatamente o defeito que este arquivo existe para tirar.
 */

export interface TarefaCriadaPeloAgente {
  id: string;
  titulo: string;
  criado_em: string;
  status: string;
  lead_id: string | null;
  lead_nome: string | null;
  por_que: string | null;
  fazer: string | null;
  responsavel: string | null;
}

const COLS = "id,titulo,criado_em,status,lead_id,por_que,fazer,responsavel,origem";

export async function lerTarefasCriadasPeloAgente(
  origem = "jarvis_conversa",
  limite = 25,
): Promise<TarefaCriadaPeloAgente[] | null> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("v_tarefa")
      .select(COLS)
      .eq("origem", origem)
      .order("criado_em", { ascending: false })
      .limit(limite);
    if (error || !data) return null;

    const linhas: TarefaCriadaPeloAgente[] = (data as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      titulo: String(r.titulo ?? "(sem título)"),
      criado_em: String(r.criado_em ?? ""),
      status: String(r.status ?? "pendente"),
      lead_id: r.lead_id != null ? String(r.lead_id) : null,
      lead_nome: null,
      por_que: (r.por_que as string | null) ?? null,
      fazer: (r.fazer as string | null) ?? null,
      responsavel: (r.responsavel as string | null) ?? null,
    }));

    // nome do lead em UMA consulta — a lista é curta por construção (teto de 25)
    const ids = [...new Set(linhas.map((l) => l.lead_id).filter((x): x is string => x != null))];
    if (ids.length > 0) {
      const { data: leads } = await supabase
        .schema("core")
        .from("v_lead_card")
        .select("lead_id,nome")
        .in("lead_id", ids);
      const nomes = new Map<string, string>();
      for (const l of (leads ?? []) as Array<Record<string, unknown>>) {
        if (l.lead_id && l.nome) nomes.set(String(l.lead_id), String(l.nome));
      }
      for (const l of linhas) if (l.lead_id) l.lead_nome = nomes.get(l.lead_id) ?? null;
    }

    return linhas;
  } catch {
    return null;
  }
}
