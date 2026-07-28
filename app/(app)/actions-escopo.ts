"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_DEPARTAMENTO, departamentoEhVisivel } from "@/lib/dados/departamentos";
import type { ResultadoAcao } from "@/components/configuracoes/dados/porta";

/**
 * M6 · Trocar o departamento ativo.
 *
 * O ÚNICO caminho de escrita do escopo. Não existe `document.cookie` no cliente para isto, e a
 * ausência é o item: se o cliente gravasse, o servidor validaria depois de já ter renderizado — e o
 * rótulo do topo mentiria por um render inteiro. O rótulo é PROMESSA DURA (D6-f): o que está
 * escrito ali é tudo o que a tela mostra.
 *
 * NÃO EMITE EVENTO, e isso é decisão, não esquecimento. Constituição §1.1: o ledger recebe FATO DO
 * NEGÓCIO, não clique de interface. Trocar de escopo é preferência de visualização;
 * `mensagem_status` já é 3623 de 5593 eventos, e somar ruído de navegação é o caminho para o ledger
 * ficar ilegível. Se auditoria de "quem olhou o quê" virar requisito, é item próprio com nome
 * próprio — não entra por esta porta.
 */
export async function trocarDepartamentoAtivo(chave: string): Promise<ResultadoAcao> {
  const limpa = (chave ?? "").trim();
  if (!limpa) {
    return { ok: false, motivo: "escolha um departamento", classe: "recusa" };
  }

  // A validação é SERVER-SIDE e é contra `core.v_usuario_departamento`, não contra a lista que o
  // cliente mandou. Chave que a pessoa não vê — ou que foi arquivada entre o render e o clique —
  // é RECUSADA e nada é gravado. Escopo não é permissão, mas não se deixa o cliente cravar o que o
  // servidor lê.
  if (!(await departamentoEhVisivel(limpa))) {
    return {
      ok: false,
      motivo: "esse departamento não está disponível para você — recarregue a página",
      classe: "permissao",
    };
  }

  try {
    cookies().set(COOKIE_DEPARTAMENTO, limpa, {
      path: "/",
      sameSite: "lax",
      // sem `httpOnly`: o cliente precisa ler a chave para marcar o ativo no seletor sem uma ida ao
      // servidor. O cookie carrega UMA STRING de vocabulário da empresa — não é PII, não é
      // credencial e não amplia acesso (§6.8 da SPEC-M6). O que ele nunca pode virar é cache do
      // CONTEÚDO do escopo.
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    return { ok: false, motivo: "não deu para guardar a sua escolha agora", classe: "outro" };
  }

  // Porte literal do `invalidateWorkspaceScopedQueries` da LiderHub
  // (`active-workspace-provider.tsx:21-30`): trocar de contexto INVALIDA TUDO menos identidade e a
  // própria lista. Filtro estreita um resultado; escopo DESCARTA E REFAZ o mundo — é o teste
  // operacional da diferença. No nosso stack, o equivalente é revalidar o layout inteiro.
  revalidatePath("/", "layout");
  return { ok: true };
}
