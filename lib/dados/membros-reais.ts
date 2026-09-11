import { criarClienteServidor } from "@/lib/supabase/server";
import type { Departamento } from "@/lib/departamentos/escopo";
import type { CanalEnsaio } from "@/lib/ensaio/fixtures/canais";
import type { ConviteEnsaio, MembroEnsaio, VinculoDepartamento } from "@/lib/ensaio/fixtures/membros";

export interface DadosMembros {
  membros: MembroEnsaio[];
  convites: ConviteEnsaio[];
  departamentos: Departamento[];
  canais: CanalEnsaio[];
}

/**
 * MEMBROS, CONVITES, DEPARTAMENTOS E CANAIS — do banco, no formato que a tela nova já usa.
 *
 * 11/09/2026. Antes: o ramo real desta página renderizava `<TabelaMembros>`, o componente antigo,
 * enquanto o ensaio renderizava `<MembrosEnsaio>` — que é o que tem o painel lateral com a ficha
 * da pessoa. Duas telas diferentes para a mesma coisa, e a boa só existia com dado falso.
 *
 * Este leitor existe para que sobre UMA tela: o componente é o mesmo nos dois caminhos, e a única
 * diferença passa a ser de onde vêm as linhas.
 *
 * Duas ausências declaradas, porque ambas parecem defeito e não são:
 *
 *  · `token` do convite vem VAZIO. `core.v_convite` não expõe o token, e está certo: quem tem o
 *    token entra. Reenviar gera um novo — é esse o caminho de recuperar um link perdido, não ler
 *    o antigo.
 *  · `conversas_7d` e `ultima_mensagem_em` do canal vêm zerados. São volume, e volume pede
 *    agregação por canal que o PostgREST não faz numa chamada. Preencher com fixture seria repetir
 *    o defeito que este arquivo corrige.
 */
export async function lerDadosMembros(): Promise<DadosMembros | null> {
  try {
    const supabase = criarClienteServidor();
    const [membrosRes, convitesRes, depsRes, canaisRes, lotacaoRes] = await Promise.all([
      supabase
        .schema("core")
        .from("v_membro")
        .select("id,nome,email,papel,funcao,ativo,criado_em,ultimo_acesso_em")
        .order("criado_em", { ascending: true }),
      supabase
        .schema("core")
        .from("v_convite")
        .select("id,email,papel,funcao,criado_em,expira_em,status,departamentos,criado_por")
        .in("status", ["pendente", "expirado"])
        .order("criado_em", { ascending: true }),
      supabase.schema("core").from("v_departamento").select("chave,rotulo,ativo,pai,nivel,entrada,ordem"),
      supabase
        .schema("core")
        .from("v_canal_whatsapp")
        .select("canal_id,nome,numero,provedor,finalidade,departamento,responsavel_id,nivel,ativo,pareado_em"),
      supabase
        .schema("core")
        .from("usuario_departamento")
        .select("usuario_id,departamento,papel_no_departamento")
        .is("removido_em", null),
    ]);

    if (membrosRes.error || !membrosRes.data) return null;

    // a lotação vem numa consulta só e se distribui aqui — uma consulta por membro seria N+1 numa
    // tela que lista a equipe inteira
    const porUsuario = new Map<string, VinculoDepartamento[]>();
    for (const l of lotacaoRes.data ?? []) {
      const k = String(l.usuario_id);
      porUsuario.set(k, [
        ...(porUsuario.get(k) ?? []),
        {
          departamento: String(l.departamento),
          papel_no_departamento: l.papel_no_departamento === "gestor" ? "gestor" : "membro",
        },
      ]);
    }

    const membros: MembroEnsaio[] = membrosRes.data.map((m) => ({
      id: String(m.id),
      nome: String(m.nome ?? m.email ?? ""),
      email: String(m.email ?? ""),
      papel: (m.papel ?? "membro") as MembroEnsaio["papel"],
      funcao: (m.funcao as string | null) ?? null,
      ativo: m.ativo !== false,
      departamentos: porUsuario.get(String(m.id)) ?? [],
      ultimo_acesso_em: (m.ultimo_acesso_em as string | null) ?? null,
      criado_em: String(m.criado_em ?? new Date(0).toISOString()),
    }));

    const convites: ConviteEnsaio[] = (convitesRes.data ?? []).map((c) => ({
      id: String(c.id),
      nome: null,
      email: (c.email as string | null) ?? null,
      papel: (c.papel ?? "membro") as ConviteEnsaio["papel"],
      departamentos: Array.isArray(c.departamentos) ? (c.departamentos as VinculoDepartamento[]) : [],
      criado_em: String(c.criado_em ?? ""),
      expira_em: String(c.expira_em ?? ""),
      status: (c.status ?? "pendente") as ConviteEnsaio["status"],
      token: "",
      criado_por: String(c.criado_por ?? ""),
    }));

    const departamentos: Departamento[] = (depsRes.data ?? []).map((d) => ({
      chave: String(d.chave),
      rotulo: String(d.rotulo ?? d.chave),
      pai: (d.pai as string | null) ?? null,
      nivel: Number(d.nivel ?? 1),
      ativo: d.ativo !== false,
      entrada: d.entrada === true,
      ordem: Number(d.ordem ?? 0),
    }));

    const canais: CanalEnsaio[] = (canaisRes.data ?? []).map((c) => ({
      canal_id: String(c.canal_id),
      apelido: String(c.nome ?? c.canal_id),
      numero_e164: String(c.numero ?? ""),
      provedor: (c.provedor === "nao_oficial" ? "nao_oficial" : "waba") as CanalEnsaio["provedor"],
      finalidade: (c.finalidade === "producao" ? "producao" : "teste") as CanalEnsaio["finalidade"],
      departamento: String(c.departamento ?? ""),
      responsavel_id: (c.responsavel_id as string | null) ?? null,
      nivel: (c.nivel ?? "conservador") as CanalEnsaio["nivel"],
      ativo: c.ativo !== false,
      // no oficial a Meta cuida do pareamento; no Lite, `pareado_em` é o fato
      pareamento: (c.provedor === "nao_oficial"
        ? c.pareado_em
          ? "pareado"
          : "pendente"
        : "pareado") as CanalEnsaio["pareamento"],
      pareado_em: (c.pareado_em as string | null) ?? null,
      conversas_7d: 0,
      ultima_mensagem_em: null,
    }));

    return { membros, convites, departamentos, canais };
  } catch {
    return null;
  }
}
