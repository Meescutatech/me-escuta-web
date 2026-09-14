import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerCanaisParaTemplate } from "@/lib/dados/templates-whatsapp";
import { podeGerirTemplatesWhatsapp } from "@/lib/templates-whatsapp";
import type { Papel } from "@/lib/membros";
import { ConstrutorTemplate } from "@/components/templates-whatsapp/construtor-template";

export const dynamic = "force-dynamic";

/**
 * Escrever um template (SPEC-B §8 · Design tela 2).
 *
 * A guarda de papel aqui é ERGONOMIA, como em toda a casa: quem não pode gerir volta para a
 * lista em vez de encarar um formulário cujo salvamento a porta recusaria. A defesa real é o
 * banco — esta é só a de não desperdiçar o trabalho de alguém.
 */
export default async function NovoTemplateWhatsappPage() {
  const supabase = criarClienteServidor();
  const [papelRes, canais] = await Promise.all([
    supabase.schema("api").rpc("papel_atual"),
    lerCanaisParaTemplate(),
  ]);

  if (!podeGerirTemplatesWhatsapp((papelRes.data ?? null) as Papel | null)) {
    redirect("/configuracoes/templates-whatsapp");
  }

  return <ConstrutorTemplate canais={canais} />;
}
