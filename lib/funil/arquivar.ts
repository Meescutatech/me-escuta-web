/**
 * 4i · ARQUIVAR LEAD — a decisão PURA por trás da server action `arquivarLead`.
 *
 * Separada do I/O (como o resto da web faz: lógica pura testável, action = casca) para poder
 * afirmar as regras sem mockar o Supabase. A action em `funil/actions.ts` chama isto e só então
 * registra o evento pela porta.
 *
 * Modelo: num ledger append-only não se DELETA lead — arquiva-se. `arquivado` é etapa real (a
 * ingestão até desarquiva sozinha quando o lead volta a falar, migration 0029), então arquivar =
 * `etapa_alterada` para `arquivado`, reversível por natureza.
 */

export const ETAPA_ARQUIVADO = "arquivado";

export type DecisaoArquivar =
  | { ok: false; motivo: string }
  | { ok: true; payload: { lead_id: string; etapa_de: string; etapa_para: string; motivo?: string } };

/**
 * Valida e monta o payload de arquivamento. Recusa (com motivo) quando:
 *  - falta lead_id (a porta gravaria evento órfão)
 *  - o lead JÁ está arquivado (evento sem efeito, ruído no ledger)
 * O `motivo` textual é opcional; quando vem, é aparado e só entra se sobrar conteúdo.
 */
export function decidirArquivamento(
  leadId: string,
  etapaDe: string,
  motivo?: string,
): DecisaoArquivar {
  if (!leadId?.trim()) return { ok: false, motivo: "Lead inválido." };
  if (etapaDe === ETAPA_ARQUIVADO) return { ok: false, motivo: "Lead já está arquivado." };
  const payload: { lead_id: string; etapa_de: string; etapa_para: string; motivo?: string } = {
    lead_id: leadId,
    etapa_de: etapaDe,
    etapa_para: ETAPA_ARQUIVADO,
  };
  const m = motivo?.trim();
  if (m) payload.motivo = m;
  return { ok: true, payload };
}
