/** Formatos das projeções/ledger lidos pela UI (subconjunto do schema core). */

export interface EventoLedger {
  id: string;
  posicao_global: number;
  lead_id: string | null;
  tipo: string;
  ator: string;
  origem: string;
  criado_em: string;
  payload: Record<string, unknown>;
}

export interface SugestaoPendente {
  id: string;
  agente: string;
  tipo: string;
  conversa_id: string | null;
  payload_proposto: Record<string, unknown>;
  status: string;
  criado_em: string;
}
