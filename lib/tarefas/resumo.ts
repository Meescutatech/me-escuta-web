/**
 * O RESUMO DO JARVIS NA TAREFA (W-T, 10/09/2026 noite).
 *
 * O Robô do Kommo escreve "POR QUE AGORA + FAZER" e a Sara lê isso há meses (memória
 * `kommo-priorizador-robo-ja-existe`). O que ele NÃO dá é a situação: em que etapa o lead está,
 * há quanto tempo, quem falou por último e quando. É isso que ela gasta metade do dia
 * levantando à mão (workshop 12/08: "metade do tempo pra priorizar"). O resumo junta as três
 * partes em 2-3 frases — situação · o que ele viu no fio · o que fazer e por que agora — e é
 * o PRIMEIRO bloco quando a tarefa se expande, e o texto grande do modo foco.
 *
 * Quem escreve é o worker (`tarefa_resumida`, ator `agente:jarvis`), gravado uma vez; a tela
 * nunca recalcula — o que a Sara leu às 23:18 tem de ser o mesmo texto às 23:40. Aqui no ensaio
 * a fixture faz o papel do worker (`lib/ensaio/tarefas-foco.ts`); `resumoDerivado()` é o
 * degrau honesto quando não há resumo gravado: monta a SITUAÇÃO a partir do que a view do lead
 * já dá (etapa, tempo na etapa, última mensagem) e deixa o resto vazio — sem inventar
 * inteligência que o modelo não produziu.
 *
 * Tarefa criada por HUMANO também tem resumo: o Jarvis é o Sistema, e resume o contexto do
 * lead do mesmo jeito; a diferença é que a terceira parte cita quem pediu ("Sara pediu: …") em
 * vez de propor. `humano: true` é o que separa as duas leituras na tela.
 */

export interface ResumoJarvis {
  /** situação do lead: etapa, há quanto tempo, último contato (de quem, quando) */
  situacao: string;
  /** o que ele viu na conversa — frase curta; o trecho citado fica em `trecho` */
  visto: string | null;
  /** o que sugere fazer e por que AGORA (tarefa do Jarvis) — ou o que a pessoa pediu (humana) */
  sugestao: string;
  /** ISO de quando foi gerado — a assinatura "resumiu às 23:18" */
  gerado_em: string;
  /** tarefa criada por humano: a terceira parte é "o que pediu", não "o que sugere" */
  humano: boolean;
}

export interface SituacaoLead {
  etapa_nome: string | null;
  /** ISO de quando entrou na etapa */
  na_etapa_desde: string | null;
  ultima_mensagem: { texto: string; em: string; de: "cliente" | "nos" } | null;
  /** primeiro nome de quem atende */
  atende: string | null;
}

const FMT_HORA_SP = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** "há 3 dias", "há 14 h", "há 20 min" — tempo decorrido em linguagem de tarefa */
export function haQuanto(iso: string, agoraMs: number): string {
  const ms = agoraMs - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "agora";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `há ${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 36) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

/** "às 23:18" — a hora da assinatura do resumo */
export function horaSP(iso: string): string {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? FMT_HORA_SP.format(new Date(ms)) : "";
}

/**
 * A situação em UMA frase, só com o que a view do lead dá. Não é o resumo do modelo — é o
 * degrau para a tarefa que ainda não foi resumida (leitura real sem `tarefa_resumida`).
 */
export function fraseDaSituacao(s: SituacaoLead, agoraMs: number, primeiroNome: string | null): string {
  const quem = primeiroNome ?? "O lead";
  const partes: string[] = [];
  if (s.etapa_nome) partes.push(`${quem} está em ${s.etapa_nome}${s.na_etapa_desde ? ` ${haQuanto(s.na_etapa_desde, agoraMs)}` : ""}`);
  else partes.push(`${quem} ainda não tem etapa`);
  if (s.ultima_mensagem) {
    const de = s.ultima_mensagem.de === "cliente" ? (primeiroNome ?? "ele") : (s.atende ?? "nós");
    partes.push(`a última mensagem foi de ${de}, ${haQuanto(s.ultima_mensagem.em, agoraMs)}`);
  } else partes.push("sem mensagem registrada");
  return partes.join("; ") + ".";
}

/**
 * Resumo derivado para tarefa SEM resumo gravado. `visto` fica nulo (não há leitura de fio sem
 * modelo) e `sugestao` repete o que a tarefa já diz — o `fazer` do Jarvis ou o título da pessoa.
 */
export function resumoDerivado(
  t: { titulo: string; fazer: string | null; por_que: string | null; origem: string | null; lead_nome: string | null; criado_em: string },
  situacao: SituacaoLead,
  agoraMs: number,
  criadoPor: string | null,
): ResumoJarvis {
  const primeiro = t.lead_nome ? t.lead_nome.split(/\s+/)[0] : null;
  const jarvis = t.origem === "jarvis_conversa";
  return {
    situacao: fraseDaSituacao(situacao, agoraMs, primeiro),
    visto: null,
    sugestao: jarvis ? `${t.fazer ?? t.titulo}${t.por_que ? ` — ${t.por_que}` : ""}` : `${criadoPor ?? "Alguém"} pediu: ${t.titulo}.`,
    gerado_em: t.criado_em,
    humano: !jarvis,
  };
}
