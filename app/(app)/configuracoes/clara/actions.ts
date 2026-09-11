"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { contratoOk, problemasContrato } from "@/lib/clara/contrato-followup";

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

/**
 * EM QUAL NÚMERO A CLARA RESPONDE (S12).
 *
 * ── Por que isto existe ───────────────────────────────────────────────────────────────────
 * O roteador `core.agentes_para_gatilho(tipo, area)` filtra por `ativo`, `gatilhos_evento` e
 * `areas` — e CANAL não está em nenhuma das três. Medido em produção 11/09/2026: ligar a Clara
 * a punha para responder em TODO canal ativo da área dela, inclusive a WABA `627327023793464`
 * (+15557252751), que é COMPARTILHADA COM O KOMMO. A Sara e a Clara na mesma conversa.
 *
 * ── Por que `escopo_patch`, e não campo novo ──────────────────────────────────────────────
 * O caminho já existe inteiro e não pede migration: o projetor `porta.proj_config_agente`
 * (0042, reescrito na 0107) faz MERGE de `escopo_patch` em `core.agente.escopo_leitura`, e a
 * validação de `api.registrar_evento` (0104) só inspeciona `gatilhos_evento` e `areas` — chave
 * nova passa. O runtime lê `escopo_leitura.canais` (`src/clara/canal.ts`).
 *
 * ⚠️ `core.agente` recusa UPDATE direto por trigger (0108). Evento é o único caminho, e é por
 * isso que quem mudou o quê e quando fica no ledger sem ninguém precisar lembrar de registrar.
 *
 * ── Por que `ligar` vai no MESMO evento, e não em dois ─────────────────────────────────────
 * Esta é a decisão que importa aqui. Ligar a Clara PRIMEIRO e escolher o número DEPOIS abre uma
 * janela — de segundos, mas real — em que ela está ligada com o escopo antigo, ou seja
 * respondendo no número do Kommo. Um evento só com as duas chaves fecha a janela: o projetor
 * aplica os dois campos na mesma transação. Separar seria criar exatamente o risco que esta
 * tela existe para tirar do caminho.
 *
 * `canais` vazio é uma escolha legítima e explícita: significa "todos os números", que é o
 * comportamento de quem nunca configurou nada. A tela diz isso com todas as letras.
 */
export async function salvarCanaisClara(
  canais: string[],
  ligar?: boolean,
): Promise<ResultadoAcao> {
  const limpos = [...new Set(canais.map((c) => String(c).trim()).filter((c) => c !== ""))];
  return registrarConfig({
    ...(ligar === undefined ? {} : { ativo: ligar }),
    escopo_patch: { canais: limpos },
  });
}

export interface ConfigFollowupForm {
  ativo: boolean;
  janelasMin: number[];
  inicio: number;
  fim: number;
}

/**
 * Follow-ups: cadência/horário como config — o runtime lê a config a CADA disparo.
 * Valida o MESMO contrato de produção que o runtime aplica (lib/clara/contrato-followup —
 * espelho do parseConfigFollowup): salvar valor fora do contrato mostraria um número na tela
 * e rodaria outro no runtime. Aqui a recusa vem com o porquê, nunca "valor inválido" seco.
 */
export async function salvarFollowup(cfg: ConfigFollowupForm): Promise<ResultadoAcao> {
  const janelas = cfg.janelasMin.map((n) => Math.round(n)).filter((n) => Number.isFinite(n) && n > 0);
  const problemas = problemasContrato(janelas, cfg.inicio, cfg.fim);
  if (!contratoOk(problemas)) {
    return { ok: false, motivo: problemas.janelas ?? problemas.horario ?? "valores fora do contrato de produção" };
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
