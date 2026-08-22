import type { CardLead } from "./funil";
import { horasDesde, textoHorasCurto } from "../tempo.ts";

/**
 * ORDENAÇÃO E COR DO CARD — workshop 12/08, o argumento do supermercado: "você sabe quantos
 * segundos você demora pra decidir se pega o produto da prateleira? 3 segundos."
 *
 * As três perguntas que a Sarah faz olhando o board são: quem estourou, quem está parado há mais
 * tempo, e quem está sem responder há mais tempo. Cada uma vira uma ordem — e a primeira vira COR.
 *
 * Lógica PURA e client-safe (sem I/O), no mesmo contrato de `funil-filtros.ts`.
 */

// ─────────────── prioridade (D55/D56, 22/08/2026) ───────────────

/**
 * As QUATRO faixas de prioridade, cravadas pelo Diogo em D55. Nunca três: a quarta existe para
 * DRENAR o cinza — sem ela tudo vira urgente e o vermelho perde sentido, que é exatamente o estado
 * do Kommo hoje com 97,9% da fila vencida.
 *
 * `sem_dado` NÃO é uma quinta faixa: é a ausência de medida. Cinza de hairline e sem rótulo — a UI
 * não afirma urgência que não mediu.
 */
export type FaixaPrioridade = "agora" | "hoje" | "na_semana" | "sem_pressa" | "sem_dado";

/** Prazo por etapa + limiares. Vem de `core.config` chave `sla_etapas` (D56). */
export interface SlaEtapas {
  /** slug da etapa → horas de prazo */
  etapas: Record<string, number>;
  /** limiares da RAZÃO (não dias) — D55 */
  faixas: { agora: number; hoje: number; na_semana: number };
  /** etapa fora de `etapas` cai aqui — nunca "sem prazo" silencioso */
  padraoHoras: number;
  /**
   * Qual relógio alimenta a razão. `maior` = o pior entre "parado na etapa" e "sem troca de
   * mensagem" — os relógios que o sócio nomeou na sala. Quem parou por qualquer um dos caminhos
   * está parado; média diluiria o sinal.
   */
  relogio: "maior" | "etapa" | "mensagem";
  /** D55 item 4: lead com compromisso marcado no futuro não pode ficar vermelho antes da data. */
  pausaComCompromisso: boolean;
  /**
   * false = a config `sla_etapas` ainda não existe no banco e o que está valendo é o
   * `SLA_PADRAO_DECLARADO` abaixo. A tela DIZ isso (legenda do board) — padrão silencioso faria o
   * rótulo mentir, e é a única coisa que o contrato desta frente proíbe explicitamente.
   */
  daConfig: boolean;
}

/**
 * Padrão DECLARADO e visível — o degrau enquanto a migration da `sla_etapas` não desce.
 *
 * As chaves são as slugs REAIS da config `funil_vendas` vigente (lidas de `core.v_config_vigente`
 * em 17/08/2026; ver a fixture de `tests/funil.test.ts`), não as do rascunho do benchmark: em
 * produção a etapa é `aprovacao_e_envio`, com o `e`. Slug errada aqui não quebra nada — cai no
 * `padraoHoras` e o card fica com o prazo do vizinho, que é o modo silencioso de errar.
 *
 * Os números são a proposta da §3.3 do BENCHMARK-PRIORIZACAO-E-COR-DO-CARD-2026-08-22, que embute
 * a regra do sócio: quanto mais avançado no funil, MENOR o tempo disponível.
 */
export const SLA_PADRAO_DECLARADO: SlaEtapas = {
  etapas: {
    incoming_leads: 2,
    lead: 2,
    interessado: 24,
    qualificado: 24,
    audiometria_agendada: 48,
    faltou_audiometria: 12,
    audiometria_realizada: 24,
    consulta_agendada: 48,
    faltou_consulta: 12,
    consulta_realizada: 12,
    aprovacao_e_envio: 12,
    teste_aparelho: 8,
  },
  faixas: { agora: 1.0, hoje: 0.7, na_semana: 0.3 },
  padraoHoras: 24,
  relogio: "maior",
  pausaComCompromisso: true,
  daConfig: false,
};

/**
 * Payload de `core.config` nome='sla_etapas' → `SlaEtapas`. PURO de propósito: o parse é a única
 * coisa que fica entre uma linha do banco e a cor de 97 cards, e precisa ser afirmável por teste.
 *
 * Aceita as DUAS formas do payload porque a migration é de outra frente e eu não posso conferir a
 * escrita daqui: a do CONTRATO travado em 22/08 (`etapas: [{etapa, horas}]` + `faixas`) e a do
 * rascunho da §3.7 do benchmark (`etapas: {slug: {horas}}` + `limiar` com a chave `semana`).
 * Tolerar as duas custa 10 linhas; errar a forma custa o board inteiro na cor errada, calado.
 *
 * `null` → o chamador cai no `SLA_PADRAO_DECLARADO`, com `daConfig: false`, e a tela avisa.
 */
export function interpretarSlaEtapas(payload: unknown): SlaEtapas | null {
  const p = payload as any;
  if (!p || typeof p !== "object") return null;

  const etapas: Record<string, number> = {};
  const horasDe = (v: any): number | null => {
    const n = typeof v === "number" ? v : Number(v?.horas);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  if (Array.isArray(p.etapas)) {
    for (const e of p.etapas) {
      const chave = e?.etapa ?? e?.chave;
      const h = horasDe(e?.horas ?? e);
      if (chave && h != null) etapas[String(chave)] = h;
    }
  } else if (p.etapas && typeof p.etapas === "object") {
    for (const [chave, v] of Object.entries(p.etapas)) {
      const h = horasDe(v);
      if (h != null) etapas[chave] = h;
    }
  }
  if (Object.keys(etapas).length === 0) return null;

  const f = p.faixas ?? p.limiar ?? {};
  const num = (v: any, padrao: number) => (Number.isFinite(Number(v)) ? Number(v) : padrao);
  const D = SLA_PADRAO_DECLARADO.faixas;
  return {
    etapas,
    faixas: {
      agora: num(f.agora, D.agora),
      hoje: num(f.hoje, D.hoje),
      // `na_semana` é o nome do contrato; `semana` é o do rascunho do benchmark
      na_semana: num(f.na_semana ?? f.semana, D.na_semana),
    },
    padraoHoras: num(p.padrao_horas, SLA_PADRAO_DECLARADO.padraoHoras),
    relogio:
      p.relogio === "etapa" || p.relogio === "mensagem" || p.relogio === "maior"
        ? p.relogio
        : SLA_PADRAO_DECLARADO.relogio,
    pausaComCompromisso: p.pausa_com_compromisso !== false,
    daConfig: true,
  };
}

export interface Prioridade {
  faixa: FaixaPrioridade;
  /** horas_paradas ÷ horas_do_prazo_da_etapa. `null` quando não há relógio nenhum. */
  razao: number | null;
  horasParadas: number | null;
  horasPrazo: number;
  /** false = a etapa não estava em `sla_etapas` e o prazo saiu do padrão. A UI conta isso. */
  prazoDeclarado: boolean;
  /** D55: há compromisso marcado no futuro → o relógio está pausado, o card não grita. */
  pausado: boolean;
  /** quanto passou do prazo, em horas. `null` quando não estourou — vira "+3d" no card. */
  excedenteHoras: number | null;
}

/**
 * Horas paradas do card. `relogio: "maior"` pega o PIOR entre os dois relógios que existem hoje:
 *  - `entrou_etapa_em` — "está encalhado na etapa";
 *  - `ultima_mensagem.em` — "ninguém trocou palavra" (nos dois sentidos: a direção separa
 *    "eu não respondi" de "ele não respondeu", mas o tempo parado é o mesmo).
 *
 * Card sem NENHUM dos dois devolve `null`, e `null` nunca vira 0: não saber há quanto tempo o lead
 * está parado não é o mesmo que ele ter acabado de chegar.
 */
export function horasParadas(
  card: Pick<CardLead, "entrou_etapa_em" | "ultima_mensagem">,
  relogio: SlaEtapas["relogio"],
  agora: number,
): number | null {
  const daEtapa = horasDesde(card.entrou_etapa_em, agora);
  const daMensagem = horasDesde(card.ultima_mensagem?.em, agora);
  if (relogio === "etapa") return daEtapa;
  if (relogio === "mensagem") return daMensagem;
  if (daEtapa == null) return daMensagem;
  if (daMensagem == null) return daEtapa;
  return Math.max(daEtapa, daMensagem);
}

/** Prazo da etapa em horas + se ele estava declarado na config (o padrão é visível, nunca mudo). */
export function prazoDaEtapa(etapa: string, sla: SlaEtapas): { horas: number; declarado: boolean } {
  const h = sla.etapas[etapa];
  return Number.isFinite(h) && (h as number) > 0
    ? { horas: h as number, declarado: true }
    : { horas: sla.padraoHoras, declarado: false };
}

/**
 * A REGRA DE COR (D55, travada em 22/08 — não reabrir):
 *
 *   prioridade = horas_paradas / horas_do_prazo_da_etapa      (RAZÃO, não dias)
 *     >= faixas.agora      → AGORA
 *     >= faixas.hoje       → HOJE
 *     >= faixas.na_semana  → NA SEMANA
 *     <  faixas.na_semana  → SEM PRESSA
 *
 * A razão é o que faz a mesma cor significar a mesma coisa em qualquer coluna: 3h numa etapa de 2h
 * é mais vermelho que 2 dias numa de 7. E a regra do sócio — "quanto mais avançado no funil, menor
 * o tempo disponível" — sai de graça: basta o prazo da etapa ser menor.
 */
export function prioridadeCard(
  card: Pick<CardLead, "etapa" | "entrou_etapa_em" | "ultima_mensagem" | "compromisso_em">,
  sla: SlaEtapas,
  agora: number,
): Prioridade {
  const { horas: horasPrazo, declarado: prazoDeclarado } = prazoDaEtapa(card.etapa, sla);
  const paradas = horasParadas(card, sla.relogio, agora);

  // D55 item 4 · lead com audiometria marcada para quinta não pode ficar vermelho na terça. É o
  // "Evergreen" do Trello e o pause condition do Jira; o Pipedrive NÃO tem, e é reclamação
  // documentada dos usuários dele. Sem escape, o alerta vira ruído.
  const pausado =
    sla.pausaComCompromisso &&
    card.compromisso_em != null &&
    new Date(card.compromisso_em).getTime() > agora;

  if (paradas == null) {
    return { faixa: "sem_dado", razao: null, horasParadas: null, horasPrazo, prazoDeclarado, pausado, excedenteHoras: null };
  }

  const razao = paradas / horasPrazo;
  const excedenteHoras = razao >= 1 ? paradas - horasPrazo : null;
  const faixa: FaixaPrioridade = pausado
    ? "sem_pressa" // pausado NÃO vira quinta faixa: some do alarme e o rótulo diz por quê
    : razao >= sla.faixas.agora
      ? "agora"
      : razao >= sla.faixas.hoje
        ? "hoje"
        : razao >= sla.faixas.na_semana
          ? "na_semana"
          : "sem_pressa";

  return { faixa, razao, horasParadas: paradas, horasPrazo, prazoDeclarado, pausado, excedenteHoras };
}

/**
 * RÓTULO ESCRITO — obrigatório, não enfeite (WCAG 2.2 SC 1.4.1). O board exige que a pessoa saiba
 * QUAL nível é, não só que os cards diferem; nesse caso o Understanding do W3C mantém o indicador
 * adicional obrigatório mesmo com contraste sobrando. E o par crítico aqui é vermelho × âmbar,
 * dois quentes vizinhos que a protanopia (≈1% dos homens) aproxima.
 *
 * `sem_dado` fica sem rótulo de propósito: cinza de hairline não afirma urgência nenhuma, então não
 * há nível para nomear (o texto para leitor de tela está em TEXTO_FAIXA).
 */
export const ROTULO_FAIXA: Record<FaixaPrioridade, string> = {
  agora: "AGORA",
  hoje: "HOJE",
  na_semana: "NA SEMANA",
  sem_pressa: "SEM PRESSA",
  sem_dado: "",
};

/** Texto longo (leitor de tela / tooltip). O tooltip NÃO conta como canal — o rótulo é que conta. */
export const TEXTO_FAIXA: Record<FaixaPrioridade, string> = {
  agora: "Prioridade AGORA — passou do prazo da etapa",
  hoje: "Prioridade HOJE — chegando no prazo da etapa",
  na_semana: "Prioridade NA SEMANA",
  sem_pressa: "Sem pressa — dentro do prazo da etapa",
  sem_dado: "Sem data de entrada na etapa e sem mensagem datada — prioridade não medida",
};

/**
 * Tokens da escala, medidos contra `#FFF` na §3.5 do benchmark:
 *  vermelho #B3372B 6,00:1 · âmbar #B27A00 3,70:1 · navy #252F63 12,61:1 · suave #67707B 5,02:1.
 * O `--p4 #9AA0A8` do mockup foi REPROVADO por medida (2,64:1, abaixo do piso de 3:1 do SC 1.4.11)
 * e trocado por `suave`.
 *
 * ⚠️ `timer-velho` NÃO entra aqui, e é o ponto: ele é o MESMO hex do `amarelo` (#B27A00) e estava
 * pintando o timer do canto com a cor da faixa HOJE em cima de cards que a faixa já classificava
 * como AGORA — dois alarmes com a mesma tinta dizendo coisas diferentes.
 */
export const TRILHO_FAIXA: Record<FaixaPrioridade, string> = {
  agora: "bg-vermelho",
  hoje: "bg-amarelo",
  na_semana: "bg-navy",
  sem_pressa: "bg-suave",
  sem_dado: "bg-linha",
};

export const TEXTO_COR_FAIXA: Record<FaixaPrioridade, string> = {
  agora: "text-vermelho",
  hoje: "text-amarelo",
  na_semana: "text-navy",
  sem_pressa: "text-suave",
  sem_dado: "text-mute",
};

/** A escala inteira, na ordem, para a legenda do board. `sem_dado` fica fora — não é nível. */
export const FAIXAS_ESCALA: FaixaPrioridade[] = ["agora", "hoje", "na_semana", "sem_pressa"];

/**
 * D56 item 2 · o teto de 15%: se mais de 15% da fila está em AGORA, o critério está frouxo e a cor
 * virou ruído — é literalmente o estado do Kommo, com 97,9% da fila vencida. O teto precisava de um
 * ALARME, senão é só uma frase num documento; esta função é esse alarme.
 */
export const TETO_AGORA = 0.15;

export function excedeuTetoAgora(qtdAgora: number, qtdTotal: number): boolean {
  return qtdTotal > 0 && qtdAgora / qtdTotal > TETO_AGORA;
}

/**
 * "AGORA · +3d" em vez de só "atrasado". É o valor negativo do Zendesk: sem o excedente, "atrasado
 * há 2h" e "atrasado há 142d" viram a mesma coisa — que é o estado atual do Kommo.
 */
export function textoExcedente(p: Prioridade): string {
  return p.excedenteHoras == null ? "" : `+${textoHorasCurto(p.excedenteHoras)}`;
}

// ─────────────── ordenação ───────────────

export type ChaveOrdem = "prioridade" | "parado" | "sem_resposta" | "recentes";

export interface OpcaoOrdem {
  chave: ChaveOrdem;
  rotulo: string;
  /** o que a ordem responde, em uma linha — vai no menu abaixo do rótulo */
  ajuda: string;
}

export const ORDENS: OpcaoOrdem[] = [
  { chave: "prioridade", rotulo: "Mais urgente primeiro", ajuda: "AGORA no topo, depois HOJE, NA SEMANA e SEM PRESSA" },
  { chave: "parado", rotulo: "Mais parados primeiro", ajuda: "Quem está há mais tempo na mesma etapa" },
  { chave: "sem_resposta", rotulo: "Sem resposta há mais tempo", ajuda: "Última mensagem mais antiga no topo" },
  { chave: "recentes", rotulo: "Mais recentes primeiro", ajuda: "Quem entrou na etapa por último" },
];

export const ORDEM_PADRAO: ChaveOrdem = "prioridade";

/** Epoch ms de um ISO, ou `null` quando não dá para saber. Nunca 0 disfarçado de data. */
function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Compara duas datas onde "mais antigo primeiro" é o que interessa. Card SEM a data vai para o
 * fim, sempre: não saber há quanto tempo o lead está parado não é o mesmo que ele estar parado
 * há muito tempo, e jogá-lo no topo seria a UI afirmando uma urgência que ela não mediu.
 */
function maisAntigoPrimeiro(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

/**
 * A POSIÇÃO é o segundo canal de acessibilidade (§3.5 do benchmark), e por isso a ordem padrão é a
 * da prioridade: quem não distingue vermelho de âmbar ainda lê "de cima para baixo é do mais
 * urgente ao menos". Close e Zendesk tratam a ordem como canal principal, e eles têm razão.
 *
 * Ordena uma cópia — a lista original é a projeção e não se mexe nela. Desempate final é sempre
 * `lead_id`, para a ordem ser estável entre dois refreshes (card que troca de lugar sozinho a
 * cada polling é card que a pessoa perde de vista).
 */
export function ordenarCards(
  cards: CardLead[],
  ordem: ChaveOrdem,
  agora: number,
  // o padrão DECLARADO como default existe para os chamadores fora do board (a página de
  // protótipo, que roda sobre fixtures) — o board sempre passa o SLA que leu do banco.
  sla: SlaEtapas = SLA_PADRAO_DECLARADO,
): CardLead[] {
  const copia = cards.slice();
  // memo da razão: `ordenarCards` roda por coluna a cada tick de minuto, e `prioridadeCard` seria
  // recalculada O(n log n) vezes por card sem isto.
  const pressao = new Map<string, number | null>();
  if (ordem === "prioridade") {
    for (const c of copia) {
      const p = prioridadeCard(c, sla, agora);
      // pausado desce junto com a faixa: quem tem compromisso marcado não disputa o topo
      pressao.set(c.lead_id, p.faixa === "sem_dado" || p.pausado ? null : p.razao);
    }
  }
  copia.sort((a, b) => {
    let d = 0;
    switch (ordem) {
      case "prioridade": {
        const x = pressao.get(a.lead_id) ?? null;
        const y = pressao.get(b.lead_id) ?? null;
        // maior razão primeiro; sem medida vai para o fim (mesma regra de `maisAntigoPrimeiro`)
        if (x == null && y == null) d = 0;
        else if (x == null) d = 1;
        else if (y == null) d = -1;
        else d = y - x;
        // dentro da mesma pressão, o mais parado manda — senão a faixa vira balde sem ordem
        if (d === 0) d = maisAntigoPrimeiro(ms(a.entrou_etapa_em), ms(b.entrou_etapa_em));
        break;
      }
      case "parado":
        d = maisAntigoPrimeiro(ms(a.entrou_etapa_em), ms(b.entrou_etapa_em));
        break;
      case "sem_resposta":
        d = maisAntigoPrimeiro(ms(a.ultima_mensagem?.em), ms(b.ultima_mensagem?.em));
        break;
      case "recentes": {
        const x = ms(a.entrou_etapa_em);
        const y = ms(b.entrou_etapa_em);
        if (x == null && y == null) d = 0;
        else if (x == null) d = 1;
        else if (y == null) d = -1;
        else d = y - x;
        break;
      }
    }
    return d !== 0 ? d : a.lead_id.localeCompare(b.lead_id);
  });
  return copia;
}

/**
 * "que dia foi que ele mandou isso" — a primeira pergunta da Sarah ao olhar um card. Formato
 * curto para caber na linha: "hoje 14:32", "ontem 09:10", "12/08".
 */
export function dataUltimaMensagem(iso: string | null | undefined, agora: number): string {
  const t = ms(iso);
  if (t == null) return "";
  const dia = 86_400_000;
  const meiaNoite = (x: number) => Math.floor((x - 3 * 3_600_000) / dia);
  const delta = meiaNoite(agora) - meiaNoite(t);
  const d = new Date(t - 3 * 3_600_000);
  const hhmm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  if (delta === 0) return `hoje ${hhmm}`;
  if (delta === 1) return `ontem ${hhmm}`;
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
