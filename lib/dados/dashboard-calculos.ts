/**
 * Lógica PURA do dashboard (Rodada 7, D5) — sem I/O, sem Supabase, client-safe e testável
 * com node --test. As queries ficam em lib/dados/dashboard.ts (server-only).
 *
 * Fuso da operação: America/Sao_Paulo (UTC-3 fixo — o Brasil não tem horário de verão desde
 * 2019). Todos os cortes de "dia" usam esse fuso, não o do servidor.
 */

export const OFFSET_SP = "-03:00";

/** Janela [inicio, fim) de um dia da operação, com rótulo de exibição. */
export interface JanelaDia {
  inicioIso: string;
  fimIso: string;
  rotulo: string; // ex.: "seg 20/07"
}

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "YYYY-MM-DD" do instante `agora` no fuso de São Paulo. */
export function ymdEmSaoPaulo(agora: Date): string {
  // UTC-3 fixo: desloca o relógio e lê o calendário em UTC
  const deslocado = new Date(agora.getTime() - 3 * 3600_000);
  return deslocado.toISOString().slice(0, 10);
}

/** Meia-noite de São Paulo do dia que contém `agora`. */
export function inicioDoDiaSP(agora: Date): Date {
  return new Date(`${ymdEmSaoPaulo(agora)}T00:00:00${OFFSET_SP}`);
}

/** Rótulo curto de um dia ("seg 20/07") a partir da meia-noite SP desse dia. */
export function rotuloDiaSP(inicioDia: Date): string {
  const ymd = ymdEmSaoPaulo(new Date(inicioDia.getTime() + 12 * 3600_000)); // meio-dia, longe da borda
  const [ano, mes, dia] = ymd.split("-").map(Number);
  const semana = DIAS_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()];
  return `${semana} ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

/** Últimos `dias` dias da operação (o último inclui `agora`), do mais antigo pro mais novo. */
export function janelasUltimosDias(agora: Date, dias: number): JanelaDia[] {
  const inicioHoje = inicioDoDiaSP(agora);
  const janelas: JanelaDia[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const inicio = new Date(inicioHoje.getTime() - i * 86400_000);
    const fim = new Date(inicio.getTime() + 86400_000);
    janelas.push({ inicioIso: inicio.toISOString(), fimIso: fim.toISOString(), rotulo: rotuloDiaSP(inicio) });
  }
  return janelas;
}

/** Mediana simples; null pra amostra vazia. */
export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

export interface MensagemMinima {
  conversa_id: string;
  direcao: string; // 'entrada' | 'saida'
  criado_em: string;
}

/**
 * Tempo de 1ª resposta por conversa, em MINUTOS: da primeira mensagem de ENTRADA até a
 * primeira SAÍDA depois dela. Conversa sem par entrada→saída fica fora da amostra
 * (não inventar tempo). A entrada não precisa vir ordenada.
 */
export function minutosPrimeiraResposta(msgs: MensagemMinima[]): number[] {
  const porConversa = new Map<string, MensagemMinima[]>();
  for (const m of msgs) {
    const k = m.conversa_id;
    if (!porConversa.has(k)) porConversa.set(k, []);
    porConversa.get(k)!.push(m);
  }
  const tempos: number[] = [];
  for (const lista of porConversa.values()) {
    lista.sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime());
    const entrada = lista.find((m) => m.direcao === "entrada");
    if (!entrada) continue;
    const tEntrada = new Date(entrada.criado_em).getTime();
    const saida = lista.find((m) => m.direcao === "saida" && new Date(m.criado_em).getTime() >= tEntrada);
    if (!saida) continue;
    tempos.push((new Date(saida.criado_em).getTime() - tEntrada) / 60000);
  }
  return tempos;
}

/** % de entrega (0–100, 1 casa). Base zero → null (não inventar 0% nem 100%). */
export function percentualEntrega(entregues: number, base: number): number | null {
  if (base <= 0) return null;
  return Math.round((entregues / base) * 1000) / 10;
}

/** Soma ignorando nulls (valor null é honesto — Kommo só preenche no fechamento). */
export function somaValores(valores: Array<number | null | undefined>): number {
  return valores.reduce<number>((s, v) => s + (v ?? 0), 0);
}

/*
 * ── F24a · agregação em JS no lugar de um head-count por linha ──────────────────────────────
 *
 * O painel disparava ~37 requisições por visita: 14 contagens por etapa (1 por etapa) + 14
 * contagens de mensagem (7 dias × 2 direções) + 3 de entrega, entre outras. O código já sabia que
 * isso era errado e dizia por quê: o PostgREST deste projeto não expõe funções de agregação, e a
 * saída dada foi o head-count por linha.
 *
 * A troca é round-trip por PAYLOAD, e ela é boa até certo volume e ruim depois — por isso cada
 * agregação tem TETO e volta ao caminho antigo acima dele. O teto não é melhoria futura: é critério
 * de aceite, porque o dia em que a janela de 7 dias tiver 50 mil mensagens o painel ficaria mais
 * lento do que era antes, e ninguém perceberia.
 *
 * As funções abaixo são puras de propósito (a spec manda a contagem em JS morar aqui, não dentro da
 * função de leitura): é assim que o teste consegue comparar os dois caminhos número a número. A
 * troca de técnica não pode mudar número — esse é o erro mais provável e o mais difícil de ver.
 */

/** Acima disto, ler a coluna sai mais caro que os head-counts. Medido hoje: ~692 leads. */
export const TETO_LEADS_AGREGACAO = 5000;
/** Acima disto, idem, para a janela de 7 dias de mensagens. Medido hoje: ~410 em 7d. */
export const TETO_MENSAGENS_AGREGACAO = 20000;

/** Contagem por etapa a partir da coluna `etapa` — mesma pergunta dos 14 head-counts. */
export function contarPorEtapa(linhas: Array<{ etapa?: string | null }>, chaves: string[]): number[] {
  const contagem = new Map<string, number>();
  for (const l of linhas) {
    const k = l.etapa == null ? "" : String(l.etapa);
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  return chaves.map((c) => contagem.get(c) ?? 0);
}

/**
 * Mensagens por dia e direção, bucketizadas nas MESMAS janelas que os head-counts usavam.
 * A fronteira é [início, fim) igual à do `.gte()/.lt()`: fechada embaixo, aberta em cima. Errar
 * isso é o jeito silencioso de a agregação divergir do head-count por uma mensagem na virada.
 */
export function bucketizarMensagens(
  msgs: Array<{ direcao?: string | null; criado_em?: string | null }>,
  janelas: JanelaDia[],
): Array<{ rotulo: string; entrada: number; saida: number }> {
  const baldes = janelas.map((j) => ({
    rotulo: j.rotulo,
    entrada: 0,
    saida: 0,
    de: new Date(j.inicioIso).getTime(),
    ate: new Date(j.fimIso).getTime(),
  }));
  for (const m of msgs) {
    const t = m.criado_em ? new Date(m.criado_em).getTime() : NaN;
    if (isNaN(t)) continue;
    const b = baldes.find((x) => t >= x.de && t < x.ate);
    if (!b) continue;
    if (m.direcao === "entrada") b.entrada += 1;
    else if (m.direcao === "saida") b.saida += 1;
  }
  return baldes.map(({ rotulo, entrada, saida }) => ({ rotulo, entrada, saida }));
}

/** Os estados que contam como "entrega conhecida" — a base do percentual. */
export const ESTADOS_ENTREGA_CONHECIDA = ["enviado", "entregue", "lido", "falhou"];
const ESTADOS_ENTREGUE = new Set(["entregue", "lido"]);

/** Base/entregues/falhas de uma leitura única de `status_entrega` — os 3 head-counts em 1. */
export function contarEntrega(linhas: Array<{ status_entrega?: string | null }>): {
  base: number;
  entregues: number;
  falhas: number;
} {
  let base = 0;
  let entregues = 0;
  let falhas = 0;
  for (const l of linhas) {
    const e = l.status_entrega == null ? "" : String(l.status_entrega);
    if (!ESTADOS_ENTREGA_CONHECIDA.includes(e)) continue;
    base += 1;
    if (ESTADOS_ENTREGUE.has(e)) entregues += 1;
    if (e === "falhou") falhas += 1;
  }
  return { base, entregues, falhas };
}

/*
 * ── R19 · Trilha 2 — as contas novas do painel ──────────────────────────────────────────────
 * Mesma disciplina do resto do arquivo: puras, sem I/O, e o null é honesto — conta que não
 * pode ser feita devolve null, nunca um número inventado.
 */

/**
 * Funil cumulativo sobre o SNAPSHOT das etapas: % dos leads ativos que estão na etapa i OU além.
 * É a única leitura de "conversão" honesta num retrato do estoque (razão entre etapas vizinhas
 * pode passar de 100% e não mede coorte nenhuma). Monotônica por construção; 1ª etapa = 100%.
 * Qualquer contagem null → null em TODAS (o total é desconhecido, o percentual seria invenção).
 */
export function percentualChegouAteAqui(qtds: Array<number | null>): Array<number | null> {
  if (qtds.length === 0 || qtds.some((q) => q == null)) return qtds.map(() => null);
  const total = qtds.reduce<number>((s, q) => s + (q ?? 0), 0);
  if (total <= 0) return qtds.map(() => null);
  let acumulado = total;
  return qtds.map((q) => {
    const pct = Math.round((acumulado / total) * 1000) / 10;
    acumulado -= q ?? 0;
    return pct;
  });
}

/**
 * Taxa de ganho dos FECHADOS: ganhos / (ganhos + perdidos). Base zero ou contagem
 * indisponível → null (não existe taxa de um conjunto vazio ou desconhecido).
 */
export function taxaFechamento(
  ganhos: number | null,
  perdidos: number | null,
): { pct: number | null; base: number | null } {
  if (ganhos == null || perdidos == null) return { pct: null, base: null };
  const base = ganhos + perdidos;
  if (base <= 0) return { pct: null, base };
  return { pct: Math.round((ganhos / base) * 1000) / 10, base };
}

/** Acima disto, ler a coluna `agente` das pendentes sai mais caro que o head-count. Medido hoje: 405. */
export const TETO_SUGESTOES_AGREGACAO = 2000;

export interface ResumoSugestoes {
  pendentes: number;
  porAgente: Array<{ agente: string; qtd: number }>; // ordem: maior fila primeiro
  maisAntigaEm: string | null;
}

/** Total, quebra por agente e a mais antiga — de UMA leitura estreita das pendentes. */
export function resumirSugestoes(
  linhas: Array<{ agente?: string | null; criado_em?: string | null }>,
): ResumoSugestoes {
  const porAgente = new Map<string, number>();
  let maisAntigaEm: string | null = null;
  for (const l of linhas) {
    const a = l.agente == null || l.agente === "" ? "sem agente" : String(l.agente);
    porAgente.set(a, (porAgente.get(a) ?? 0) + 1);
    if (l.criado_em && (maisAntigaEm == null || l.criado_em < maisAntigaEm)) maisAntigaEm = l.criado_em;
  }
  return {
    pendentes: linhas.length,
    porAgente: [...porAgente.entries()]
      .map(([agente, qtd]) => ({ agente, qtd }))
      .sort((x, y) => y.qtd - x.qtd || x.agente.localeCompare(y.agente)),
    maisAntigaEm,
  };
}

/*
 * ── R23 · Trilha E — PRECISÃO POR AGENTE (RF-15.3) ──────────────────────────────────────────
 *
 * A régua de autonomia (RF-M3, PRD §6.2) afrouxa por tipo de ação conforme a precisão sobe. Para
 * isso ela precisa de UM número por agente, e ele tem que ser o número certo:
 *
 *     precisão = aprovadas SEM correção ÷ decididas
 *     decididas = aprovada + corrigida + rejeitada
 *
 * Por que o denominador é esse, e não o total de sugestões: `pendente` ainda não foi julgada —
 * contá-la derrubaria a precisão de todo agente com fila (hoje 405 das 437), e a fila é sintoma de
 * validador ausente, não de agente ruim. `obsoleta` foi descartada pelo tempo, sem ninguém olhar:
 * não é acerto nem erro. Só entra na conta o que um humano DECIDIU.
 *
 * Por que `aprovada` é "sem correção", e `corrigida` é o caso separado: o ciclo do banco
 * (constraint `sugestao_ia_status_check`) é pendente → aprovada | corrigida | rejeitada | obsoleta.
 * `corrigida` existe exatamente para marcar "serviu, mas o humano teve que mexer" — que para a
 * régua de autonomia é falha, porque um agente autônomo não teria tido quem corrigisse.
 *
 * O que NÃO dá para fazer, e por que está escrito aqui: comparar `payload_proposto` com
 * `payload_aprovado` seria a checagem mais forte, e ela é impossível hoje — `payload_aprovado` é
 * NULL nas 437 linhas de produção, inclusive nas 12 aprovadas. Enquanto for assim, "sem correção"
 * é o que o STATUS diz, e a UI precisa dizer que a amostra é pequena em vez de fingir régua.
 */

/** Os status que representam uma DECISÃO humana — o denominador da precisão. */
export const STATUS_DECIDIDOS = ["aprovada", "corrigida", "rejeitada"];

/** Acima disto, ler `agente,status` das decididas sai mais caro que head-counts. Medido hoje: 32. */
export const TETO_DECIDIDAS_AGREGACAO = 5000;

export interface PrecisaoAgente {
  agente: string;
  aprovadas: number; // aprovada SEM correção — o numerador
  corrigidas: number; // aprovada COM correção — conta como falha da autonomia
  rejeitadas: number;
  decididas: number; // aprovadas + corrigidas + rejeitadas
  /** aprovadas ÷ decididas, em % com 1 casa. Sem decisão nenhuma → null (não existe precisão de zero). */
  pct: number | null;
}

/** Precisão de UM conjunto de decisões. Base zero → null, nunca 0% nem 100% inventados. */
export function precisao(aprovadas: number, decididas: number): number | null {
  if (decididas <= 0) return null;
  return Math.round((aprovadas / decididas) * 1000) / 10;
}

/**
 * Precisão por agente a partir de UMA leitura estreita de (`agente`,`status`) das decididas.
 * Ordem: pior precisão primeiro (é a que pede ação), com os sem-precisão no fim e desempate
 * por nome — a régua de autonomia lê de cima para baixo.
 */
export function precisaoPorAgente(
  linhas: Array<{ agente?: string | null; status?: string | null }>,
): PrecisaoAgente[] {
  const porAgente = new Map<string, PrecisaoAgente>();
  for (const l of linhas) {
    const status = l.status == null ? "" : String(l.status);
    if (!STATUS_DECIDIDOS.includes(status)) continue; // pendente/obsoleta ficam fora do denominador
    const nome = l.agente == null || l.agente === "" ? "sem agente" : String(l.agente);
    const a =
      porAgente.get(nome) ??
      { agente: nome, aprovadas: 0, corrigidas: 0, rejeitadas: 0, decididas: 0, pct: null };
    if (status === "aprovada") a.aprovadas += 1;
    else if (status === "corrigida") a.corrigidas += 1;
    else a.rejeitadas += 1;
    a.decididas += 1;
    porAgente.set(nome, a);
  }
  return [...porAgente.values()]
    .map((a) => ({ ...a, pct: precisao(a.aprovadas, a.decididas) }))
    .sort((x, y) => (x.pct ?? 101) - (y.pct ?? 101) || x.agente.localeCompare(y.agente, "pt-BR"));
}

/** Precisão do conjunto todo — a linha "geral" do painel. Somar as partes, nunca a média das %. */
export function precisaoGeral(agentes: PrecisaoAgente[]): PrecisaoAgente {
  const soma = agentes.reduce(
    (s, a) => ({
      aprovadas: s.aprovadas + a.aprovadas,
      corrigidas: s.corrigidas + a.corrigidas,
      rejeitadas: s.rejeitadas + a.rejeitadas,
      decididas: s.decididas + a.decididas,
    }),
    { aprovadas: 0, corrigidas: 0, rejeitadas: 0, decididas: 0 },
  );
  return { agente: "geral", ...soma, pct: precisao(soma.aprovadas, soma.decididas) };
}

/**
 * Amostra pequena demais para virar régua? A régua de autonomia (RF-M3) muda o que o sistema faz
 * sozinho; movê-la com 4 decisões é ruído, não medição. O painel mostra a % assim mesmo — mas
 * marcada — porque esconder o número esconderia também que ninguém está validando.
 */
export const MINIMO_DECISOES_PARA_REGUA = 20;

export function amostraFraca(a: PrecisaoAgente): boolean {
  return a.decididas < MINIMO_DECISOES_PARA_REGUA;
}

/** Idade curta de um instante: "45s", "12min", "5h", "18d". Inválido/ausente → null. */
export function idadeCurta(iso: string | null, agora: Date): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const seg = Math.max(0, Math.floor((agora.getTime() - t) / 1000));
  if (seg < 60) return `${seg}s`;
  const min = Math.floor(seg / 60);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Duração amigável a partir de minutos: "45s", "12 min", "1h 05min", "2d 3h". */
export function formatarDuracaoMin(min: number | null): string {
  if (min == null) return "—";
  if (min < 1) return `${Math.round(min * 60)}s`;
  const total = Math.round(min); // arredonda ANTES de fatiar (59,6 min é "1h", não "60 min")
  if (total < 60) return `${total} min`;
  const horas = Math.floor(total / 60);
  if (horas < 24) {
    const resto = total % 60;
    return resto === 0 ? `${horas}h` : `${horas}h ${String(resto).padStart(2, "0")}min`;
  }
  const dias = Math.floor(horas / 24);
  return `${dias}d ${horas % 24}h`;
}
