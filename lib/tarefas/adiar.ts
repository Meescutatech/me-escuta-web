/**
 * ADIAR EM UM CLIQUE (W-D5, 10/09 — benchmark §4 item 6).
 *
 * Close chama de snooze, HubSpot de reschedule, Attio oferece Today / Tomorrow / Next week. O
 * nosso "repactuar prazo" exigia data + hora + motivo DIGITADO (acoes-tarefa.tsx) — três campos
 * para dizer "amanhã". O motivo continua OBRIGATÓRIO na porta (0037, check_violation): o que
 * muda é que o preset É o motivo. `tarefa_prazo_repactuado {tarefa_id, prazo, motivo:"adiada
 * para amanhã"}` — o registro fica, só deixa de ser datilografado (§10.1: adiar vira registro,
 * não silêncio).
 *
 * Todos os presets caem às 09:00 de São Paulo — começo do expediente, quando a fila do dia é
 * lida. São Paulo não tem horário de verão desde 2019, então 09:00 local = 12:00 UTC, sempre.
 */

export type ChavePreset = "amanha" | "tres_dias" | "proxima_segunda";

export interface PresetAdiar {
  chave: ChavePreset;
  /** o que o botão diz */
  rotulo: string;
  /** ISO do novo prazo */
  prazoIso: string;
  /** o `payload.motivo` do `tarefa_prazo_repactuado` */
  motivo: string;
  /** tecla de atalho na fila do dia */
  tecla: string;
}

const HORA_SP_EM_UTC = 12; // 09:00 America/Sao_Paulo (UTC-3 fixo)

const FMT_SP = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  timeZone: "America/Sao_Paulo",
});

function hojeSP(agoraMs: number): { ano: number; mes: number; dia: number; dow: number } {
  const p = Object.fromEntries(FMT_SP.formatToParts(new Date(agoraMs)).map((x) => [x.type, x.value]));
  const ordem: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), dow: ordem[p.weekday] ?? 0 };
}

/** 09:00 SP de (hoje + `dias`), em ISO. */
export function manhaSP(agoraMs: number, dias: number): string {
  const h = hojeSP(agoraMs);
  return new Date(Date.UTC(h.ano, h.mes - 1, h.dia + dias, HORA_SP_EM_UTC, 0, 0)).toISOString();
}

/** Dias até a PRÓXIMA segunda (nunca hoje: numa segunda, é a de daqui a 7). */
export function diasAteProximaSegunda(agoraMs: number): number {
  const { dow } = hojeSP(agoraMs);
  const d = (8 - dow) % 7;
  return d === 0 ? 7 : d;
}

export function presetsAdiar(agoraMs: number): PresetAdiar[] {
  return [
    { chave: "amanha", rotulo: "Amanhã", prazoIso: manhaSP(agoraMs, 1), motivo: "adiada para amanhã", tecla: "1" },
    { chave: "tres_dias", rotulo: "Em 3 dias", prazoIso: manhaSP(agoraMs, 3), motivo: "adiada em 3 dias", tecla: "2" },
    {
      chave: "proxima_segunda",
      rotulo: "Próxima segunda",
      prazoIso: manhaSP(agoraMs, diasAteProximaSegunda(agoraMs)),
      motivo: "adiada para a próxima segunda",
      tecla: "3",
    },
  ];
}

/**
 * PRAZO CURTO → ISO. O card do Jarvis (components/jarvis) fala "hoje / amanhã / esta semana"; o
 * `tarefa_criada` grava um instante. Hoje = 18:00 SP (fim do expediente) — ou daqui a 1 h se
 * 18:00 já passou; amanhã e esta semana caem às 09:00 (`manhaSP`). "Esta semana" = sexta desta
 * semana; numa sexta ou fim de semana, vira a próxima segunda (não há mais semana para ser
 * "esta").
 */
export function prazoCurtoParaIso(curto: "hoje" | "amanha" | "esta_semana", agoraMs: number): string {
  if (curto === "amanha") return manhaSP(agoraMs, 1);
  if (curto === "esta_semana") {
    const { dow } = hojeSP(agoraMs);
    const ateSexta = 5 - dow; // dom=0 … sáb=6
    return manhaSP(agoraMs, ateSexta >= 1 ? ateSexta : diasAteProximaSegunda(agoraMs));
  }
  const h = hojeSP(agoraMs);
  const dezoito = Date.UTC(h.ano, h.mes - 1, h.dia, 21, 0, 0); // 18:00 SP
  return new Date(dezoito > agoraMs ? dezoito : agoraMs + 3_600_000).toISOString();
}
