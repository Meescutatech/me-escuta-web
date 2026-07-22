import { criarClienteServidor } from "@/lib/supabase/server";
import type { Mencionavel } from "@/lib/conversas/mencao";

/**
 * Lista canônica de quem pode ser mencionado (Rodada 13 / Bloco C — C4 e C5).
 *
 * Pessoas: `core.v_membro` (0036), já legível por qualquer `authenticated` — é a lista do
 * workspace, com `ativo` marcando quem teve o acesso revogado. Revogado CONTINUA na lista:
 * §6.1 manda nunca bloquear a escrita por permissão, só avisar o autor.
 *
 * Agentes: `core.agente` (0001), select já liberado. Entram como categoria separada e marcados
 * "em breve" (D4) — mencionar grava o id, nada age.
 *
 * Degrade honesto: falha de leitura devolve lista vazia. Sem lista, o `@` simplesmente não
 * abre menu — nunca uma tela morta e nunca um alvo adivinhado.
 */
export async function lerMencionaveis(): Promise<Mencionavel[]> {
  const supabase = criarClienteServidor();
  const [pessoas, agentes] = await Promise.all([
    supabase.schema("core").from("v_membro").select("id,nome,email,papel,funcao,ativo").limit(200),
    supabase.schema("core").from("agente").select("id,nome,area,ativo").limit(50),
  ]);

  const lista: Mencionavel[] = [];

  for (const p of (pessoas.data ?? []) as any[]) {
    const nome = (p.nome ?? "").trim() || String(p.email ?? "").split("@")[0];
    if (!p.id || !nome) continue;
    lista.push({
      id: String(p.id),
      tipo: "humano",
      nome,
      papel: p.funcao ?? rotuloPapel(p.papel),
      ativo: p.ativo !== false,
    });
  }

  for (const a of (agentes.data ?? []) as any[]) {
    if (!a.id || !a.nome) continue;
    lista.push({
      id: String(a.id),
      tipo: "agente",
      nome: String(a.nome),
      papel: a.area ? rotuloArea(String(a.area)) : null,
      ativo: true, // agente não tem acesso revogável; o "em breve" é da ação, não do acesso
    });
  }

  return lista;
}

function rotuloPapel(papel: unknown): string | null {
  if (papel === "owner") return "Proprietário";
  if (papel === "admin") return "Admin";
  if (papel === "membro") return "Membro";
  return null;
}

/** `pre_venda` → "Pré-venda": a área é dado de máquina; a lista mostra gente, não slug. */
function rotuloArea(area: string): string {
  const mapa: Record<string, string> = {
    pre_venda: "Pré-venda",
    credito: "Crédito",
    cobranca: "Cobrança",
    avaliacao: "Avaliação",
    teste: "Teste",
  };
  return mapa[area] ?? area.replace(/_/g, " ");
}
