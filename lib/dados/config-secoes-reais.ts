import { criarClienteServidor } from "@/lib/supabase/server";
import type { EstadoSecao } from "@/lib/ensaio/config-secoes";

/**
 * OS CONTADORES DO MENU DE CONFIGURAÇÕES, LIDOS DO BANCO — 11/09/2026.
 *
 * O que havia antes, e por que era pior que não ter nada: `configuracoes/layout.tsx` montava os
 * selos ("4 ativos", "2 de 4", "88 %", "1 aberto", "8") a partir das fixtures de ensaio **sem
 * nenhuma guarda** — ou seja, servia números inventados a usuário real, em toda tela da seção.
 * Um selo falso não se percebe: ninguém confere "88 %" contra nada. Era a única coisa no app que
 * mentia sem pedir licença.
 *
 * A regra aqui é: **selo só quando há número medido.** `undefined` faz o item aparecer sem selo,
 * que é a informação honesta ("não sei"), e é melhor que um zero — zero afirma vazio, e vazio é
 * uma afirmação que precisa ser verdadeira.
 *
 * As seções cujo dado ainda não tem leitura (Claude, Conexões, Identidades, Suporte, Auditoria)
 * ficam sem selo em vez de ganhar um inventado. Elas voltam a ter número quando tiverem leitura.
 */
export async function lerEstadosSecoes(): Promise<Record<string, EstadoSecao>> {
  const estados: Record<string, EstadoSecao> = {};
  try {
    const supabase = criarClienteServidor();

    // `convite` não tem coluna `status`: pendente é a AUSÊNCIA de uso e de revogação, mais o
    // prazo de pé. Medido em 11/09 — as colunas são usado_em, revogado_em, expira_em.
    const agoraIso = new Date().toISOString();
    const [membros, convites, canais, agentes] = await Promise.all([
      supabase.schema("core").from("usuario").select("id", { count: "exact", head: true }).eq("ativo", true),
      supabase
        .schema("core")
        .from("convite")
        .select("id", { count: "exact", head: true })
        .is("usado_em", null)
        .is("revogado_em", null)
        .gt("expira_em", agoraIso),
      supabase.schema("core").from("v_canal_whatsapp").select("canal_id", { count: "exact", head: true }).eq("ativo", true),
      supabase.schema("core").from("agente").select("id,ativo"),
    ]);

    // O convite pendente vence a contagem de pessoas: contagem é informação, convite é dívida.
    const nConvites = convites.error ? null : convites.count;
    const nMembros = membros.error ? null : membros.count;
    if (nConvites != null && nConvites > 0) {
      estados["/configuracoes/membros"] = {
        texto: nConvites === 1 ? "1 convite" : `${nConvites} convites`,
        atencao: true,
      };
    } else if (nMembros != null) {
      estados["/configuracoes/membros"] = { texto: String(nMembros) };
    }

    if (!canais.error && canais.count != null) {
      estados["/configuracoes/canais"] = { texto: String(canais.count) };
    }

    if (!agentes.error && agentes.data && agentes.data.length > 0) {
      // a grade mostra os quatro nomeados; `a0` é semente de teste e não conta para a pessoa
      const visiveis = agentes.data.filter((a) => a.id !== "a0");
      const ligados = visiveis.filter((a) => a.ativo === true).length;
      estados["/configuracoes/agentes"] = { texto: `${ligados} de ${visiveis.length}` };
    }

    // Funil e Mensagens prontas ficam SEM selo de propósito: medido em 11/09, não existe
    // `core.v_etapa_funil` nem `core.mensagem_pronta` — as etapas vivem na config `funil_vendas`
    // e os textos prontos ainda não têm tabela. Inventar o número aqui seria repetir o defeito
    // que este arquivo existe para corrigir.
  } catch {
    // sem selo nenhum é um estado válido da tela; derrubar Configurações inteira por causa de um
    // contador não é.
    return {};
  }
  return estados;
}
