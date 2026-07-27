/**
 * Intervalos de releitura por tela — UM lugar só (F4, Rodada 16).
 *
 * Antes eram cinco literais espalhados pelos call sites (`intervaloMs: 5000`, `7000`, `15000`,
 * `30000`, `45_000`). Espalhado, ninguém consegue responder "quantas releituras por minuto esta
 * página faz?" sem abrir cinco arquivos — e foi assim que /conversas e o sino passaram a bater
 * quase no mesmo instante sem que ninguém notasse.
 *
 * O polling é PISO, não motor: a verdade é a releitura do server component; o Realtime é dica
 * (components/projecao-viva.ts). Estes números são o intervalo em que a tela se sustenta sozinha
 * quando a dica não chega.
 */

export const INTERVALOS = {
  /** inbox — 5 s → 30 s, condicionado ao tempo real (ver PISO_SEM_TEMPO_REAL) */
  conversas: 30_000,
  /** board do funil — 7 s → 30 s, mesma condição */
  funil: 30_000,
  /** fila de tarefas — inalterado: já era barato */
  tarefas: 15_000,
  /** sino: roda em TODA tela autenticada — inalterado */
  sino: 30_000,
  /** carimbo do painel — inalterado */
  carimbo: 45_000,
} as const;

/**
 * Piso enquanto não houver assinatura de tempo real CONFIRMADA.
 *
 * Sem esta trava, subir /conversas para 30 s significa uma mensagem nova demorando até 30 s para
 * aparecer — piora percebida exatamente no inbox, que é o achado nº 1 da auditoria do app. 30 s só
 * é o valor certo quando o Realtime está de pé e o polling virou rede de segurança.
 */
export const PISO_SEM_TEMPO_REAL = 10_000;

/**
 * Intervalo que a tela DEVE usar agora: o alvo quando o tempo real está confirmado, o piso quando
 * não está. Puro — o hook chama, o teste cobre.
 */
export function intervaloEfetivo(alvoMs: number, aoVivo: boolean, pisoMs = PISO_SEM_TEMPO_REAL) {
  return aoVivo ? alvoMs : Math.min(alvoMs, pisoMs);
}
