import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerPapelAtual } from "@/components/configuracoes/dados/porta";
import { ConversaJarvis } from "@/components/jarvis/conversa";
import { interpretarContexto } from "@/lib/jarvis/contrato";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";

export const dynamic = "force-dynamic";

/**
 * /jarvis (F9) — o chat. Lê `?contexto=` (contrato com a F4: `encodeURIComponent(pathname+search)`)
 * e injeta no primeiro turno. O painel de melhoria de prompt que vivia aqui foi para
 * /configuracoes/agentes/jarvis.
 *
 * Identidade vem do servidor (uid + papel); o cliente nunca a informa.
 *
 * `?pergunta=` (W-J, 10/09): o dashboard ("Jarvis diz") abre `/jarvis?pergunta=…` nas perguntas
 * sugeridas — a pergunta vai pré-preenchida no composer e, fora do ensaio, é enviada de uma vez.
 * Em modo ensaio (`lerSessaoEnsaio`) a identidade vem da fixture, como nas outras telas do W-D2.
 */
export default async function JarvisPage({ searchParams }: { searchParams: { contexto?: string; pergunta?: string } }) {
  const ensaio = lerSessaoEnsaio();
  let usuarioId: string;
  let papel: Awaited<ReturnType<typeof lerPapelAtual>>;
  if (ensaio) {
    usuarioId = ensaio.id;
    papel = ensaio.papel;
  } else {
    const supabase = criarClienteServidor();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    usuarioId = user.id;
    papel = await lerPapelAtual();
  }
  const contexto = interpretarContexto(searchParams.contexto ?? null);
  const pergunta = (searchParams.pergunta ?? "").trim().slice(0, 500) || null;

  if (!papel) {
    return (
      <section className="mx-auto max-w-[640px] px-6 py-10 text-[14px] text-suave">
        Sua conta ainda não tem papel ativo no workspace — peça a um admin em Configurações → Membros.
      </section>
    );
  }

  return (
    <section className="h-[calc(100vh-var(--altura-topo))]">
      <ConversaJarvis usuarioId={usuarioId} papel={papel} contextoInicial={contexto} perguntaInicial={pergunta} enviarAoAbrir={!ensaio} />
    </section>
  );
}
