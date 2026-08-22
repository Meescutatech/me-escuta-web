/** Dias inteiros desde um ISO timestamp (base do timer de tempo-na-etapa). */
export function diasNaEtapa(desdeIso: string | null, agora: number): number | null {
  if (!desdeIso) return null;
  const ms = agora - new Date(desdeIso).getTime();
  if (isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / 86400000);
}

/** Texto do timer (spec Croqui): "entrou hoje" / "1 dia na etapa" / "N dias na etapa". */
export function textoTempo(desdeIso: string | null, agora: number): string {
  const d = diasNaEtapa(desdeIso, agora);
  if (d == null) return "—";
  if (d === 0) return "entrou hoje";
  if (d === 1) return "1 dia na etapa";
  return `${d} dias na etapa`;
}

/**
 * Timer compacto do card enxuto (redesign): "hoje" / "Nh" (mesmo dia) / "Nd".
 * Mais discreto que textoTempo — vai no canto do card (spec §4 do kanban-v2.html).
 */
export function textoTempoCurto(desdeIso: string | null, agora: number): string {
  if (!desdeIso) return "";
  const ms = agora - new Date(desdeIso).getTime();
  if (isNaN(ms) || ms < 0) return "hoje";
  const dias = Math.floor(ms / 86400000);
  if (dias === 0) {
    const h = Math.floor(ms / 3600000);
    return h < 1 ? "agora" : `${h}h`;
  }
  return `${dias}d`;
}

/**
 * Horas decorridas desde um ISO. Fracionária de propósito: a prioridade é uma RAZÃO sobre o prazo
 * da etapa, e etapa de 2h (SLA de 1º contato) não sobrevive a um relógio que só conta dia inteiro.
 * `null` = não dá para saber. Nunca 0 disfarçado de "acabou de entrar".
 */
export function horasDesde(desdeIso: string | null | undefined, agora: number): number | null {
  if (!desdeIso) return null;
  const t = new Date(desdeIso).getTime();
  if (Number.isNaN(t)) return null;
  const ms = agora - t;
  return ms < 0 ? 0 : ms / 3_600_000;
}

/** Duração curta em mono ("2h", "3d") — usada no excedente do prazo estourado ("+3d"). */
export function textoHorasCurto(horas: number): string {
  const h = Math.max(0, Math.floor(horas));
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/*
 * ── R23/W2 · onde foram parar `timerVelho` e `nivelSla` ─────────────────────────────────────
 *
 * Existiam aqui duas funções que cravavam o MESMO limiar em dois números diferentes, seis linhas
 * uma da outra: `timerVelho` (`d >= 4`) e `nivelSla` (`d > 4` / `d > 2`). Nenhuma das duas recebia
 * a etapa do card — o prazo era GLOBAL e hardcoded. Medido em 22/08/2026: com esse limiar, 97 dos
 * 97 cards do board estavam "estourado" (o mais novo estava há 18d23h na etapa), o que é o mesmo
 * que não ter cor nenhuma.
 *
 * O limiar agora é DADO (`core.config` chave `sla_etapas`, D56) e a conta é uma razão sobre o prazo
 * da etapa (D55). Quem decide faixa é `prioridadeCard` em `lib/dados/funil-ordenacao.ts`, um lugar
 * só. Este módulo voltou a ser o que o nome diz: primitivas de tempo, sem regra de negócio.
 */
