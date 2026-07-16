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

/** Nível de alerta pela meta das 48h (spec Croqui): ok ≤2d, atenção ≤4d, estourado >4d. */
export function nivelSla(desdeIso: string | null, agora: number): "ok" | "atencao" | "estourado" {
  const d = diasNaEtapa(desdeIso, agora);
  if (d == null) return "ok";
  if (d > 4) return "estourado";
  if (d > 2) return "atencao";
  return "ok";
}
