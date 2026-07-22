import type { TarefaLead } from "@/lib/dados/lead-painel";

/**
 * Lógica pura da LISTA DE TAREFAS do lead (Rodada 13 / Bloco C — C6).
 * Mockup: tarefas-lead-v3.html. Spec §10.1 e §5.4.
 *
 * "Vencida" é DERIVADA de `prazo < agora` na leitura — o Bloco A não persiste esse estado, e
 * fazer isso é o único jeito de não repetir o cemitério do Kommo (755 de 771 tarefas abertas
 * vencidas, 97,9%: quando quase tudo está vermelho, o vermelho não quer dizer nada). Estado
 * persistido é `pendente | concluida | arquivada`; vencida é uma leitura do relógio.
 */

export type EstadoTarefa = "pendente" | "vencida" | "concluida" | "arquivada";

export function estadoTarefa(t: TarefaLead, agoraMs: number): EstadoTarefa {
  if (t.status === "concluida") return "concluida";
  if (t.status === "arquivada") return "arquivada";
  return vencida(t.prazo, agoraMs) ? "vencida" : "pendente";
}

export function vencida(prazoIso: string | null, agoraMs: number): boolean {
  if (!prazoIso) return false; // tarefa sem prazo não vence — não tem contra o que vencer
  const t = new Date(prazoIso).getTime();
  return Number.isFinite(t) && t < agoraMs;
}

export interface ListaTarefas {
  /** vencidas primeiro (mais atrasada no topo), depois por prazo; sem prazo por último. */
  abertas: TarefaLead[];
  concluidas: TarefaLead[];
  arquivadas: TarefaLead[];
  qtdVencidas: number;
}

const SEM_PRAZO = Number.MAX_SAFE_INTEGER;

export function organizarTarefas(tarefas: TarefaLead[], agoraMs: number): ListaTarefas {
  const abertas: TarefaLead[] = [];
  const concluidas: TarefaLead[] = [];
  const arquivadas: TarefaLead[] = [];

  for (const t of tarefas) {
    const e = estadoTarefa(t, agoraMs);
    if (e === "concluida") concluidas.push(t);
    else if (e === "arquivada") arquivadas.push(t);
    else abertas.push(t);
  }

  const quando = (t: TarefaLead) => {
    const ms = t.prazo ? new Date(t.prazo).getTime() : NaN;
    return Number.isFinite(ms) ? ms : SEM_PRAZO;
  };
  abertas.sort((a, b) => quando(a) - quando(b) || a.criado_em.localeCompare(b.criado_em));
  concluidas.sort((a, b) => (b.concluida_em ?? b.criado_em).localeCompare(a.concluida_em ?? a.criado_em));

  return {
    abertas,
    concluidas,
    arquivadas,
    qtdVencidas: abertas.filter((t) => vencida(t.prazo, agoraMs)).length,
  };
}

/**
 * Nome de quem responde pela tarefa. `responsavel_id` (uuid, Bloco A) manda; o texto livre da
 * R8 (e-mail) é só o legado das tarefas antigas. `humano:<uid>` é artefato da porta, não nome.
 */
export function nomeResponsavel(
  t: Pick<TarefaLead, "responsavel" | "responsavel_id">,
  porId: Map<string, string>,
): string | null {
  if (t.responsavel_id) return porId.get(t.responsavel_id) ?? "outro membro";
  const bruto = (t.responsavel ?? "").trim();
  if (!bruto) return null;
  if (/^(humano:|agente:|sistema$)/i.test(bruto)) return null;
  return bruto.includes("@") ? bruto.split("@")[0] : bruto;
}

/** "SA" a partir de "Sara Almeida"; usado no avatarzinho da linha. */
export function iniciaisDe(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  const letras = p.length >= 2 ? p[0][0] + p[p.length - 1][0] : nome.slice(0, 2);
  return letras.toUpperCase();
}

/** "venceu 20/07 · 09:00" / "vence 23/07 · 09:00" / "concluída 21/07 · 15:12" — mockup v3. */
export function textoPrazo(t: TarefaLead, agoraMs: number): string | null {
  if (t.status === "concluida") {
    return t.concluida_em ? `concluída ${dataHoraCurta(t.concluida_em)}` : "concluída";
  }
  if (!t.prazo) return "sem prazo";
  return `${vencida(t.prazo, agoraMs) ? "venceu" : "vence"} ${dataHoraCurta(t.prazo)}`;
}

export function dataHoraCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const partes = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return `${partes.day}/${partes.month} · ${partes.hour}:${partes.minute}`;
}

/** Valor para o `<input type="datetime-local">` (hora local de São Paulo). */
export function paraDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  return fmt.format(d).replace(" ", "T");
}
