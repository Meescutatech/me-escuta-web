import { criarClienteServidor } from "@/lib/supabase/server";
import type { ConviteLinha, MembroLinha, Papel } from "@/lib/membros";
import { TabelaMembros } from "@/components/membros/tabela-membros";
import { lerSessaoEnsaio, DEPARTAMENTOS_ENSAIO } from "@/lib/ensaio/sessao";
import { gerarConvitesEnsaio, gerarMembrosEnsaio } from "@/lib/ensaio/fixtures/membros";
import { MembrosEnsaio } from "@/components/ensaio/membros";

export const dynamic = "force-dynamic";

/**
 * Configurações > Membros (mockup configuracoes-membros-v2.html):
 * título + 1 linha de descrição + convite em UMA linha de formulário + UMA tabela
 * (ativos + convites pendentes juntos). Leitura direto das projeções via RLS:
 * membro comum não recebe convites (policy 0035) e a UI degrada pra leitura.
 */
export default async function MembrosPage() {
  // W-D2 · modo ensaio: a tela nova, com fixture, sem banco.
  const ensaio = lerSessaoEnsaio();
  if (ensaio) {
    const agora = new Date();
    return (
      <MembrosEnsaio
        meuId={ensaio.id}
        meuPapel={ensaio.papel}
        membros={gerarMembrosEnsaio(agora)}
        convites={gerarConvitesEnsaio(agora)}
        departamentos={DEPARTAMENTOS_ENSAIO}
        agoraIso={agora.toISOString()}
      />
    );
  }

  const supabase = criarClienteServidor();
  // getUser junto das leituras — vai à rede e não depende delas
  const [userRes, { data: papelData }, { data: membros }, { data: convites }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("api").rpc("papel_atual"),
    supabase
      .schema("core")
      .from("v_membro")
      .select("id, nome, email, papel, funcao, ativo, ultimo_acesso_em")
      .order("criado_em", { ascending: true }),
    supabase
      .schema("core")
      .from("v_convite")
      .select("id, email, papel, funcao, criado_em, expira_em, status")
      .in("status", ["pendente", "expirado"])
      .order("criado_em", { ascending: true }),
  ]);

  const user = userRes.data.user;

  return (
    <TabelaMembros
      meuId={user?.id ?? ""}
      meuPapel={(papelData as Papel | null) ?? null}
      membros={(membros ?? []) as MembroLinha[]}
      convites={(convites ?? []) as ConviteLinha[]}
    />
  );
}
