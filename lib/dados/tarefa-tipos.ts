import { criarClienteServidor } from "@/lib/supabase/server";
import { TIPOS_TAREFA_SEMENTE, parseTiposTarefa, type TipoTarefa } from "@/lib/tarefa-tipos";

/**
 * Leitura dos TIPOS DE TAREFA (R13 / Bloco C — C6). A lista e o parser são puros e moram em
 * `lib/tarefa-tipos.ts`; aqui só a ida ao banco.
 *
 * Ordem de preferência, do mais forte pro mais fraco:
 *  1. `core.v_tipo_tarefa` — a view que o Bloco A criou na 0037 justamente para o seletor da UI
 *     (chave, rotulo, ativo, ordem). É a fonte canônica.
 *  2. `core.config` nome `tipo_tarefa` — o mesmo dado sem a view, caso ela não exista.
 *  3. semente local — só onde a 0037 ainda não subiu. Mesmas chaves da config, para que nada
 *     gravado no fallback fique órfão quando a migration chegar.
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

    const vista = await supabase
      .schema("core")
      .from("v_tipo_tarefa")
      .select("chave,rotulo,ativo,ordem")
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    if (!vista.error && vista.data && vista.data.length > 0) {
      const tipos = (vista.data as any[])
        .map((t) => ({ chave: String(t.chave), rotulo: String(t.rotulo ?? t.chave) }))
        .filter((t) => t.chave);
      if (tipos.length > 0) return { tipos, provisorio: false };
    }

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

