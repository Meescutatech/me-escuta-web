import { dataHoraCurta } from "@/lib/dados/tarefa-calculos";
import { ROTULO_MOTIVO, ROTULO_PRAZO, ehPrazoCurto, type PropostaJarvis } from "./tipos";

/**
 * Funções puras compartilhadas pelas superfícies do Jarvis (v2 — só texto, sem JSX; a dieta
 * tirou selo, rótulo em caixa e rail coloridos).
 */

export function tempoDesde(iso: string | null | undefined, agoraMs = Date.now()): string {
  if (!iso) return "há pouco";
  const min = Math.max(1, Math.round((agoraMs - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

/** "Hoje" / "Amanhã" / "Esta semana" para prazo curto; data curta para ISO. */
export function textoPrazo(prazo: PropostaJarvis["prazo"]): string {
  if (!prazo) return "sem prazo";
  if (ehPrazoCurto(prazo)) return ROTULO_PRAZO[prazo];
  const t = dataHoraCurta(prazo);
  return t || String(prazo);
}

export function prazoUrgente(prazo: PropostaJarvis["prazo"], agoraMs = Date.now()): boolean {
  if (!prazo) return false;
  if (ehPrazoCurto(prazo)) return prazo === "hoje";
  const t = new Date(prazo).getTime();
  return Number.isFinite(t) && t - agoraMs < 24 * 3_600_000;
}

function horaCurta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(d);
}

/**
 * A linha colapsada dos estados decididos — "Aceita por Sara · 14:32". Sempre PESSOA como sujeito:
 * o Jarvis nunca decide sobre a própria proposta.
 */
export function linhaDoEstado(p: PropostaJarvis): string {
  const quem = p.decidido_por ?? "alguém";
  const hora = horaCurta(p.decidido_em);
  const h = hora ? ` · ${hora}` : "";
  switch (p.estado) {
    case "proposta":
      return "";
    case "aceita":
      return `Aceita por ${quem}${h}`;
    case "ajustada":
      return `Aceita com ajustes por ${quem}${h}`;
    case "descartada": {
      const motivo = p.motivo_descarte ? ` · ${ROTULO_MOTIVO[p.motivo_descarte].toLowerCase()}` : "";
      return `Descartada por ${quem}${h}${motivo}`;
    }
    case "feita": {
      const por = p.feita_por ?? p.decidido_por ?? "alguém";
      const hf = horaCurta(p.feita_em);
      return `Feita por ${por}${hf ? ` · ${hf}` : ""}`;
    }
  }
}

/** "era: Responder Neusa · amanhã · Sara" — o que a pessoa mudou em relação ao proposto. */
export function textoDoOriginal(p: PropostaJarvis): string | null {
  const o = p.original;
  if (!o) return null;
  const partes: string[] = [];
  if (o.fazer && o.fazer !== p.fazer) partes.push(o.fazer);
  if (o.prazo !== undefined && o.prazo !== p.prazo) partes.push(textoPrazo(o.prazo ?? null).toLowerCase());
  if (o.responsavel_nome && o.responsavel_nome !== p.responsavel_nome) partes.push(o.responsavel_nome);
  return partes.length ? `era: ${partes.join(" · ")}` : null;
}
