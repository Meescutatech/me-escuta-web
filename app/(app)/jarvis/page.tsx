import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerPapelAtual } from "@/components/configuracoes/dados/porta";
import { PerguntaJarvis } from "@/components/jarvis/pergunta";
import { interpretarContexto } from "@/lib/jarvis/contrato";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { PERGUNTAS_ROTEIRO } from "@/lib/ensaio/jarvis";

export const dynamic = "force-dynamic";

/**
 * /jarvis — pergunta e resposta em blocos (W-J, 10/09/2026 23:10, depois do "continua puro GPT").
 *
 * Lê `?contexto=` (contrato com a F4) e `?pergunta=` (o dashboard abre `/jarvis?pergunta=…`).
 * Identidade vem do servidor; em modo ensaio (`lerSessaoEnsaio`) vem da fixture, e a resposta é
 * por regra (`responderEnsaio`: as 5 perguntas do roteiro do Rodolfo; o resto devolve "ainda não
 * sei"). Fora do ensaio, o componente usa o proxy SSE `/jarvis/perguntar` (F9), inalterado.
 *
 * O chat de bolhas (`ConversaJarvis`) continua existindo para o painel lateral do header.
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
      <section className="px-6 py-10 text-[14px] text-muted-foreground">
        Sua conta ainda não tem papel ativo no workspace — peça a um admin em Configurações → Membros.
      </section>
    );
  }

  return (
    <section className="min-h-[calc(100vh-var(--altura-topo))]">
      <PerguntaJarvis
        usuarioId={usuarioId}
        papel={papel}
        contexto={contexto}
        perguntaInicial={pergunta}
        enviarAoAbrir
        ensaio={Boolean(ensaio)}
        sugestoes={ensaio ? PERGUNTAS_ROTEIRO : undefined}
      />
    </section>
  );
}
