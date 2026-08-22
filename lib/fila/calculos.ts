/**
 * CÁLCULO PURO DA FILA DE VALIDAÇÃO — sem banco, sem React.
 *
 * Separado de `app/(app)/fila/dados.ts` em 22/08 por um motivo só: o que decide se a Sarah vê o
 * botão Aprovar, e o que decide QUAL texto o cartão mostra, estava misturado com a leitura do
 * Supabase e por isso não tinha um único teste. Foram 1.042 linhas novas com zero cobertura numa
 * tela em que aprovar errado manda mensagem ao paciente.
 *
 * Aqui não entra nada que precise de conexão. `dados.ts` lê, isto decide, `lista.tsx` desenha.
 */

export interface TrechoConversa {
  direcao: string;
  corpo: string;
  criadoEm: string;
}

export interface Proposta {
  id: string;
  agente: string;
  agenteRotulo: string;
  tipo: string;
  tipoRotulo: string;
  /** O que o agente quer fazer, em uma frase, sem jargão. */
  tipoExplicacao: string;
  criadoEm: string;
  /** Texto proposto. String vazia = o agente não escreveu nada (124 casos em 22/08). */
  corpo: string;
  /** É uma mensagem que sairia para o paciente? Muda o que a tela pode afirmar sobre o vazio. */
  ehMensagem: boolean;
  /** Campos extras do que foi proposto, já com rótulo legível. Vazio na maioria. */
  detalhes: Array<{ rotulo: string; valor: string }>;
  leadNome: string | null;
  leadId: string | null;
  telefone: string | null;
  /** As últimas mensagens da conversa, da mais antiga para a mais nova. */
  trecho: TrechoConversa[];
  /**
   * `trecho` vazio porque a leitura das mensagens SATUROU o teto, não porque a conversa esteja
   * vazia. A tela precisa saber a diferença: sumir com o contexto calado faz quem valida achar
   * que o paciente não disse nada.
   */
  trechoIncerto: boolean;
  /** null = pode aprovar. Texto = por que não pode, em português de quem usa. */
  bloqueio: string | null;
  /**
   * QUAL impedimento. Existe porque a tela precisa decidir ONDE dizer, não só O QUE dizer:
   * quando o texto está vazio, o próprio lugar do texto já carrega a frase, e repeti-la numa
   * tarja logo abaixo diz a mesma coisa duas vezes no mesmo cartão.
   */
  bloqueioTipo: "sem_texto" | "vencida" | null;
}

export interface ContagemAgente {
  agente: string;
  rotulo: string;
  qtd: number;
}

/** Vale enquanto ninguém publicar a config de validade. Mesmo número que a porta usa. */
export const HORAS_VALIDADE_PADRAO = 48;

/**
 * Tipos cuja aprovação a porta recusa DEPOIS DA JANELA DE FRESCOR.
 *
 * O recorte é o mesmo da migration 0106 (`s.tipo in ('enviar_mensagem','enviar_mensagem_humana')`)
 * — e é só o da validade. Não é "os tipos que a porta valida": a porta valida todos, cada um do
 * seu jeito. Confundir os dois foi exatamente o defeito consertado em `motivoBloqueio`.
 */
export const TIPOS_COM_VALIDADE = new Set(["enviar_mensagem", "enviar_mensagem_humana"]);

const ROTULO_TIPO: Record<string, { rotulo: string; explicacao: string }> = {
  enviar_mensagem: {
    rotulo: "Responder no WhatsApp",
    explicacao: "O agente escreveu uma resposta e quer enviá-la ao paciente.",
  },
  enviar_mensagem_humana: {
    rotulo: "Responder no WhatsApp",
    explicacao: "Mensagem preparada para sair em nome da equipe.",
  },
  recomendar_condicoes_credito: {
    rotulo: "Sugerir condições de pagamento",
    explicacao: "Recomendação de crédito para este paciente — nada é oferecido sem você aprovar.",
  },
  atualizar_prompt: {
    rotulo: "Mudar como um agente conversa",
    explicacao: "Altera as instruções de um agente. Só administrador aplica.",
  },
};

export function rotuloTipo(tipo: string) {
  return (
    ROTULO_TIPO[tipo] ?? {
      rotulo: tipo.replace(/_/g, " "),
      explicacao: "Proposta de um agente aguardando sua decisão.",
    }
  );
}

/**
 * ONDE MORA O TEXTO DA PROPOSTA, por tipo.
 *
 * Não é sempre `corpo`. Medido em 22/08 nas 405 pendentes: 404 trazem `corpo`, mas a proposta
 * de `atualizar_prompt` do Jarvis não tem a chave `corpo` — ela carrega 38.047 caracteres em
 * `prompt_novo`. Lendo só `corpo`, a tela dizia "o agente não escreveu nada, recuse" sobre a
 * ÚNICA proposta da fila com conteúdo de sobra, e ainda oferecia o botão Aprovar ao lado.
 *
 * Por isso o de-para é declarado por tipo em vez de um encadeamento de `??` solto: quando
 * aparecer um tipo novo, o lugar de dizer onde está o texto dele é aqui, e a ausência salta à
 * vista em vez de virar mais um cartão em branco.
 */
const CHAVES_TEXTO_POR_TIPO: Record<string, string[]> = {
  enviar_mensagem: ["corpo", "texto"],
  enviar_mensagem_humana: ["corpo", "texto"],
  atualizar_prompt: ["corpo", "prompt_novo"],
  recomendar_condicoes_credito: ["corpo", "texto"],
};
const CHAVES_TEXTO_PADRAO = ["corpo", "texto"];

export function extrairTexto(tipo: string, payload: Record<string, unknown>): string {
  for (const chave of CHAVES_TEXTO_POR_TIPO[tipo] ?? CHAVES_TEXTO_PADRAO) {
    const v = payload?.[chave];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return "";
}

/** Campos do payload que a tela mostra além do texto — o resto é telemetria do motor. */
const ROTULO_DETALHE: Record<string, string> = {
  justificativa: "Por quê",
  agente_alvo: "Agente afetado",
  proposto_por: "Proposto por",
};

export function extrairDetalhes(
  payload: Record<string, unknown>,
): Array<{ rotulo: string; valor: string }> {
  const saida: Array<{ rotulo: string; valor: string }> = [];
  for (const [chave, rotulo] of Object.entries(ROTULO_DETALHE)) {
    const bruto = payload?.[chave];
    if (bruto == null || bruto === "") continue;
    const valor = typeof bruto === "string" ? bruto : JSON.stringify(bruto);
    saida.push({ rotulo, valor: valor.length > 400 ? valor.slice(0, 400) + "…" : valor });
  }
  return saida;
}

/**
 * Por que esta proposta não pode ser aprovada — decidido AQUI, na leitura, e não no clique.
 *
 * As duas razões são as mesmas que a porta aplica; a diferença é que a porta responde depois do
 * clique, com o texto de um erro de banco, e a tela responde antes, com o texto de quem trabalha.
 *
 * ── CONSERTO 22/08: as duas razões tinham ALCANCES DIFERENTES e estavam sob a MESMA guarda. ──
 * O bloco inteiro vivia dentro de `if (TIPOS_COM_VALIDADE.has(tipo))`. Efeito medido: proposta de
 * `atualizar_prompt` sem texto saía com `bloqueio = null`, o cartão dizia "O agente não escreveu
 * nada" no lugar do texto E oferecia o botão "Aprovar e enviar" logo abaixo. Clicar chamava a
 * porta, que recusa esse caso na cara dura (0106, ramo `atualizar_prompt`: `if v_agente_alvo is
 * null or v_prompt_novo is null or length(btrim(v_prompt_novo)) = 0 then raise`). Ou seja: a tela
 * fazia o contrário do que ela existe para fazer, justamente no tipo que não é mensagem.
 *
 * Agora o alcance de cada razão é o alcance REAL dela:
 *   · sem texto  → TODO tipo. Não existe proposta aprovável sem conteúdo, em tipo nenhum.
 *   · vencida    → só os de `TIPOS_COM_VALIDADE`, que é o mesmo recorte da guarda da porta.
 *
 * Se a porta um dia mudar de ideia e aceitar, o pior que acontece é a tela ser conservadora — o
 * contrário (tela permissiva, porta recusando) é o que produzia a tela de erro.
 */
export function motivoBloqueio(
  tipo: string,
  corpo: string,
  criadoEm: string,
  horasValidade: number,
  agora: number,
): { bloqueio: string | null; bloqueioTipo: Proposta["bloqueioTipo"] } {
  if (corpo.trim().length === 0) {
    return {
      bloqueio: TIPOS_COM_VALIDADE.has(tipo)
        ? "O agente não escreveu nada. Não há mensagem para enviar — recuse para tirar isto da fila."
        : "O agente não escreveu nada. Não há o que revisar — recuse para tirar isto da fila.",
      bloqueioTipo: "sem_texto",
    };
  }
  if (TIPOS_COM_VALIDADE.has(tipo)) {
    const idadeH = (agora - Date.parse(criadoEm)) / 3_600_000;
    if (Number.isFinite(idadeH) && idadeH > horasValidade) {
      const dias = Math.floor(idadeH / 24);
      const quanto = dias >= 2 ? `${dias} dias` : `${Math.round(idadeH)} horas`;
      return {
        bloqueio: `Escrita há ${quanto}. A conversa já seguiu — enviar isto agora responderia a uma pergunta que o paciente não lembra de ter feito. Recuse e peça uma nova.`,
        bloqueioTipo: "vencida",
      };
    }
  }
  return { bloqueio: null, bloqueioTipo: null };
}

export function rotuloAgente(slug: string, mapa: Record<string, string>): string {
  return mapa[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * Quebra por agente. Recebe as linhas JÁ LIDAS — a contagem é aritmética, não consulta.
 *
 * A ordem é decidida aqui e importa: maior fila primeiro (é por onde a Sarah começa) e, no
 * empate, alfabética em pt-BR, para a barra de filtros não trocar de ordem entre dois carregamentos
 * com os mesmos números.
 */
export function agruparPorAgente(
  linhas: Array<{ agente?: unknown }>,
  rotulos: Record<string, string>,
): ContagemAgente[] {
  const conta = new Map<string, number>();
  for (const s of linhas) {
    const a = String(s?.agente ?? "").trim() || "(sem agente)";
    conta.set(a, (conta.get(a) ?? 0) + 1);
  }
  return [...conta.entries()]
    .map(([agente, qtd]) => ({ agente, rotulo: rotuloAgente(agente, rotulos), qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}
