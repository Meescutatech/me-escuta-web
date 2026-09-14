import { criarClienteServidor } from "@/lib/supabase/server";
import { agentesInteligencia, type AgenteInteligencia } from "@/lib/ensaio/inteligencia";
import {
  CATALOGO_INDISPONIVEL,
  lerCatalogo,
  linhasDaReguaReal,
  responsavelPadraoDe,
  type MembroEscolhivel,
  type CatalogoAutonomia,
} from "@/lib/agentes/regua-real";

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
 * 14/09 · O LEVINDO APARECIA "ATIVO" E NINGUÉM SABIA POR QUÊ — e esta é a resposta, medida.
 *
 * O card mostrava "● Ativo" ao lado do selo "em desenvolvimento", com o interruptor travado, e não
 * explicava a contradição: o motivo morava num tooltip que ninguém abre. Medido em produção:
 *
 *     core.agente      levindo ativo=t · priscila ativo=f
 *     core.sugestao_ia levindo 47 sugestões, TODAS de 16/07/2026 (o dia do smoke). Nada depois.
 *                      clara 256, a última de hoje — é a única viva.
 *
 * Ele está ligado porque **nasceu ligado na semente**, não porque alguém o ligou. "Ativo" é
 * verdade sobre a coluna e mentira sobre a operação, e é a segunda que a pessoa lê.
 */
const LIGADO_POR_SEMENTE = "Ligado desde a semente de 16/07 — ninguém o ligou, e ele não produz nada desde então.";

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
    /*
     * 14/09 · a régua passou a GRAVAR, então ela passa a LER do banco também — as duas metades
     * andam juntas. `autonomia_jsonb` diz quais capacidades o agente tem e em que nível;
     * `config_jsonb` traz o responsável padrão. Enquanto a régua era enfeite, mostrar as
     * capacidades da fixture era só impreciso; com o clique gravando, seria oferecer um clique
     * que a porta recusa (três das quatro capacidades da fixture do Jarvis não estão no catálogo).
     */
    const [agentesRes, configRes] = await Promise.all([
      supabase
        .schema("core")
        .from("agente")
        .select("id,nome,ativo,prompt_versao,prompt_sistema,area,autonomia_jsonb,config_jsonb")
        .in(
          "id",
          base.map((b) => b.chave),
        ),
      supabase
        .schema("core")
        .from("v_config_vigente")
        .select("nome,payload")
        .in("nome", ["capacidade_agente", "flag.teto_autonomia"]),
    ]);
    const { data, error } = agentesRes;
    if (error || !data || data.length === 0) return null;

    // catálogo ilegível NÃO derruba a tela: ela continua mostrando o estado do agente, e a régua
    // inteira nasce em leitura, com o motivo escrito (fail-closed em `regua-real.ts`).
    const catalogo: CatalogoAutonomia = configRes.error
      ? CATALOGO_INDISPONIVEL
      : lerCatalogo(
          configRes.data?.find((c) => c.nome === "capacidade_agente")?.payload,
          configRes.data?.find((c) => c.nome === "flag.teto_autonomia")?.payload,
        );

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
        // a régua REAL: as chaves que o agente tem em `autonomia_jsonb`, cruzadas com o catálogo
        // vigente. Nada de fixture — era o que fazia a tela oferecer `priorizar`/`atribuir`/
        // `arquivar_lead`, que não existem no catálogo e a porta recusaria.
        autonomia: linhasDaReguaReal(r.autonomia_jsonb as Record<string, unknown> | null, catalogo),
        responsavel_padrao: responsavelPadraoDe(r.config_jsonb),
        ultima_acao: null,
        ultimos_7d: [],
        numeros: [],
        execucoes: [],
        pendencias: EM_DESENVOLVIMENTO.has(b.chave)
          ? // a segunda linha só existe quando o banco diz `ativo` e o agente não opera — é
            // exatamente o par que a tela mostrava sem explicar
            [AVISO_DESENVOLVIMENTO, ...(ativo ? [LIGADO_POR_SEMENTE] : []), ...b.pendencias]
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

/**
 * AS PESSOAS que podem ser o responsável padrão de um agente — `core.v_membro`, só quem está
 * ativo. Revogado não entra na lista: escolher alguém sem acesso seria mandar a tarefa para uma
 * fila que ninguém abre.
 *
 * Degrada para `[]`, e a tela diz "não há ninguém para escolher" com o motivo — nunca para uma
 * lista inventada, que é o caminho para alguém escolher um nome que o banco não conhece.
 */
export async function lerMembrosEscolhiveis(): Promise<MembroEscolhivel[]> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("v_membro")
      .select("id,nome,email,papel,funcao,ativo")
      .eq("ativo", true)
      .order("nome", { ascending: true });
    if (error || !data) return [];
    return data.map((m) => ({
      id: String(m.id),
      nome: String(m.nome ?? m.email ?? m.id),
      // a FUNÇÃO é o que a pessoa faz ("Gestora de Pré-venda"); o PAPEL é o poder no workspace
      // (admin/membro). Quem escolhe para quem a tarefa vai quer a primeira.
      papel: String(m.funcao ?? m.papel ?? "membro"),
    }));
  } catch {
    return [];
  }
}
