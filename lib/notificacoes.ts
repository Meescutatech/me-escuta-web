/**
 * Lógica PURA das notificações (Rodada 13 / Bloco B) — sem I/O, testável com node --test.
 * A UI (sino + visão expandida) só formata o que sai daqui.
 *
 * Contrato visual: Product_Management/Design/notificacoes-sino-v3.html. A gramática que este
 * módulo sustenta:
 *  - não-lida = ponto laranja; lida = sem ponto e texto esmaecido;
 *  - NENHUM ícone colorido por tipo — o tipo vem ESCRITO ("mencionou você", "atribuiu", "venceu");
 *  - atraso é a única exceção cromática (vermelho), porque é o que muda a ação;
 *  - contador não vira "9+": mostra o número.
 */

/**
 * As espécies que `core.v_notificacao` devolve HOJE.
 *
 * A união listava três (`mencao`, `tarefa_atribuida`, `tarefa_vencida`) e a view já devolvia mais:
 * `tarefa_vencendo` desde a F8 (0306/0307) e `cobertura_atribuicao_degradada` (o alarme). O efeito
 * de mentir aqui não era erro de compilação em lugar nenhum — era `components/notificacoes/regras.ts`
 * ter que reler `n.especie as string` para enxergar o que o tipo escondia, e o comentário de lá
 * (§6-10) registrar que "quando a união for alargada, isto encolhe". É este o alargamento.
 *
 * `ESPECIES_DE_TAREFA` é o subconjunto que tem TAREFA atrás: é o que carimba prazo e é o que a aba
 * Tarefas mostra. O alarme não está nele de propósito — não é tarefa, não tem prazo, e não tem
 * botão Concluir.
 */
export const ESPECIES_DE_TAREFA = ["tarefa_atribuida", "tarefa_vencendo", "tarefa_vencida"] as const;

export type Especie =
  | "mencao"
  | (typeof ESPECIES_DE_TAREFA)[number]
  | "cobertura_atribuicao_degradada";

export function ehEspecieDeTarefa(especie: Especie): boolean {
  return (ESPECIES_DE_TAREFA as readonly string[]).includes(especie);
}

/** Uma linha de core.v_notificacao. */
export interface Notificacao {
  id: string;
  especie: Especie;
  quando: string; // ISO
  lida_em: string | null;
  lead_id: string | null;
  trecho: string | null;
  titulo: string | null;
  ator: string | null; // humano:<uuid> | agente:<id> | texto legado
  ator_nome: string | null;
  origem_tipo: string | null;
  origem_id: string | null;
  mencao_id: string | null;
  tarefa_id: string | null;
  prazo: string | null;
  respondida_em: string | null;
  /** enriquecido na leitura: nome do lead p/ a linha "Maria Exemplo · #4821" */
  lead_nome?: string | null;
}

/** Tarefa não tem `lida_em` na projeção: pendente conta como não-lida (é o que o sino cobra). */
export function naoLida(n: Notificacao): boolean {
  return n.lida_em == null;
}

export function contarNaoLidas(itens: readonly Notificacao[]): number {
  return itens.filter(naoLida).length;
}

/**
 * O TETO DA LISTA — `lib/dados/notificacoes.ts:15` lê com `.limit(200)`, e `contarNaoLidas` conta
 * sobre o array JÁ TRUNCADO, não sobre a tabela. Não há nenhum `count` no banco em ponto nenhum do
 * caminho. Logo o número satura em 200 e subnotifica em silêncio a partir daí.
 */
export const TETO_NAO_LIDAS = 200;

/**
 * M6 · O número do sino, como TEXTO, e é onde o teto deixa de ser implícito.
 *
 * Acima do teto mostra **`200+`**, nunca `200` seco. É de uma linha, e é a diferença entre um número
 * errado e um número honesto: `200` parado é indistinguível de "200 notificações" e de "muitas, não
 * sei quantas".
 *
 * Por que isto entra AGORA, com o valor real valendo 0: o §3 da SPEC-M6 diz que o header não
 * conserta os zeros; esta função é o avesso — **no dia em que os zeros virarem números grandes, o
 * header é o primeiro lugar onde a mentira apareceria.** As duas coisas precisam existir juntas,
 * senão quem lê só a primeira acha que o header é imune a volume.
 *
 * O que NÃO muda nesta rodada, de propósito: o mecanismo de leitura. Reescrever o caminho por um
 * cenário que hoje vale 0 é consertar o que não está quebrado. **Dívida com endereço:** contagem
 * real exige `count` no banco (`core.v_notificacao` com `lida_em is null`), independente do
 * `limit` da lista, e ela entra naturalmente com a paginação da visão expandida.
 */
export function rotuloNaoLidas(qtd: number): string {
  return qtd >= TETO_NAO_LIDAS ? `${TETO_NAO_LIDAS}+` : String(qtd);
}

/**
 * A frase da linha 1 — o TIPO vem escrito, nunca por ícone.
 * Menção: "<Fulano> mencionou você numa nota|tarefa".
 * Tarefa: "<Fulano> atribuiu uma tarefa a você" · "Tarefa venceu — <título>".
 */
export function fraseNotificacao(n: Notificacao): { forte: string; resto: string } {
  if (n.especie === "mencao") {
    const onde = n.origem_tipo === "tarefa" ? "numa tarefa" : "numa nota";
    return { forte: nomeDoAtor(n), resto: ` mencionou você ${onde}` };
  }
  if (n.especie === "tarefa_vencida") {
    return { forte: "Tarefa venceu", resto: n.titulo ? ` — ${n.titulo}` : "" };
  }
  return { forte: nomeDoAtor(n), resto: " atribuiu uma tarefa a você" };
}

/**
 * Nome exibível de quem agiu. `ator` chega como `humano:<uuid>` (carimbo da porta),
 * `agente:<id>`, ou texto legado (e-mail — 0011/§4.4 do inventário). Sem nome resolvido,
 * mostra algo honesto em vez de um uuid cru.
 */
export function nomeDoAtor(n: Notificacao): string {
  if (n.ator_nome) return n.ator_nome;
  const a = n.ator ?? "";
  if (a.startsWith("agente:")) return a.slice(7);
  if (a.includes("@")) return a.split("@")[0];
  if (a.startsWith("humano:")) return "Alguém da equipe";
  return a || "Alguém da equipe";
}

/** Atraso em dias inteiros de uma tarefa vencida. `null` quando não há prazo vencido. */
export function diasDeAtraso(prazoIso: string | null, agoraMs: number): number | null {
  if (!prazoIso) return null;
  const ms = agoraMs - new Date(prazoIso).getTime();
  if (isNaN(ms) || ms <= 0) return null;
  return Math.max(1, Math.floor(ms / 86400000));
}

/** "2 dias de atraso" / "1 dia de atraso". Vazio quando não está atrasada. */
export function textoAtraso(prazoIso: string | null, agoraMs: number): string {
  const d = diasDeAtraso(prazoIso, agoraMs);
  if (d == null) return "";
  return d === 1 ? "1 dia de atraso" : `${d} dias de atraso`;
}

const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const DIA_MES = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const DIA_EXTENSO = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" });

/** Carimbo do popover: "10:04" hoje · "ontem · 17:39" · "20/07" antes disso. */
export function carimbo(iso: string, agoraMs: number): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const dias = diferencaEmDias(d.getTime(), agoraMs);
  if (dias === 0) return HORA.format(d);
  if (dias === 1) return `ontem · ${HORA.format(d)}`;
  return DIA_MES.format(d);
}

/**
 * Carimbo da visão expandida: só a hora. O dia já está no cabeçalho do grupo ("Ontem · 21 de
 * julho") — repeti-lo na linha é a redundância que o mockup evita.
 */
export function carimboSoHora(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : HORA.format(d);
}

/** "vence 23/07 · 09:00" / "venceu 20/07 · 09:00" — a linha 2 da tarefa. */
export function carimboPrazo(prazoIso: string | null, agoraMs: number): string {
  if (!prazoIso) return "sem prazo";
  const d = new Date(prazoIso);
  if (isNaN(d.getTime())) return "sem prazo";
  const verbo = d.getTime() < agoraMs ? "venceu" : "vence";
  return `${verbo} ${DIA_MES.format(d)} · ${HORA.format(d)}`;
}

/** Diferença em dias de CALENDÁRIO (não em múltiplos de 24h) — "ontem" tem que ser ontem. */
function diferencaEmDias(quandoMs: number, agoraMs: number): number {
  const a = new Date(quandoMs);
  const b = new Date(agoraMs);
  const dia = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((dia(b) - dia(a)) / 86400000);
}

/** Cabeçalho de grupo da visão expandida: "Hoje · 22 de julho". */
export function tituloDoDia(iso: string, agoraMs: number): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Sem data";
  const dias = diferencaEmDias(d.getTime(), agoraMs);
  const extenso = DIA_EXTENSO.format(d);
  if (dias === 0) return `Hoje · ${extenso}`;
  if (dias === 1) return `Ontem · ${extenso}`;
  return extenso.charAt(0).toUpperCase() + extenso.slice(1);
}

export type Filtro = "todas" | "nao_lidas" | "mencoes" | "tarefas";

export function filtrar(itens: readonly Notificacao[], filtro: Filtro): Notificacao[] {
  switch (filtro) {
    case "nao_lidas":
      return itens.filter(naoLida);
    case "mencoes":
      return itens.filter((n) => n.especie === "mencao");
    case "tarefas":
      // Era `especie !== "mencao"` — a aba definida por NEGAÇÃO. Toda espécie nova caía em Tarefas
      // por omissão, e foi o que aconteceu com `cobertura_atribuicao_degradada`: um alarme de
      // cobertura, que não tem tarefa nem prazo nem botão Concluir, aparecia na aba de tarefas
      // porque ninguém o excluiu. Lista explícita: espécie nova só entra aqui quando alguém disser
      // que ela é tarefa. O alarme continua visível em "Todas" e em "Não lidas".
      return itens.filter((n) => ehEspecieDeTarefa(n.especie));
    default:
      return [...itens];
  }
}

/**
 * O DIA em que a notificação é arquivada na lista.
 * Tarefa vencida é cobrança de agora, não notícia do dia em que a tarefa foi criada — no
 * mockup ela aparece no grupo "Hoje" mesmo tendo vencido dia 20. Por isso a vencida usa
 * `agoraMs`; todo o resto usa o próprio `quando`.
 *
 * Isso muda o GRUPO, não a ordem dentro dele: dentro do dia a ordem continua sendo a do
 * `quando` — no mockup a vencida vem depois da menção das 10:04, não na frente dela.
 */
export function diaEfetivo(n: Notificacao, agoraMs: number): number {
  if (n.especie === "tarefa_vencida") return agoraMs;
  const t = new Date(n.quando).getTime();
  return isNaN(t) ? 0 : t;
}

/** Ordena por recência e agrupa por dia (visão expandida). */
export function agruparPorDia(
  itens: readonly Notificacao[],
  agoraMs: number,
): { titulo: string; itens: Notificacao[] }[] {
  const grupos: { titulo: string; itens: Notificacao[] }[] = [];
  for (const n of ordenar(itens, agoraMs)) {
    const titulo = tituloDoDia(new Date(diaEfetivo(n, agoraMs)).toISOString(), agoraMs);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.titulo === titulo) ultimo.itens.push(n);
    else grupos.push({ titulo, itens: [n] });
  }
  return grupos;
}

/** Dia (desc) primeiro — senão a vencida quebraria o grupo em dois — e `quando` (desc) dentro. */
function ordenar(itens: readonly Notificacao[], agoraMs: number): Notificacao[] {
  const dia = (ms: number) => {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const bruto = (n: Notificacao) => {
    const t = new Date(n.quando).getTime();
    return isNaN(t) ? 0 : t;
  };
  return [...itens].sort(
    (a, b) =>
      dia(diaEfetivo(b, agoraMs)) - dia(diaEfetivo(a, agoraMs)) || bruto(b) - bruto(a),
  );
}

/** As N mais recentes — o popover mostra lista curta e a visão expandida mostra tudo. */
export function maisRecentes(
  itens: readonly Notificacao[],
  n: number,
  agoraMs: number,
): Notificacao[] {
  return ordenar(itens, agoraMs).slice(0, n);
}

/** Só menção não lida e ainda não promovida pode virar tarefa em 1 clique (§7 / §10.2). */
export function podePromover(n: Notificacao): boolean {
  return n.especie === "mencao" && n.mencao_id != null && n.respondida_em == null;
}

/** Destino do clique: leva a pessoa ao lugar onde a menção/tarefa vive. */
export function destino(n: Notificacao): string | null {
  if (!n.lead_id) return null;
  return `/conversas?lead=${n.lead_id}`;
}
