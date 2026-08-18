/**
 * AUTONOMIA POR TIPO DE TAREFA — decisão D10 do Diogo (18/08).
 *
 * O que ela conserta: o cartão de sugestão pedia aprovação para tudo, inclusive para
 * "lead falou há 28 dias e ninguém respondeu" — onde não existe julgamento a fazer. Ou responde
 * ou perde o lead. Pedir aprovação ali não é cuidado, é burocracia, e burocracia é como o
 * cartão que IMPORTA vira mais uma coisa pra clicar.
 *
 * A regra nova é: **o tipo da tarefa carrega o modo**. E ela é CONFIG, não código — por isso o
 * que está aqui não é um `if` com a lista dentro, e sim dois documentos de dados com a MESMA
 * FORMA que o banco já tem, para o dia em que saírem daqui e virarem leitura de `core.config`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * O VOCABULÁRIO NÃO É MEU — é o da trilha B desta rodada (migrations 0160/0161/0165), lido
 * antes de escrever uma linha. Reaproveitado palavra por palavra:
 *
 *   nível ∈ auto | propor | proibido          (0165, `autonomia_jsonb`)
 *   teto  = { tetos: [{ chave, teto_nivel, fundamento }] }   (0161, `flag.teto_autonomia`)
 *   teto ausente ⇒ `propor`                   (0161: "coalesce(<teto declarado>, 'propor')")
 *   nível `auto` é RECUSADO se o teto não for `auto`         (0160, guarda em todo caminho)
 *
 * As duas camadas são separadas de propósito, e a 0161 explica melhor do que eu conseguiria:
 * "TETO ≠ CONFIGURAÇÃO. Isto declara o que é PERMITIDO configurar." O teto é constitucional e
 * só muda por emenda; o nível é preferência da operação e muda sem deploy. Colapsar as duas
 * numa lista só é exatamente como uma proibição do Art. III.3 vira uma preferência que alguém
 * desmarca numa tarde.
 *
 * FAIL-CLOSED: tipo de tarefa que ninguém declarou cai em `propor`. Nunca em `auto`. Declarar
 * autonomia por ausência é o que a 0161 recusou a fazer, e ela estava certa.
 */

/** Os três níveis da 0165. Nada além disto é nível. */
export type NivelAutonomia = "auto" | "propor" | "proibido";

/** O teto nunca é `proibido` — ele limita o que se PODE configurar, e `proibido` já é o piso. */
export type NivelTeto = "auto" | "propor";

export interface TetoTarefa {
  chave: string;
  teto_nivel: NivelTeto;
  /** por que este teto existe. A 0161 exige fundamento em cada linha; aqui também. */
  fundamento: string;
}

/**
 * `flag.teto_autonomia` para TAREFAS — mesma forma do payload da 0161.
 *
 * Só entra aqui o que tem fundamento escrito. As três proibições constitucionais (Art. III.3)
 * ficam com teto `propor`: o teto impede `auto` por construção, e o nível `proibido` logo
 * abaixo tira até o `propor`. É a mesma dobradinha que a 0165 usa nas quatro sensíveis da
 * Clara — e a razão é a que ela escreve: o teto sozinho ainda deixaria "a IA escreve e um
 * humano aprova", e o que se quer dizer é **nunca**.
 */
export const TETOS_TAREFA: { tetos: TetoTarefa[] } = {
  tetos: [
    {
      chave: "acompanhar_follow_up",
      teto_nivel: "auto",
      fundamento:
        "Responder lead parado nao tem decisao dentro: ou responde ou perde o lead (D10). " +
        "Pedir aprovacao para isso e burocracia, e burocracia gasta a atencao que a decisao " +
        "de verdade vai precisar.",
    },
    {
      chave: "confirmar_exame",
      teto_nivel: "auto",
      fundamento:
        "O dia da operacao e perseguir audiometria (D10). Exame agendado? enviou? realizou? " +
        "sao perguntas de acompanhamento, nao de julgamento — e sao o gate que destrava todo " +
        "o resto do funil.",
    },
    {
      chave: "primeiro_toque",
      teto_nivel: "auto",
      fundamento:
        "Primeiro toque por TEMPLATE: o texto ja foi aprovado uma vez, quando o template foi " +
        "aprovado. Reaprovar o mesmo texto a cada lead e aprovar duas vezes a mesma coisa.",
    },
    {
      chave: "ligar_lead",
      teto_nivel: "propor",
      fundamento:
        "Ligacao consome o recurso mais escasso da Sarah e nao da para desfazer depois de " +
        "tocar. Quando ligar, e se vale a pena ligar, e julgamento dela.",
    },
    {
      chave: "cobrar_terceiro",
      teto_nivel: "propor",
      fundamento:
        "Cobrar SUS, dentista ou familiar fala com quem NAO e nosso cliente, em nome dele. " +
        "Quem decide expor o paciente a um terceiro e uma pessoa.",
    },
    {
      chave: "marcar_perdido",
      teto_nivel: "propor",
      fundamento:
        "Marcar perdido encerra o lead e some com ele do board. Reversivel no banco, " +
        "irreversivel na atencao: card que sai da tela nao volta a ser lembrado.",
    },
    // ─── Art. III.3 · limite duro. Teto `propor` impede `auto`; o nivel `proibido` fecha o resto.
    {
      chave: "validar_serasa",
      teto_nivel: "propor",
      fundamento:
        "Art. III.3: credito e area do Levindo e nunca nasce sozinho. Mesmo fundamento da " +
        "0165 para `recomendar_credito`.",
    },
    {
      chave: "confirmar_pagamento",
      teto_nivel: "propor",
      fundamento:
        "Art. III.3: cobranca financeira e ato com consequencia juridica e de relacao. " +
        "Mesmo fundamento da 0165 para `negociar`.",
    },
    {
      chave: "negociar_preco",
      teto_nivel: "propor",
      fundamento:
        "Art. III.3 e D8 (17/08): preco e da fono, que e quem negocia na operacao real. " +
        "Mesmo fundamento da 0165 para `falar_preco`.",
    },
  ],
};

/**
 * `autonomia_jsonb` para TAREFAS — mesma forma da 0165: um mapa chave → nível, e nada mais.
 * Isto é o que a operação escolheu DENTRO do que o teto permite, e é o que muda sem deploy.
 */
export const AUTONOMIA_TAREFA: Record<string, NivelAutonomia> = {
  // nascem criadas — não há julgamento a fazer (D10)
  acompanhar_follow_up: "auto",
  confirmar_exame: "auto",
  primeiro_toque: "auto",
  // propõem — existe decisão real, e ela é da Sarah (D10)
  ligar_lead: "propor",
  cobrar_terceiro: "propor",
  marcar_perdido: "propor",
  // Art. III.3 — não é preferência, é proibição
  validar_serasa: "proibido",
  confirmar_pagamento: "proibido",
  negociar_preco: "proibido",
};

/** Rótulo humano de cada nível — a tela nunca mostra a chave crua. */
export const ROTULO_NIVEL: Record<NivelAutonomia, string> = {
  auto: "Nasce criada",
  propor: "Pede aprovação",
  proibido: "Nunca automática",
};

/**
 * O teto de um tipo. Espelha `core.teto_capacidade`: o que não foi declarado vale `propor`.
 * Fail-closed, e é o ponto — a 0161 mostrou o custo de "declarar por ausência".
 */
export function tetoTarefa(chave: string): NivelTeto {
  return TETOS_TAREFA.tetos.find((t) => t.chave === chave)?.teto_nivel ?? "propor";
}

/** O fundamento do teto, para a tela poder dizer POR QUE algo não pode ser automático. */
export function fundamentoTeto(chave: string): string | null {
  return TETOS_TAREFA.tetos.find((t) => t.chave === chave)?.fundamento ?? null;
}

export interface Decisao {
  nivel: NivelAutonomia;
  /** a config pediu `auto` e o teto recusou — o mesmo caso que a 0160 barra na porta */
  rebaixadoPeloTeto: boolean;
  /** por que ficou neste nível, em uma frase — a tela mostra, não esconde */
  fundamento: string;
}

/**
 * A decisão efetiva para um tipo de tarefa. É a única função que a UI deve chamar; ninguém
 * lê `AUTONOMIA_TAREFA` direto, porque ler o mapa cru é como o teto deixa de ser aplicado.
 *
 * Reproduz a guarda da 0160 no cliente: `auto` só vale se o teto for `auto`. Se a config pedir
 * `auto` onde o teto é `propor`, o pedido NÃO é atendido nem ignorado em silêncio — vira
 * `propor` com a marca de que foi rebaixado, que é o que permite alguém descobrir o conflito.
 */
export function decidirAutonomia(chave: string): Decisao {
  const configurado = AUTONOMIA_TAREFA[chave] ?? "propor";
  const teto = tetoTarefa(chave);

  if (configurado === "auto" && teto !== "auto") {
    return {
      nivel: "propor",
      rebaixadoPeloTeto: true,
      fundamento:
        fundamentoTeto(chave) ??
        "Sem teto declarado para este tipo — o padrao seguro e pedir aprovacao.",
    };
  }

  if (configurado === "proibido") {
    return {
      nivel: "proibido",
      rebaixadoPeloTeto: false,
      fundamento: fundamentoTeto(chave) ?? "Proibido por decisao da operacao.",
    };
  }

  return {
    nivel: configurado,
    rebaixadoPeloTeto: false,
    fundamento:
      fundamentoTeto(chave) ??
      "Tipo nao declarado no teto — cai em `propor` por fail-closed (0161).",
  };
}

/**
 * Rótulo de cada tipo. Os quatro primeiros são chaves que a config `tipo_tarefa` JÁ tem
 * (migration 0037, espelhadas em `lib/tarefa-tipos.ts`) — reaproveitadas, não recriadas.
 * As cinco últimas nasceram do workshop e ainda NÃO estão na config: quando entrarem, esta
 * constante some e o rótulo passa a vir do banco, como o dos outros.
 */
export const ROTULO_TIPO_TAREFA: Record<string, string> = {
  acompanhar_follow_up: "Acompanhar / Follow-up",
  confirmar_exame: "Confirmar exame",
  validar_serasa: "Validar Serasa",
  confirmar_pagamento: "Confirmar pagamento",
  primeiro_toque: "Primeiro toque",
  ligar_lead: "Ligar para o lead",
  cobrar_terceiro: "Cobrar terceiro",
  marcar_perdido: "Marcar como perdido",
  negociar_preco: "Negociar preço",
};

export function rotuloTipo(chave: string): string {
  return ROTULO_TIPO_TAREFA[chave] ?? chave;
}
