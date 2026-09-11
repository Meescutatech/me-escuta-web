import { criarClienteServidor } from "@/lib/supabase/server";
import type { ConviteLinha, MembroLinha, Papel } from "@/lib/membros";
import { TabelaMembros } from "@/components/membros/tabela-membros";
import { lerSessaoEnsaio, DEPARTAMENTOS_ENSAIO } from "@/lib/ensaio/sessao";
import { gerarConvitesEnsaio, gerarMembrosEnsaio } from "@/lib/ensaio/fixtures/membros";
import { MembrosEnsaio } from "@/components/ensaio/membros";
import { gerarCanaisEnsaio } from "@/lib/ensaio/fixtures/canais";
import { lerDadosMembros } from "@/lib/dados/membros-reais";

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
        canais={gerarCanaisEnsaio(agora)}
        agoraIso={agora.toISOString()}
      />
    );
  }

  // 11/09 · o caminho real passa a usar a MESMA tela do ensaio (`MembrosEnsaio`), com o painel
  // lateral da pessoa. `TabelaMembros`, o componente antigo, fica só como degrade: se a leitura
  // falhar, a lista ainda aparece em vez de a tela sumir.
  const agora = new Date();
  const supabase = criarClienteServidor();
  const [userRes, { data: papelData }, dados] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("api").rpc("papel_atual"),
    lerDadosMembros(),
  ]);
  const user = userRes.data.user;
  const papel = ((papelData as Papel | null) ?? "membro") as "owner" | "admin" | "membro" | "marketing";

  if (dados) {
    return (
      <MembrosEnsaio
        meuId={user?.id ?? ""}
        meuPapel={papel}
        membros={dados.membros}
        convites={dados.convites}
        departamentos={dados.departamentos}
        canais={dados.canais}
        agoraIso={agora.toISOString()}
      />
    );
  }

  const [{ data: membros }, { data: convites }] = await Promise.all([
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

  return (
    <TabelaMembros
      meuId={user?.id ?? ""}
      meuPapel={(papelData as Papel | null) ?? null}
      membros={(membros ?? []) as MembroLinha[]}
      convites={(convites ?? []) as ConviteLinha[]}
    />
  );
}
