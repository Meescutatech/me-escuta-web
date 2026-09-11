import { criarClienteServidor } from "@/lib/supabase/server";
import { lerTemplates } from "@/lib/dados/templates";
import { lerMencionaveis } from "@/lib/dados/mencionaveis";
import type { Papel } from "@/lib/membros";
import { TabelaTemplates } from "@/components/templates/tabela-templates";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { gerarMensagensProntas } from "@/lib/ensaio/fixtures/operacao";
import { MensagensProntasEnsaio } from "@/components/ensaio/mensagens-prontas";

export const dynamic = "force-dynamic";

/**
 * Configurações > Templates (SPEC-TEMPLATES-MENSAGENS §7).
 * Server component sem lógica: papel + lista + nomes (autor) em paralelo → client component.
 * Todo membro vê a lista (é o catálogo do menu `/`); só admin/owner criam/editam/arquivam —
 * a UI esconde o que a porta recusaria, e a porta (0046) é quem recusa de verdade.
 */
export default async function TemplatesPage() {
  // W-D2 (2ª passada) · modo ensaio: respostas rápidas + templates HSM numa tela só.
  const ensaio = lerSessaoEnsaio();
  if (ensaio) {
    const agora = new Date();
    return <MensagensProntasEnsaio mensagens={gerarMensagensProntas(agora)} gestao={ensaio.papel === "owner" || ensaio.papel === "admin"} agoraIso={agora.toISOString()} eu={ensaio.nome} />;
  }

  const supabase = criarClienteServidor();
  const [papelRes, lidos, mencionaveis] = await Promise.all([
    supabase.schema("api").rpc("papel_atual"),
    lerTemplates(),
    lerMencionaveis(), // só para dar NOME ao autor_id da lista
  ]);
  const papel = (papelRes.data ?? null) as Papel | null;

  const nomesPorId: Record<string, string> = {};
  for (const m of mencionaveis) if (m.tipo === "humano") nomesPorId[m.id] = m.nome;

  return (
    <TabelaTemplates
      meuPapel={papel}
      templates={lidos.templates}
      indisponivel={lidos.indisponivel}
      nomesPorId={nomesPorId}
    />
  );
}
