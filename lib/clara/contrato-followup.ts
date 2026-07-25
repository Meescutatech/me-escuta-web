/**
 * CONTRATO do follow-up em produção — ESPELHO do runtime, nunca limite próprio.
 *
 * FONTE DA VERDADE: me-escuta-runtime `src/clara/followup.ts` (parseConfigFollowup, branch
 * feat/clara-pronta-producao). O runtime aplica estas travas quando a config NÃO traz
 * `modo: "demo"` explícito:
 *   - cada janela da cadência tem piso de PISO_JANELA_PRODUCAO_MIN (eleva pro piso, com aviso);
 *   - horário comercial precisa de 6 <= inicio < fim <= 22 (fora disso usa o default 8-20).
 * Se os números mudarem lá, mudam AQUI JUNTO — divergência é exatamente o defeito que esta
 * página teve (aceitava 2 min/0-24h, o runtime aplicava 60/8-20, e a tela mentia).
 *
 * O salvar da página escreve `config_patch.followup` e o projetor (0042) faz merge RASO:
 * o objeto followup é substituído por inteiro — ou seja, salvar daqui SEMPRE volta a config
 * pra produção (sem `modo`), e é por isso que o form valida o contrato de produção sempre.
 */

export const PISO_JANELA_PRODUCAO_MIN = 60;
export const HORARIO_PRODUCAO = { inicioMin: 6, fimMax: 22 } as const;
export const HORARIO_DEFAULT = { inicio: 8, fim: 20 } as const;

export interface ProblemasContrato {
  /** null = janelas dentro do contrato; senão, mensagem que explica o porquê. */
  janelas: string | null;
  /** null = horário dentro do contrato; senão, mensagem que explica o porquê. */
  horario: string | null;
}

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? um : varios;
}

/** Valida janelas+horário contra o contrato de PRODUÇÃO do runtime. Mensagens explicam o porquê. */
export function problemasContrato(
  janelasMin: number[],
  inicio: number,
  fim: number,
): ProblemasContrato {
  let janelas: string | null = null;
  const curtas = janelasMin.filter((n) => Number.isFinite(n) && n > 0 && n < PISO_JANELA_PRODUCAO_MIN);
  if (janelasMin.length === 0) {
    janelas = "Informe ao menos uma janela em minutos — sem janelas não há cadência.";
  } else if (curtas.length > 0) {
    janelas =
      `${plural(curtas.length, "A janela", "As janelas")} de ${curtas.join(", ")} min ` +
      `${plural(curtas.length, "fica", "ficam")} abaixo do piso de produção (${PISO_JANELA_PRODUCAO_MIN} min): ` +
      `mais rápido que isso a Clara persegue o lead de minuto em minuto. Use ${PISO_JANELA_PRODUCAO_MIN} min ou mais por janela.`;
  }

  let horario: string | null = null;
  const dentro =
    Number.isFinite(inicio) &&
    Number.isFinite(fim) &&
    inicio >= HORARIO_PRODUCAO.inicioMin &&
    fim <= HORARIO_PRODUCAO.fimMax &&
    inicio < fim;
  if (!dentro) {
    horario =
      `Horário precisa ficar entre ${HORARIO_PRODUCAO.inicioMin}h e ${HORARIO_PRODUCAO.fimMax}h, com início antes do fim — ` +
      `fora disso a Clara mandaria mensagem de madrugada.`;
  }

  return { janelas, horario };
}

export function contratoOk(p: ProblemasContrato): boolean {
  return p.janelas === null && p.horario === null;
}

export interface EfeitoRuntime {
  /** o que o runtime REALMENTE usa com esses valores salvos (piso aplicado por janela). */
  janelasEfetivasMin: number[];
  /** idem pro horário (fora do contrato → default 8-20). */
  horarioEfetivo: { inicio: number; fim: number };
  /** true = o que está salvo NÃO é o que roda — a página precisa mostrar isso. */
  divergente: boolean;
}

/**
 * O que o runtime FAZ com a config salva (mesma matemática do parseConfigFollowup em produção).
 * Alimenta o aviso "salvo ≠ aplicado" quando o banco tem valor fora do contrato.
 */
export function efeitoRuntime(janelasMin: number[], inicio: number, fim: number): EfeitoRuntime {
  const p = problemasContrato(janelasMin, inicio, fim);
  const janelasEfetivasMin =
    janelasMin.length === 0
      ? janelasMin
      : janelasMin.map((n) => Math.max(n, PISO_JANELA_PRODUCAO_MIN));
  const horarioEfetivo = p.horario === null ? { inicio, fim } : { ...HORARIO_DEFAULT };
  return {
    janelasEfetivasMin,
    horarioEfetivo,
    divergente: !contratoOk(p),
  };
}
