import { criarClienteServidor } from "@/lib/supabase/server";
import type { CanalEnvioComposer } from "@/components/conversas/composer";

/**
 * OS NÚMEROS PELOS QUAIS ESTA PESSOA PODE ENVIAR — a leitura real, 11/09/2026.
 *
 * Até hoje o seletor "Enviando por X ▾" existia SÓ no ramo de ensaio de `/conversas`, alimentado
 * por fixture. O caminho real chamava o mesmo `<Inbox>` sem a prop, e `canaisEnvio` caía no default
 * `null` — que no componente significa "sem seletor" e também esconde o botão "Nova conversa"
 * (`inbox.tsx:1106`). Não era dado faltando: era fiação que nunca foi feita.
 *
 * Quem decide a lista é o BANCO, não esta função: `api.canais_de_envio(uid)` (0337/D91) aplica o
 * escopo por departamento e a posse do canal. Aqui só se traduz id → o que o composer desenha.
 * Fazer o recorte aqui seria refazer a regra de permissão em TypeScript, longe do lugar onde ela
 * é testada — e as duas cópias divergiriam no primeiro cargo novo.
 *
 * Degrada em silêncio para lista vazia: sem seletor é o comportamento de sempre, e é melhor que
 * derrubar a caixa de entrada inteira porque um número não pôde ser lido.
 */
export async function lerCanaisDeEnvio(uid: string | null): Promise<CanalEnvioComposer[]> {
  if (!uid) return [];
  try {
    const supabase = criarClienteServidor();

    // `setof text` — o PostgREST devolve array de string, ou de objeto de uma chave conforme a
    // versão. As duas formas são normalizadas aqui em vez de se apostar numa.
    const { data: permitidos, error: erroRpc } = await supabase.schema("api").rpc("canais_de_envio");
    if (erroRpc || !permitidos) return [];
    const ids = (Array.isArray(permitidos) ? permitidos : [])
      .map((p) => (typeof p === "string" ? p : (p as Record<string, unknown>)?.canais_de_envio))
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    if (ids.length === 0) return [];

    const { data: canais, error: erroCanais } = await supabase
      .schema("core")
      .from("v_canal_whatsapp")
      .select("canal_id,nome,numero,provedor,finalidade,responsavel_id,ativo")
      .in("canal_id", ids);
    if (erroCanais || !canais) return [];

    return canais
      .filter((c) => c.ativo !== false)
      .map((c) => ({
        id: String(c.canal_id),
        apelido: String(c.nome ?? c.canal_id),
        numero: String(c.numero ?? ""),
        provedor: c.provedor === "nao_oficial" ? ("nao_oficial" as const) : ("waba" as const),
        // R2 do contrato D91: o número de produção vem pré-selecionado.
        producao: c.finalidade === "producao" && c.provedor !== "nao_oficial",
        proprio: c.responsavel_id === uid,
      }))
      .sort((a, b) => Number(b.producao) - Number(a.producao) || a.apelido.localeCompare(b.apelido, "pt-BR"));
  } catch {
    return [];
  }
}
