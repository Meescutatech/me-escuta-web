import { criarClienteServidor } from "@/lib/supabase/server";
import type { TemplateHsmNoChat } from "@/lib/conversas/template-hsm";

/**
 * Os templates HSM que PODEM sair por um canal, para o `/` do chat.
 *
 * ── Por que por CANAL, e não a lista toda ─────────────────────────────────────────────────────
 * O template pertence à WABA. `porta.validar_evento_template_envio` recusa template de um canal
 * numa conversa de outro — e recusar depois de escolher é pior que não oferecer. Medido em 14/09:
 * 317 aprovados no canal da Clara, 1 no de teste. Oferecer os 317 numa conversa do outro canal
 * seria oferecer 317 recusas.
 *
 * ── Por que só `aprovado` ─────────────────────────────────────────────────────────────────────
 * A Meta só entrega o que ela aprovou. Rascunho, em análise e recusado existem na tela de
 * Templates, que é onde se trabalha neles; no chat eles seriam escolhas que falham no envio.
 * Medido: 318 aprovados, 6 recusados.
 *
 * Degrada para `[]` e NUNCA lança: o `/` do chat continua servindo nota, tarefa e mensagem pronta
 * mesmo quando esta leitura falha. Uma seção a menos é degrade; o menu inteiro sumir não é.
 */
export async function lerTemplatesHsmDoCanal(canalId: string | null | undefined): Promise<TemplateHsmNoChat[]> {
  const canal = (canalId ?? "").trim();
  if (!canal) return [];
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("template_whatsapp")
      .select("id,nome,definicao,categoria")
      .eq("canal_id", canal)
      .eq("status", "aprovado")
      .is("arquivado_em", null)
      .order("nome");
    if (error || !data) return [];

    return data.flatMap((r) => {
      const d = (r.definicao ?? {}) as Record<string, unknown>;
      const corpoObj = (d.corpo ?? {}) as Record<string, unknown>;
      const corpo = typeof corpoObj.texto === "string" ? corpoObj.texto : "";
      // sem corpo não há o que mostrar nem o que mandar. Some da lista em vez de virar uma linha
      // em branco que a atendente clica e nada acontece.
      if (!corpo) return [];
      return [
        {
          id: String(r.id),
          nome: String(r.nome ?? ""),
          corpo,
          // os `exemplos` da Meta são o que diz o SIGNIFICADO de cada variável — é deles que sai o
          // preenchimento automático do nome (ver `armarTemplate`). Sem eles nada é preenchido, o
          // que é o degrade certo: lacuna visível em vez de chute.
          exemplos: Array.isArray(corpoObj.exemplos) ? (corpoObj.exemplos as unknown[]).map(String) : [],
          categoria: String(r.categoria ?? ""),
        },
      ];
    });
  } catch {
    return [];
  }
}
