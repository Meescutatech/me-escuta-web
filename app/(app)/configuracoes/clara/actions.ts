"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Ações da página Configurações > Clara (SPEC-CLARA-REPLICA-DEMO §2-bis).
 *
 * TUDO opera como CONFIG/EVENTO — nunca deploy:
 *  - interruptor e follow-ups: evento `config_atualizada` via api.registrar_evento
 *    (guarda de papel admin/owner NO BANCO — 0042; projetor liga/desliga core.agente na hora);
 *  - prompt: caminho versionado 0007/0008 (api.propor_atualizacao_prompt cria a proposta com
 *    optimistic lock por versao_base; api.validar_sugestao aplica → evento prompt_atualizado);
 *  - /restart de demo: api.expurgar_lead_demo (0043 — allowlist + kommo_lead_id barram lead real).
 * Toda mudança vira evento com autor (quem mudou o quê, quando, fica consultável no ledger).
 */

export interface ResultadoAcao {
  ok: boolean;
  motivo?: string;
}

async function registrarConfig(payload: Record<string, unknown>): Promise<ResultadoAcao> {
  const supabase = criarClienteServidor();
  const envelope = {
    tipo: "config_atualizada",
    id_externo: randomUUID(),
    versao_payload: 1,
    payload: { agente_id: "clara", ...payload },
  };
  const { error } = await supabase.schema("api").rpc("registrar_evento", { p: envelope });
  if (error) return { ok: false, motivo: error.message };
  revalidatePath("/configuracoes/clara");
  return { ok: true };
}

/** Interruptor mestre: desligada, a Clara não responde a PRÓXIMA mensagem (efeito imediato). */
export async function alternarClara(ligar: boolean): Promise<ResultadoAcao> {
  return registrarConfig({ ativo: ligar });
}

export interface ConfigFollowupForm {
  ativo: boolean;
  janelasMin: number[];
  inicio: number;
  fim: number;
}

/** Follow-ups: cadência/horário como config — o runtime lê a config a CADA disparo. */
export async function salvarFollowup(cfg: ConfigFollowupForm): Promise<ResultadoAcao> {
  const janelas = cfg.janelasMin.map((n) => Math.round(n)).filter((n) => Number.isFinite(n) && n > 0);
  if (janelas.length === 0) return { ok: false, motivo: "informe ao menos uma janela em minutos" };
  if (!(cfg.inicio >= 0 && cfg.inicio < 24 && cfg.fim > cfg.inicio && cfg.fim <= 24)) {
    return { ok: false, motivo: "horário comercial inválido (início < fim, 0–24)" };
  }
  return registrarConfig({
    config_patch: {
      followup: {
        ativo: cfg.ativo,
        janelas_min: janelas,
        horario_comercial: { inicio: cfg.inicio, fim: cfg.fim },
      },
    },
  });
}

/** Publica uma versão nova do prompt (propõe + aplica na mesma ação; lock por versão vigente). */
export async function publicarPrompt(
  promptNovo: string,
  justificativa: string,
  versaoBase: number,
): Promise<ResultadoAcao> {
  const texto = promptNovo.trim();
  if (texto.length === 0) return { ok: false, motivo: "prompt vazio" };
  if (justificativa.trim().length === 0) {
    return { ok: false, motivo: "descreva o que mudou (fica no histórico auditável)" };
  }

  const supabase = criarClienteServidor();
  const { data: proposta, error: errProposta } = await supabase
    .schema("api")
    .rpc("propor_atualizacao_prompt", {
      p_agente_alvo: "clara",
      p_prompt_novo: texto,
      p_justificativa: justificativa.trim(),
      p_versao_base: versaoBase,
    });
  if (errProposta) return { ok: false, motivo: errProposta.message };

  const sugestaoId = (proposta as { sugestao_id?: string } | null)?.sugestao_id;
  if (!sugestaoId) return { ok: false, motivo: "proposta criada sem id (inesperado)" };

  const { error: errAplicar } = await supabase
    .schema("api")
    .rpc("validar_sugestao", { p_sugestao_id: sugestaoId, p_decisao: "aprovada" });
  if (errAplicar) return { ok: false, motivo: errAplicar.message };

  revalidatePath("/configuracoes/clara");
  return { ok: true };
}

/** Zera o lead de DEMO (/restart pelo front). As guardas ficam no banco — lead real é inapagável. */
export async function zerarLeadDemo(leadId: string): Promise<ResultadoAcao> {
  const supabase = criarClienteServidor();
  const { error } = await supabase.schema("api").rpc("expurgar_lead_demo", { p_lead_id: leadId });
  if (error) return { ok: false, motivo: error.message };
  revalidatePath("/configuracoes/clara");
  return { ok: true };
}
