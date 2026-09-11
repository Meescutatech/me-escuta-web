import { criarClienteServidor } from "@/lib/supabase/server";
import { agentesInteligencia, type AgenteInteligencia } from "@/lib/ensaio/inteligencia";

/**
 * OS AGENTES, COM O ESTADO QUE O BANCO TEM — 11/09/2026.
 *
 * Até hoje `/configuracoes/agentes` redirecionava para a página da Clara fora do ensaio, porque
 * "não há leitura de core.agente para esta tela". Há agora.
 *
 * A tela mistura duas naturezas, e elas merecem tratamento OPOSTO:
 *
 *  · EDITORIAL — a frase do card, o glifo, o tom, as ferramentas, quem valida, onde ele aparece e
 *    a régua de autonomia. Isso descreve o que o agente É; não é dado de operação e não fica menos
 *    verdadeiro por não estar numa tabela. Continua vindo de `agentesInteligencia()`.
 *
 *  · OPERACIONAL — ligado ou desligado, o nome, a versão do prompt. Isso é fato, e fato inventado
 *    numa tela de produção é mentira: alguém lê "ligado" e age como se estivesse. Vem do banco,
 *    sempre, e sobrescreve o editorial.
 *
 * Os NÚMEROS de 7 dias (execuções, aceitas, tempo médio) e o traço de execução eram fixture, e são
 * zerados aqui em vez de mostrados. Card com número falso é pior que card sem número: o vazio se
 * percebe, o número errado não.
 *
 * Agente que existe no editorial mas NÃO em `core.agente` some da grade — a tela mostra o que a
 * empresa tem, não o que o catálogo previa.
 *
 * Degrada para `null` (e aí a página volta a redirecionar como antes), nunca para grade vazia:
 * "nenhum agente" seria uma afirmação falsa sobre a empresa.
 */
export async function lerAgentesReais(agora: Date = new Date()): Promise<AgenteInteligencia[] | null> {
  const base = agentesInteligencia(agora);
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("agente")
      .select("id,nome,ativo,prompt_versao")
      .in(
        "id",
        base.map((b) => b.chave),
      );
    if (error || !data || data.length === 0) return null;

    const porId = new Map(data.map((a) => [String(a.id), a]));
    const vivos = base.filter((b) => porId.has(b.chave));
    if (vivos.length === 0) return null;

    return vivos.map((b) => {
      const r = porId.get(b.chave)!;
      const ativo = r.ativo === true;
      return {
        ...b,
        nome: typeof r.nome === "string" && r.nome.length > 0 ? r.nome : b.nome,
        ativo,
        // `esperando_credencial` é uma terceira coisa e o banco não a conhece: se o editorial diz
        // que falta credencial e o agente está desligado, o motivo continua valendo.
        situacao: ativo ? "ligado" : b.situacao === "esperando_credencial" ? "esperando_credencial" : "desligado",
        versao_prompt: typeof r.prompt_versao === "number" ? r.prompt_versao : b.versao_prompt,
        ultima_acao: null,
        ultimos_7d: [],
        numeros: [],
        execucoes: [],
      };
    });
  } catch {
    return null;
  }
}
