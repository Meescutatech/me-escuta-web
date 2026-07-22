import { criarClienteServidor } from "@/lib/supabase/server";
import { TIPOS_TAREFA_SEMENTE, parseTiposTarefa, type TipoTarefa } from "@/lib/tarefa-tipos";

/**
 * Leitura dos TIPOS DE TAREFA da config `tipo_tarefa` (R13 / Bloco C — C6). A lista e o parser
 * são puros e moram em `lib/tarefa-tipos.ts`; aqui só a ida ao banco, com degrade pra semente.
 */

export type { TipoTarefa };

export interface TiposDeTarefa {
  tipos: TipoTarefa[];
  /** true = a config ainda não existe e estamos na semente local. */
  provisorio: boolean;
}

export async function lerTiposTarefa(): Promise<TiposDeTarefa> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("v_config_vigente")
      .select("payload")
      .eq("nome", "tipo_tarefa")
      .maybeSingle();
    if (error || !data) return { tipos: TIPOS_TAREFA_SEMENTE, provisorio: true };
    const tipos = parseTiposTarefa((data as any).payload);
    return tipos ? { tipos, provisorio: false } : { tipos: TIPOS_TAREFA_SEMENTE, provisorio: true };
  } catch {
    return { tipos: TIPOS_TAREFA_SEMENTE, provisorio: true };
  }
}

