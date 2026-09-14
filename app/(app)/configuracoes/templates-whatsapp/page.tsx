import { criarClienteServidor } from "@/lib/supabase/server";
import { lerTemplatesWhatsapp } from "@/lib/dados/templates-whatsapp";
import type { Papel } from "@/lib/membros";
import { ListaTemplatesWhatsapp } from "@/components/templates-whatsapp/lista-templates-whatsapp";

export const dynamic = "force-dynamic";

/**
 * Configurações › Templates de WhatsApp (SPEC-B §8).
 *
 * Rota IRMÃ E SEPARADA de `/configuracoes/templates`, que é resposta rápida e já está em
 * produção. Não fundir: a rota separada é o que mantém os dois conceitos separados na cabeça de
 * quem usa, e o custo de separar agora é zero.
 *
 * Server component sem lógica: papel + lista em paralelo → client component. Todo membro VÊ (é o
 * catálogo do que dá para enviar fora da janela); só admin/owner criam, submetem e arquivam — a
 * UI esconde o que a porta recusaria, e a porta é quem recusa de verdade.
 */
export default async function TemplatesWhatsappPage() {
  const supabase = criarClienteServidor();
  const [papelRes, lidos] = await Promise.all([
    supabase.schema("api").rpc("papel_atual"),
    lerTemplatesWhatsapp(),
  ]);

  return (
    <ListaTemplatesWhatsapp
      meuPapel={(papelRes.data ?? null) as Papel | null}
      templates={lidos.templates}
      indisponivel={lidos.indisponivel}
    />
  );
}
