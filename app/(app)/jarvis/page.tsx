import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerPapelAtual } from "@/components/configuracoes/dados/porta";
import { ConversaJarvis } from "@/components/jarvis/conversa";
import { interpretarContexto } from "@/lib/jarvis/contrato";

export const dynamic = "force-dynamic";

/**
 * /jarvis (F9) — o chat. Lê `?contexto=` (contrato com a F4: `encodeURIComponent(pathname+search)`)
 * e injeta no primeiro turno. O painel de melhoria de prompt que vivia aqui foi para
 * /configuracoes/agentes/jarvis.
 *
 * Identidade vem do servidor (uid + papel); o cliente nunca a informa.
 */
export default async function JarvisPage({ searchParams }: { searchParams: { contexto?: string } }) {
  const supabase = criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const papel = await lerPapelAtual();
  const contexto = interpretarContexto(searchParams.contexto ?? null);

  if (!papel) {
    return (
      <section className="mx-auto max-w-[640px] px-6 py-10 text-[14px] text-suave">
        Sua conta ainda não tem papel ativo no workspace — peça a um admin em Configurações → Membros.
      </section>
    );
  }

  return (
    <section className="h-[calc(100vh-var(--altura-topo))]">
      <ConversaJarvis usuarioId={user.id} papel={papel} contextoInicial={contexto} />
    </section>
  );
}
