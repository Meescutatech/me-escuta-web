import { frasePrograma, MAX_DIAS_PROGRAMACAO } from "./programar-envio.ts";

/**
 * ENVIOS PROGRAMADOS — a metade que GRAVA (R27/F1). `programar-envio.ts` decide QUANDO; este
 * arquivo decide o que vai para a porta e como cada linha da view volta para a tela.
 *
 * Lógica PURA e client-safe (sem I/O), testada em `tests/envio-programado.test.ts`.
 *
 * O CONTRATO (0290, igual nos 3 repos):
 *   evento `envio_programado`           {conversa_id, lead_id, corpo, enviar_em ISO, canal_id|null}
 *   evento `envio_programado_cancelado` {envio_programado_id}
 *   view   api.v_envios_programados      (conversa_id, id, corpo, enviar_em, status, criado_por, erro, …)
 */

export type StatusEnvioProgramado = "agendado" | "enviado" | "cancelado" | "falhou";

/** Uma linha de `api.v_envios_programados`, como a tela a recebe. */
export interface EnvioProgramadoLinha {
  id: string;
  conversa_id: string;
  corpo: string;
  /** ISO */
  enviar_em: string;
  status: StatusEnvioProgramado;
  erro: string | null;
  criado_por: string | null;
}

/** O erro que o runtime grava quando a janela de 24h fechou antes da hora (worker envio-programado). */
export const ERRO_FORA_DA_JANELA = "fora_da_janela_24h";

/** Corpo máximo — o mesmo teto de texto do WhatsApp; a porta não impõe, a tela sim. */
export const MAX_CORPO = 4096;

export type PayloadProgramar =
  | {
      ok: true;
      payload: {
        conversa_id: string;
        lead_id: string | null;
        corpo: string;
        enviar_em: string;
        canal_id: null;
      };
    }
  | { ok: false; motivo: string };

/**
 * Monta o payload do `envio_programado`. Recusa aqui o que a porta também recusaria (texto vazio,
 * hora que passou) — para o erro ter a voz da tela, não a do Postgres — e o que só a tela sabe
 * (teto de 90 dias). `enviar_em` vai em ISO/UTC: a porta faz `::timestamptz` e o fuso é da string.
 */
export function montarPayloadProgramar(entrada: {
  conversaId: string | null;
  leadId: string | null;
  corpo: string;
  quandoMs: number;
  agoraMs: number;
}): PayloadProgramar {
  const corpo = entrada.corpo.trim();
  if (!entrada.conversaId) return { ok: false, motivo: "Abra uma conversa para programar." };
  if (!corpo) return { ok: false, motivo: "Escreva a mensagem antes de programar." };
  if (corpo.length > MAX_CORPO) return { ok: false, motivo: `No máximo ${MAX_CORPO} caracteres.` };
  if (!Number.isFinite(entrada.quandoMs)) return { ok: false, motivo: "Data inválida." };
  if (entrada.quandoMs <= entrada.agoraMs) return { ok: false, motivo: "Esse horário já passou." };
  if (entrada.quandoMs - entrada.agoraMs > MAX_DIAS_PROGRAMACAO * 86_400_000) {
    return { ok: false, motivo: `No máximo ${MAX_DIAS_PROGRAMACAO} dias à frente.` };
  }
  return {
    ok: true,
    payload: {
      conversa_id: entrada.conversaId,
      lead_id: entrada.leadId,
      corpo,
      enviar_em: new Date(entrada.quandoMs).toISOString(),
      canal_id: null,
    },
  };
}

/**
 * O que a conversa MOSTRA: o que ainda vai sair e o que falhou (precisa de ação). Enviado já
 * está na thread como mensagem; cancelado não interessa mais. Agendados primeiro, pelo horário;
 * falhados depois, o mais recente por cima.
 */
export function visiveisNaConversa(linhas: EnvioProgramadoLinha[]): EnvioProgramadoLinha[] {
  const agendados = linhas
    .filter((l) => l.status === "agendado")
    .sort((a, b) => Date.parse(a.enviar_em) - Date.parse(b.enviar_em));
  const falhados = linhas
    .filter((l) => l.status === "falhou")
    .sort((a, b) => Date.parse(b.enviar_em) - Date.parse(a.enviar_em));
  return [...agendados, ...falhados];
}

/** Só o que está `agendado` aceita cancelar — a porta recusa o resto (0290). */
export function podeCancelar(linha: Pick<EnvioProgramadoLinha, "status">): boolean {
  return linha.status === "agendado";
}

/** O motivo de uma falha, na voz da tela. Erro desconhecido vem cru, curto — nunca some. */
export function explicarFalha(erro: string | null): { titulo: string; acao: string | null } {
  if (erro === ERRO_FORA_DA_JANELA) {
    return {
      titulo: "Não saiu: a janela de 24h fechou antes da hora.",
      acao: "Fora da janela só sai template aprovado — use um pelo menu / do campo.",
    };
  }
  const cru = (erro ?? "").trim();
  return {
    titulo: cru ? `Não saiu: ${cru.slice(0, 140)}` : "Não saiu.",
    acao: null,
  };
}

/** "amanhã às 08:00" / "ter, 02/09 às 08:00" — a mesma frase do chip, agora a partir do ISO da view. */
export function fraseLinha(linha: Pick<EnvioProgramadoLinha, "enviar_em">, agoraMs: number): string {
  const ms = Date.parse(linha.enviar_em);
  if (!Number.isFinite(ms)) return "horário indisponível";
  return frasePrograma(ms, agoraMs);
}

/** Prévia curta do texto, numa linha. */
export function previa(corpo: string, max = 72): string {
  const t = corpo.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
