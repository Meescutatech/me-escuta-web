/**
 * VOCABULÁRIO DAS SUPERFÍCIES DO JARVIS (W-J, 10/09/2026).
 *
 * Um tipo só para a proposta, em qualquer lugar em que ela apareça — no fio da conversa
 * (`proposta-inline.tsx`), na lista de /tarefas (`proposta-tarefa-card.tsx`) e, amanhã, no painel
 * do lead. Os nomes dos campos são os do contrato do worker (`src/jarvis/tarefas/contrato.ts` do
 * runtime: `fazer`, `por_que`, `trecho`, `prazo_horas`) e do payload que a 0298 projeta — de
 * propósito, para que a tela não invente um segundo dicionário.
 *
 * ESTADOS — é o ciclo de vida da sugestão em `core.sugestao_ia` + o que a tarefa vira depois:
 *
 *   proposta    → o Jarvis propôs; ninguém decidiu. `criar_tarefa` em `auto` (0297) NÃO passa por
 *                 aqui: a tarefa nasce criada e o fio mostra "Jarvis criou" (registro-interno.tsx).
 *                 Este estado é o dos tipos em `propor` — e do "Pedir ao Jarvis" sob demanda.
 *   aceita      → `validar_sugestao(aprovada)` → `tarefa_criada` igual ao proposto.
 *   ajustada    → `validar_sugestao(aprovada, payload)` → `tarefa_criada` com campos editados e
 *                 `ajustada_de: sugestao_id`. Discordar do robô fica no ledger (Constituição §1.2).
 *   descartada  → `validar_sugestao(rejeitada)` → `sugestao_rejeitada`, com motivo (é o dataset do
 *                 eval: LiderHub gravava sent_as_is/sent_edited/discarded e nós também devemos).
 *   feita       → a tarefa que nasceu daqui foi concluída (`tarefa_concluida`). Fecha o ciclo na
 *                 mesma superfície em que abriu — a pessoa vê "propôs → aceitou → fez" sem sair do fio.
 *
 * Campos `decidido_por`/`decidido_em` são SEMPRE de pessoa. O Jarvis nunca decide sobre a própria
 * proposta; quem aparece ali é a Sara, a Ana Paula, o Rodolfo.
 */

export type EstadoProposta = "proposta" | "aceita" | "ajustada" | "descartada" | "feita";

export type PrazoCurto = "hoje" | "amanha" | "esta_semana";

export const ROTULO_PRAZO: Record<PrazoCurto, string> = {
  hoje: "Hoje",
  amanha: "Amanhã",
  esta_semana: "Esta semana",
};

/** Motivos de descarte — três, curtos; o texto livre vai em `observacao`. */
export type MotivoDescarte = "ja_resolvido" | "nao_faz_sentido" | "outro";

export const ROTULO_MOTIVO: Record<MotivoDescarte, string> = {
  ja_resolvido: "Já resolvido",
  nao_faz_sentido: "Não faz sentido",
  outro: "Outro motivo",
};

export interface Pessoa {
  id: string;
  nome: string;
}

export interface AjusteProposta {
  fazer?: string;
  prazo?: PrazoCurto | string | null;
  responsavel_id?: string | null;
  responsavel_nome?: string | null;
}

export interface PropostaJarvis {
  /** `core.sugestao_ia.id` (ou id de fixture) */
  id: string;
  lead_id?: string | null;
  lead_nome?: string | null;
  conversa_id?: string | null;
  /** FAZER — imperativo curto; vira o título da tarefa */
  fazer: string;
  /** POR QUE AGORA — o motivo medido na conversa */
  por_que: string;
  /** frase LITERAL de uma mensagem do paciente — a evidência; sem ela o worker não cria */
  trecho: string | null;
  /** id da mensagem citada, para a tela rolar até ela */
  trecho_mensagem_id?: string | null;
  tipo?: string | null;
  /** `PrazoCurto` para proposta nova; ISO quando já é tarefa */
  prazo: PrazoCurto | string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  /** quando o Jarvis propôs (ISO) */
  criado_em: string;
  estado: EstadoProposta;
  /** quem decidiu (aceitou / ajustou / descartou) e quando */
  decidido_por?: string | null;
  decidido_em?: string | null;
  /** o que estava antes do ajuste — só quando `estado === "ajustada"` */
  original?: { fazer?: string; prazo?: PrazoCurto | string | null; responsavel_nome?: string | null } | null;
  motivo_descarte?: MotivoDescarte | null;
  observacao_descarte?: string | null;
  /** quando a tarefa gerada foi concluída (ISO) — só `feita` */
  feita_em?: string | null;
  feita_por?: string | null;
}

export function ehPrazoCurto(p: unknown): p is PrazoCurto {
  return p === "hoje" || p === "amanha" || p === "esta_semana";
}

/**
 * ADAPTADOR para o tipo do W-D5 (`lib/tarefas/propostas.ts` → `PropostaTarefaPendente`), por
 * forma estrutural — sem importar o arquivo, que ainda não está commitado. Quem tem uma
 * `PropostaTarefaPendente` chama `dePropostaPendente(p, responsaveis)` e recebe o vocabulário
 * das superfícies do Jarvis, em estado `proposta`.
 */
export interface PropostaPendenteEstrutural {
  id: string;
  lead_id: string | null;
  lead_nome: string | null;
  fazer: string;
  por_que: string;
  trecho: string | null;
  tipo: string | null;
  prazo_sugerido: string | null;
  responsavel_sugerido_id: string | null;
  criado_em: string;
  conversa_id?: string | null;
}

export function dePropostaPendente(p: PropostaPendenteEstrutural, responsaveis: Pessoa[] = []): PropostaJarvis {
  const r = responsaveis.find((x) => x.id === p.responsavel_sugerido_id);
  return {
    id: p.id,
    lead_id: p.lead_id,
    lead_nome: p.lead_nome,
    conversa_id: p.conversa_id ?? null,
    fazer: p.fazer,
    por_que: p.por_que,
    trecho: p.trecho,
    tipo: p.tipo,
    prazo: p.prazo_sugerido,
    responsavel_id: p.responsavel_sugerido_id,
    responsavel_nome: r?.nome ?? null,
    criado_em: p.criado_em,
    estado: "proposta",
  };
}

/**
 * ADAPTADOR para o tipo do W-D3 (`lib/conversas/jarvis-proposta.ts` → `PropostaJarvis` em
 * camelCase, com `aceita_por/aceita_em`), também por forma estrutural. O fio chama
 * `daPropostaDoFio(p)` e monta `<PropostaJarvisInline proposta={…} />`.
 */
export interface PropostaDoFioEstrutural {
  id: string;
  conversa_id: string;
  criado_em: string;
  porQue: string;
  fazer: string;
  trecho: string | null;
  prazo: PrazoCurto;
  responsavelId: string | null;
  responsavelNome: string;
  estado: "proposta" | "aceita" | "descartada";
  aceita_por?: string | null;
  aceita_em?: string | null;
  tarefa_id?: string | null;
  motivo_descarte?: string | null;
}

export function daPropostaDoFio(p: PropostaDoFioEstrutural, extra: { lead_nome?: string | null; lead_id?: string | null } = {}): PropostaJarvis {
  const motivo = (["ja_resolvido", "nao_faz_sentido", "outro"] as const).find((m) => m === p.motivo_descarte) ?? (p.motivo_descarte ? "outro" : null);
  return {
    id: p.id,
    conversa_id: p.conversa_id,
    lead_id: extra.lead_id ?? null,
    lead_nome: extra.lead_nome ?? null,
    fazer: p.fazer,
    por_que: p.porQue,
    trecho: p.trecho,
    prazo: p.prazo,
    responsavel_id: p.responsavelId,
    responsavel_nome: p.responsavelNome,
    criado_em: p.criado_em,
    estado: p.estado,
    decidido_por: p.aceita_por ?? null,
    decidido_em: p.aceita_em ?? null,
    motivo_descarte: motivo,
    observacao_descarte: motivo === "outro" && p.motivo_descarte && !["outro"].includes(p.motivo_descarte) ? p.motivo_descarte : null,
  };
}
