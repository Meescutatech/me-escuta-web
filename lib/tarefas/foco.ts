import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import { conversaIdDeEnsaio, visaoTarefasDeEnsaio } from "@/lib/dados/tarefas-ensaio";
import { tarefasAceitasComoVisao } from "@/lib/ensaio/conversas-extra";
import { comResumosDeEnsaio } from "@/lib/ensaio/tarefas-foco";
import type { ResumoJarvis } from "@/lib/tarefas/resumo";

/**
 * O MODO FOCO — decidido pelo Diogo em 11/09, 00:20:
 *
 *   *"Fechei o modo foco. Será a TELA DE CONVERSAS, onde cada conversa será uma tarefa."*
 *
 * Não é tela nova nem rota própria: é `/conversas` num estado que mostra **só as conversas cujo
 * lead tem tarefa pendente minha**, com a tarefa (o que fazer + prazo) na frente da prévia da
 * mensagem. O dono da tela é o W-D3; este arquivo é o que /tarefas entrega para ele — e é a
 * fronteira: daqui sai DADO e ORDEM, não JSX.
 *
 * A versão anterior (rota `/tarefas/foco`, tela própria com a tarefa à esquerda e a conversa à
 * direita) está no commit `69054a9` e foi substituída inteira por esta decisão. A rota agora
 * redireciona para `/conversas?foco=1`.
 *
 * ── Por que a ordem é urgência e não prazo puro ───────────────────────────────────────────────
 * Vencida → hoje → futura, e só dentro de cada faixa é que o prazo desempata. É o Inbox Today do
 * Close (benchmark §4.7): vencido e de hoje na mesma cesta, porque a pergunta é "o que faço
 * agora" — mas dentro dela o que já venceu vem primeiro, senão uma tarefa de ontem às 18h fica
 * atrás de uma de hoje às 9h só por causa do relógio.
 *
 * Uma conversa entra UMA vez, com a tarefa mais urgente dela; as outras viram `outras`. Duas
 * linhas para o mesmo paciente é a lista mentindo sobre quantas pessoas esperam por você.
 */

export type EstadoPrazo = "vencida" | "hoje" | "futura";

export interface TarefaDoFoco {
  id: string;
  titulo: string;
  /** ISO, ou `null` para tarefa sem prazo */
  prazo: string | null;
  estado: EstadoPrazo;
  /** chave do tipo (`core.config 'tipo_tarefa'`) — quem desenha resolve o rótulo */
  tipo: string | null;
  /** nome de quem responde por ela (em `incluirTime` pode não ser você) */
  responsavel: string | null;
  /** criada pelo Jarvis (`origem = 'jarvis_conversa'`) — é o arco no item da lista */
  doJarvis: boolean;
}

export interface ConversaEmFoco {
  conversa_id: string;
  lead_id: string | null;
  lead_nome: string | null;
  tarefa: TarefaDoFoco;
  /** a frase do Jarvis para a lista: o que fazer e por que agora (uma linha) */
  resumoJarvis?: string;
  /** o resumo inteiro, para a faixa dentro da conversa (situação · o que viu · o que fazer) */
  resumo?: ResumoJarvis | null;
  /** quantas outras tarefas pendentes o mesmo lead tem além desta */
  outras: number;
}

export interface OpcoesFoco {
  /** `true` = as tarefas de todo mundo, não só as minhas (o "Do time" dentro do foco) */
  incluirTime?: boolean;
}

/** hoje/vencida/futura em dias de calendário de São Paulo — prazo é compromisso local, não UTC */
const FMT_DIA_SP = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Sao_Paulo" });

export function estadoDoPrazo(t: Pick<TarefaVisao, "prazo" | "vencida">, agoraMs: number): EstadoPrazo {
  if (t.vencida) return "vencida";
  if (!t.prazo) return "futura";
  const ms = new Date(t.prazo).getTime();
  if (!Number.isFinite(ms)) return "futura";
  if (ms < agoraMs) return "vencida";
  return FMT_DIA_SP.format(new Date(ms)) === FMT_DIA_SP.format(new Date(agoraMs)) ? "hoje" : "futura";
}

const PESO: Record<EstadoPrazo, number> = { vencida: 0, hoje: 1, futura: 2 };
const SEM_PRAZO = Number.MAX_SAFE_INTEGER;

function prazoMs(t: TarefaVisao): number {
  const ms = t.prazo ? new Date(t.prazo).getTime() : NaN;
  return Number.isFinite(ms) ? ms : SEM_PRAZO;
}

/**
 * A PARTE PURA — recebe as tarefas já lidas (fixture ou banco) e devolve as conversas em foco.
 * É esta que se testa e é esta que serve quando a leitura real existir; `conversasComTarefaPendente`
 * é a casca que hoje busca na fixture do ensaio.
 */
export function focoDasTarefas(
  tarefas: TarefaVisao[],
  usuarioId: string | null,
  opcoes: OpcoesFoco = {},
  agora: Date = new Date(),
): ConversaEmFoco[] {
  const agoraMs = agora.getTime();
  const minhas = tarefas.filter(
    (t) => t.status === "pendente" && (opcoes.incluirTime || (usuarioId != null && t.responsavel_id === usuarioId)),
  );

  const porConversa = new Map<string, TarefaVisao[]>();
  for (const t of minhas) {
    const conversaId = t.conversa_id ?? null;
    // sem conversa ancorada a tarefa não tem lugar nesta tela — ela continua em /tarefas, e é
    // por isso que o botão do foco mostra um número menor que o da fila do dia.
    if (!conversaId) continue;
    porConversa.set(conversaId, [...(porConversa.get(conversaId) ?? []), t]);
  }

  const linhas: ConversaEmFoco[] = [];
  for (const [conversa_id, lista] of porConversa) {
    const ordenadas = [...lista].sort(
      (a, b) =>
        PESO[estadoDoPrazo(a, agoraMs)] - PESO[estadoDoPrazo(b, agoraMs)] ||
        prazoMs(a) - prazoMs(b) ||
        a.criado_em.localeCompare(b.criado_em),
    );
    const t = ordenadas[0];
    linhas.push({
      conversa_id,
      lead_id: t.lead_id,
      lead_nome: t.lead_nome,
      tarefa: {
        id: t.id,
        titulo: t.titulo,
        prazo: t.prazo,
        estado: estadoDoPrazo(t, agoraMs),
        tipo: t.tipo,
        responsavel: t.responsavel,
        doJarvis: t.origem === "jarvis_conversa",
      },
      resumoJarvis: t.resumo?.sugestao ?? t.fazer ?? t.por_que ?? undefined,
      resumo: t.resumo ?? null,
      outras: ordenadas.length - 1,
    });
  }

  return linhas.sort(
    (a, b) =>
      PESO[a.tarefa.estado] - PESO[b.tarefa.estado] ||
      (a.tarefa.prazo ? new Date(a.tarefa.prazo).getTime() : SEM_PRAZO) - (b.tarefa.prazo ? new Date(b.tarefa.prazo).getTime() : SEM_PRAZO) ||
      (a.lead_nome ?? "").localeCompare(b.lead_nome ?? "", "pt-BR"),
  );
}

/**
 * As conversas que têm tarefa pendente desta pessoa, na ordem em que ela deve atacá-las.
 *
 * Hoje lê a fixture de ensaio — as MESMAS tarefas que `/tarefas` mostra (`visaoTarefasDeEnsaio` +
 * as aceitas do fio), com o resumo do Jarvis já preenchido. Quando a leitura real existir, é só
 * trocar a origem: `focoDasTarefas` é que decide quem entra e em que ordem.
 *
 * Puro e chamável do cliente: nada aqui importa `next/headers` nem cliente de banco.
 */
export function conversasComTarefaPendente(
  usuarioId: string | null,
  opcoes: OpcoesFoco = {},
  agora: Date = new Date(),
): ConversaEmFoco[] {
  return focoDasTarefas(tarefasDoEnsaioComConversa(agora), usuarioId, opcoes, agora);
}

/** o número do selo do botão — a mesma regra da lista, sem montar a lista */
export function contarFocoPendentes(usuarioId: string | null, opcoes: OpcoesFoco = {}, agora: Date = new Date()): number {
  return conversasComTarefaPendente(usuarioId, opcoes, agora).length;
}

/**
 * A fixture, com `conversa_id` garantido: a fixture de /tarefas ancora só os moldes que têm lead
 * real, e sem `conversa_id` a tarefa não aparece no foco. Aqui o id da conversa de ensaio é
 * derivado do índice do lead (`conversaIdDeEnsaio`), a mesma função que a linha da lista usa para
 * mandar o clique ao fio certo — as duas telas têm de falar do mesmo fio.
 */
function tarefasDoEnsaioComConversa(agora: Date): TarefaVisao[] {
  const { tarefas } = visaoTarefasDeEnsaio(agora, { leadsDoFunil: true });
  const aceitas = tarefasAceitasComoVisao(undefined, agora);
  const idsAceitas = new Set(aceitas.map((t) => t.id));
  const todas = [...aceitas, ...tarefas.filter((t) => !idsAceitas.has(t.id))];
  return comResumosDeEnsaio(
    todas.map((t) => (t.conversa_id ? t : { ...t, conversa_id: conversaDoLead(t.lead_id) })),
    agora,
  );
}

function conversaDoLead(leadId: string | null): string | null {
  if (!leadId) return null;
  const m = /^1ead0000-0000-4000-8000-(\d{12})$/.exec(leadId);
  return m ? conversaIdDeEnsaio(Number(m[1]) - 1) : null;
}
