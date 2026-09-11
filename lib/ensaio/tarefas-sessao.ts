import { cookies } from "next/headers";
import {
  COOKIE_ESTADO_TAREFAS,
  ESTADO_TAREFAS_VAZIO,
  normalizar,
  type EstadoTarefasEnsaio,
} from "@/lib/tarefas/sessao-foco";

/**
 * O cookie do ensaio de /tarefas — LER e GRAVAR (servidor). O que ele guarda e como vira estado
 * de tela está em `lib/tarefas/sessao-foco.ts` (puro, compartilhado com o cliente).
 */

const MAX_AGE = 60 * 60 * 24; // um dia: a fila do dia é do dia
const LIMITE = 24;

export function lerEstadoTarefasEnsaio(): EstadoTarefasEnsaio {
  try {
    const bruto = cookies().get(COOKIE_ESTADO_TAREFAS)?.value;
    if (!bruto) return ESTADO_TAREFAS_VAZIO;
    return normalizar(JSON.parse(bruto));
  } catch {
    return ESTADO_TAREFAS_VAZIO;
  }
}

/** Só de dentro de server action. Corta no teto para o cookie nunca estourar. */
export function gravarEstadoTarefasEnsaio(estado: EstadoTarefasEnsaio): void {
  const ultimos = <T,>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).slice(-LIMITE));
  const enxuto: EstadoTarefasEnsaio = {
    concluidas: ultimos(estado.concluidas),
    prazos: ultimos(estado.prazos),
    criadas: estado.criadas.slice(-8),
    sessao: estado.sessao
      ? { ...estado.sessao, ordem: estado.sessao.ordem.slice(0, 40), puladas: estado.sessao.puladas.slice(-40), iniciadas: estado.sessao.iniciadas.slice(-40) }
      : null,
  };
  cookies().set(COOKIE_ESTADO_TAREFAS, JSON.stringify(enxuto), { path: "/", sameSite: "lax", maxAge: MAX_AGE });
}

