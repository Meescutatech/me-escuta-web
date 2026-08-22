"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

export interface ResultadoValidacao {
  ok: boolean;
  /** Já em português de quem usa — nunca o texto cru do banco. */
  motivo?: string;
}

/**
 * Aprovar ou recusar uma proposta de agente.
 *
 * A escrita continua sendo a MESMA de sempre: a porta única, que resolve o validador pela sessão
 * e transforma a aprovação em evento no ledger. O que mudou em 22/08 (W3) foram duas coisas:
 *
 * 1. NÃO LANÇA MAIS. Antes um `throw` derrubava a rota inteira numa tela de erro do framework.
 *    Medido no mesmo dia: as 405 propostas pendentes nasceram entre 16 e 19/07 e TODAS as 318 de
 *    mensagem estão fora da janela de frescor — ou seja, 100% dos cliques em Aprovar terminavam
 *    naquela tela. A recusa da porta está certa; derrubar a página por causa dela, não.
 * 2. O MOTIVO É TRADUZIDO. O erro do banco fala de função, esquema e código SQL. Quem valida a
 *    fila é a SDR. `traduzirFalha` mapeia o que já sabemos e higieniza o resto — nome técnico não
 *    ajuda quem lê e não deveria estar na tela dela.
 */
export async function validarSugestao(
  id: string,
  decisao: "aprovada" | "rejeitada",
): Promise<ResultadoValidacao> {
  if (!id || (decisao !== "aprovada" && decisao !== "rejeitada")) {
    return { ok: false, motivo: "Pedido inválido — recarregue a página." };
  }

  const supabase = criarClienteServidor();
  const { error } = await supabase.schema("api").rpc("validar_sugestao", {
    p_sugestao_id: id,
    p_decisao: decisao,
    p_payload_aprovado: null,
  });
  if (error) return { ok: false, motivo: traduzirFalha(error.message) };

  revalidatePath("/fila");
  revalidatePath("/timeline");
  revalidatePath("/conversas");
  return { ok: true };
}

/**
 * Erro do banco → frase útil. O `higienizar` do final é a rede: qualquer mensagem que a gente
 * ainda não conheça sai sem identificador qualificado por esquema, porque a tela da operação não
 * é lugar de nome de função.
 */
function traduzirFalha(bruto: string): string {
  const m = (bruto ?? "").toLowerCase();
  if (m.includes("vencida")) {
    return "Proposta velha demais para ser enviada — a conversa já seguiu. Recuse e peça uma nova.";
  }
  if (m.includes("já validada") || m.includes("ja validada")) {
    return "Alguém já decidiu esta proposta. Atualize a página.";
  }
  if (m.includes("sem permissao") || m.includes("insufficient")) {
    return "Você não tem permissão para aplicar esta mudança — fale com um administrador.";
  }
  if (m.includes("não encontrada") || m.includes("nao encontrada")) {
    return "Esta proposta não existe mais. Atualize a página.";
  }
  return `Não foi possível registrar a decisão: ${higienizar(bruto)}`;
}

/** Remove identificador qualificado (`esquema.objeto`) e a sigla do protocolo de chamada. */
function higienizar(texto: string): string {
  return (texto ?? "")
    .replace(/\b[a-z_]+\.[a-z_]+\b/gi, "sistema")
    .replace(/\bRPC\b/gi, "chamada")
    .trim();
}
