/**
 * Lógica PURA do dashboard (Rodada 7, D5) — sem I/O, sem Supabase, client-safe e testável
 * com node --test. As queries ficam em lib/dados/dashboard.ts (server-only).
 *
 * Fuso da operação: America/Sao_Paulo (UTC-3 fixo — o Brasil não tem horário de verão desde
 * 2019). Todos os cortes de "dia" usam esse fuso, não o do servidor.
 */

export const OFFSET_SP = "-03:00";

/** Janela [inicio, fim) de um dia da operação, com rótulo de exibição. */
export interface JanelaDia {
  inicioIso: string;
  fimIso: string;
  rotulo: string; // ex.: "seg 20/07"
}

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "YYYY-MM-DD" do instante `agora` no fuso de São Paulo. */
export function ymdEmSaoPaulo(agora: Date): string {
  // UTC-3 fixo: desloca o relógio e lê o calendário em UTC
  const deslocado = new Date(agora.getTime() - 3 * 3600_000);
  return deslocado.toISOString().slice(0, 10);
}

/** Meia-noite de São Paulo do dia que contém `agora`. */
export function inicioDoDiaSP(agora: Date): Date {
  return new Date(`${ymdEmSaoPaulo(agora)}T00:00:00${OFFSET_SP}`);
}

/** Rótulo curto de um dia ("seg 20/07") a partir da meia-noite SP desse dia. */
export function rotuloDiaSP(inicioDia: Date): string {
  const ymd = ymdEmSaoPaulo(new Date(inicioDia.getTime() + 12 * 3600_000)); // meio-dia, longe da borda
  const [ano, mes, dia] = ymd.split("-").map(Number);
  const semana = DIAS_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()];
  return `${semana} ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

/** Últimos `dias` dias da operação (o último inclui `agora`), do mais antigo pro mais novo. */
export function janelasUltimosDias(agora: Date, dias: number): JanelaDia[] {
  const inicioHoje = inicioDoDiaSP(agora);
  const janelas: JanelaDia[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const inicio = new Date(inicioHoje.getTime() - i * 86400_000);
    const fim = new Date(inicio.getTime() + 86400_000);
    janelas.push({ inicioIso: inicio.toISOString(), fimIso: fim.toISOString(), rotulo: rotuloDiaSP(inicio) });
  }
  return janelas;
}

/** Mediana simples; null pra amostra vazia. */
export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

export interface MensagemMinima {
  conversa_id: string;
  direcao: string; // 'entrada' | 'saida'
  criado_em: string;
}

/**
 * Tempo de 1ª resposta por conversa, em MINUTOS: da primeira mensagem de ENTRADA até a
 * primeira SAÍDA depois dela. Conversa sem par entrada→saída fica fora da amostra
 * (não inventar tempo). A entrada não precisa vir ordenada.
 */
export function minutosPrimeiraResposta(msgs: MensagemMinima[]): number[] {
  const porConversa = new Map<string, MensagemMinima[]>();
  for (const m of msgs) {
    const k = m.conversa_id;
    if (!porConversa.has(k)) porConversa.set(k, []);
    porConversa.get(k)!.push(m);
  }
  const tempos: number[] = [];
  for (const lista of porConversa.values()) {
    lista.sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime());
    const entrada = lista.find((m) => m.direcao === "entrada");
    if (!entrada) continue;
    const tEntrada = new Date(entrada.criado_em).getTime();
    const saida = lista.find((m) => m.direcao === "saida" && new Date(m.criado_em).getTime() >= tEntrada);
    if (!saida) continue;
    tempos.push((new Date(saida.criado_em).getTime() - tEntrada) / 60000);
  }
  return tempos;
}

/** % de entrega (0–100, 1 casa). Base zero → null (não inventar 0% nem 100%). */
export function percentualEntrega(entregues: number, base: number): number | null {
  if (base <= 0) return null;
  return Math.round((entregues / base) * 1000) / 10;
}

/** Soma ignorando nulls (valor null é honesto — Kommo só preenche no fechamento). */
export function somaValores(valores: Array<number | null | undefined>): number {
  return valores.reduce<number>((s, v) => s + (v ?? 0), 0);
}

/** Duração amigável a partir de minutos: "45s", "12 min", "1h 05min", "2d 3h". */
export function formatarDuracaoMin(min: number | null): string {
  if (min == null) return "—";
  if (min < 1) return `${Math.round(min * 60)}s`;
  const total = Math.round(min); // arredonda ANTES de fatiar (59,6 min é "1h", não "60 min")
  if (total < 60) return `${total} min`;
  const horas = Math.floor(total / 60);
  if (horas < 24) {
    const resto = total % 60;
    return resto === 0 ? `${horas}h` : `${horas}h ${String(resto).padStart(2, "0")}min`;
  }
  const dias = Math.floor(horas / 24);
  return `${dias}d ${horas % 24}h`;
}
