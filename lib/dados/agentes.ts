import { criarClienteServidor } from "@/lib/supabase/server";
import { agentesInteligencia, type AgenteInteligencia } from "@/lib/ensaio/inteligencia";

/**
 * Quem ainda NÃO opera, dito pelo Diogo em 11/09. Levindo está `ativo=true` no banco desde a
 * semente, e Priscila `false` — nenhum dos dois roda de verdade. Mostrar o flag cru faria a tela
 * afirmar que o Levindo trabalha.
 *
 * Entra como PENDÊNCIA em vez de esconder o agente: a pendência já é o mecanismo que a tela usa
 * para bloquear o botão de ligar e dizer por quê (`cartoes-agentes.tsx`: `impedido =
 * pendencias.length > 0`). Some daqui no dia em que o agente operar — não é rótulo cosmético,
 * é o que impede alguém de ligar e esperar resultado.
 */
const EM_DESENVOLVIMENTO = new Set(["levindo", "priscila"]);
const AVISO_DESENVOLVIMENTO = "Em desenvolvimento — ainda não opera; ligar aqui não produz efeito.";

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
      .select("id,nome,ativo,prompt_versao,prompt_sistema,area")
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
        // o ROTEIRO de verdade, de core.agente.prompt_sistema. Sem isto a tela mostraria o texto
        // da fixture e alguém editaria um prompt que não é o que roda.
        prompt: typeof r.prompt_sistema === "string" && r.prompt_sistema.length > 0 ? r.prompt_sistema : b.prompt,
        area: typeof r.area === "string" && r.area.length > 0 ? r.area : b.area,
        ultima_acao: null,
        ultimos_7d: [],
        numeros: [],
        execucoes: [],
        pendencias: EM_DESENVOLVIMENTO.has(b.chave)
          ? [AVISO_DESENVOLVIMENTO, ...b.pendencias]
          : b.pendencias,
      };
    });
  } catch {
    return null;
  }
}

/**
 * UM agente, para a tela de detalhe (`/configuracoes/agentes/[id]`). Reusa `lerAgentesReais` de
 * propósito: se a lista e o detalhe lessem por caminhos diferentes, um diria "ligado" e o outro
 * "desligado" no primeiro dia em que divergissem.
 */
export async function lerAgenteReal(id: string, agora: Date = new Date()): Promise<AgenteInteligencia | null> {
  const todos = await lerAgentesReais(agora);
  return todos?.find((a) => a.chave === id) ?? null;
}
