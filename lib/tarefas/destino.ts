/**
 * PARA ONDE UMA TAREFA LEVA (31/08) — clicar numa tarefa abre A CONVERSA, na ALTURA em que a
 * tarefa nasceu.
 *
 * O que mudou e por quê: o card levava para `/funil?lead=…`, que responde "quem é essa pessoa" —
 * mas a pergunta de quem abre uma tarefa é outra: *"por que isto virou tarefa?"*. Essa resposta
 * está no fio da conversa, no momento em que a tarefa foi criada. Com o Jarvis criando tarefa a
 * partir da conversa (D62), o POR QUE no card cita uma frase; o clique tem de cair EXATAMENTE nela.
 *
 * A âncora é o INSTANTE (`criado_em`), não o id da mensagem: tarefa não guarda ponteiro para
 * mensagem, e a conversa é ordenada no tempo. O inbox resolve o instante para a última mensagem
 * anterior ou igual a ele — determinístico, e continua valendo se a tarefa nasceu de uma varredura
 * (sem mensagem nenhuma no gatilho).
 */

export interface TarefaComDestino {
  lead_id: string | null;
  /** ISO. Quando a tarefa nasceu — é o que vira âncora no fio. */
  criado_em?: string | null;
}

/** `null` = tarefa sem lead (interna): não há conversa para abrir, e o card não vira link. */
export function destinoDaTarefa(t: TarefaComDestino): string | null {
  if (!t.lead_id) return null;
  const p = new URLSearchParams({ lead: t.lead_id });
  if (t.criado_em) p.set("em", t.criado_em);
  return `/conversas?${p.toString()}`;
}

/**
 * A mensagem onde o fio deve parar: a ÚLTIMA com `criado_em <= em`. Se a âncora for anterior a
 * tudo que está carregado, devolve a mais antiga — e quem chama avisa que é aproximação, em vez
 * de rolar para o fim fingindo que achou.
 */
export function idDaAncora(
  mensagens: ReadonlyArray<{ id: string; criado_em: string }>,
  em: string | null | undefined,
): { id: string; exata: boolean } | null {
  if (!em || mensagens.length === 0) return null;
  const alvo = Date.parse(em);
  if (Number.isNaN(alvo)) return null;

  let escolhida: { id: string; criado_em: string } | null = null;
  let maisAntiga: { id: string; criado_em: string } | null = null;
  for (const m of mensagens) {
    const t = Date.parse(m.criado_em);
    if (Number.isNaN(t)) continue;
    if (!maisAntiga || t < Date.parse(maisAntiga.criado_em)) maisAntiga = m;
    if (t <= alvo && (!escolhida || t > Date.parse(escolhida.criado_em))) escolhida = m;
  }
  if (escolhida) return { id: escolhida.id, exata: true };
  return maisAntiga ? { id: maisAntiga.id, exata: false } : null;
}
