"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { registrarEventoComReadback, type ResultadoAcao } from "@/components/configuracoes/dados/porta";

/**
 * Ações de `/configuracoes/agentes` e `/configuracoes/agentes/[id]` — 14/09/2026.
 *
 * ── Por que este arquivo não existia ────────────────────────────────────────────────────────
 * Nunca houve action de ligar/desligar agente genérico. Até `aac6aec` (11/09) a rota `[id]`
 * mandava `jarvis` para o `PainelJarvis` e **redirecionava todo o resto para a página da Clara** —
 * duas telas que gravam. Depois dela as duas saídas passaram a renderizar a `TelaAgente`, que
 * herdou os controles locais do ensaio: `setLigado(v)` dizia "parado" com o agente ativo, e
 * "Publicar v+1" incrementava um número enquanto o agente seguia com o prompt antigo.
 *
 * ── Por que é pequeno ──────────────────────────────────────────────────────────────────────
 * O caminho inteiro já existe e está provado: é o mesmo de `clara/actions.ts`, que só tinha o
 * agente cravado no payload. Aqui ele é parâmetro. Nada no banco precisou mudar —
 * `api.registrar_evento` já exige `payload.agente_id` e recusa agente inexistente, e
 * `api.propor_atualizacao_prompt` já recebe `p_agente_alvo`. Medido no corpo VIVO em produção
 * (14/09), não no arquivo da migration.
 *
 * ── Por que NÃO copiei o `clara/actions.ts` ────────────────────────────────────────────────
 * A Clara escreve direto com `api.registrar_evento` e está na lista de HERDADOS do portão
 * `readback` — uma dívida declarada, não um exemplo. Arquivo novo passa pelo ponto único de
 * escrita (`components/configuracoes/dados/porta.ts`), que só devolve sucesso depois de RELER a
 * projeção. Numa correção cujo assunto é "a tela diz que gravou e não gravou", herdar a exceção
 * seria a ironia cara.
 *
 * ── As guardas que valem aqui, e onde elas moram ───────────────────────────────────────────
 * Nenhuma delas está neste arquivo, e é de propósito: `core.agente` recusa UPDATE direto por
 * trigger (0108), então evento é o único caminho, e quem valida é o banco.
 *   · `config_atualizada` exige admin/owner e agente existente (0042/0104)
 *   · `propor_atualizacao_prompt` exige admin/owner (api) e tem lock por `versao_base`
 * O `gestao` que a tela usa para esconder o controle é conveniência de UI, não segurança.
 */

export type { ResultadoAcao };

/**
 * LIGAR / DESLIGAR qualquer agente.
 *
 * ⚠️ LIGAR a Clara não passa por aqui, e não é por acaso: ela é a única que fala com paciente em
 * tempo real, e o roteador `core.agentes_para_gatilho` não filtra por canal — ligar sem escolher o
 * número a punha para responder na WABA compartilhada com o Kommo (medido 11/09). Por isso a grade
 * desvia para o `DialogoLigarClara`, que grava `ativo` e `escopo_patch.canais` no MESMO evento.
 * DESLIGAR passa por aqui, sempre: parar nunca precisa de cerimônia, e não abre janela nenhuma.
 */
export async function alternarAgente(agenteId: string, ligar: boolean): Promise<ResultadoAcao> {
  const id = agenteId.trim();
  if (!id) return { ok: false, motivo: "agente não informado" };
  return registrarEventoComReadback({
    tipo: "config_atualizada",
    idExterno: randomUUID(),
    payload: { agente_id: id, ativo: ligar },
    revalidar: ["/configuracoes/agentes", `/configuracoes/agentes/${id}`],
  });
}

/**
 * LIGAR / DESLIGAR UMA CAPACIDADE do agente — a régua de autonomia, que até 14/09 não gravava.
 *
 * ── Por que só dois estados, e não os três do banco ────────────────────────────────────────
 * O vocabulário de `core.agente.autonomia_jsonb` é `auto | propor | proibido`, e a régua oferecia
 * as três posições. Mas o consumidor real é BINÁRIO: `lerGateJarvis`
 * (runtime `src/jarvis/tarefas/worker.ts`) exige `criar_tarefa === 'auto'` e, em qualquer outro
 * nível, o Jarvis **não propõe — ele cala**. Oferecer "Propõe" seria um botão que promete uma
 * fila de sugestões e entrega silêncio. Decisão do Diogo em 14/09: "corta essa feature por
 * enquanto. Só liga ou desliga".
 *
 * Então: ligado = `auto`, desligado = `proibido`. Capacidade cujo TETO não é `auto` (Art. III.3 —
 * preço, crédito, conduta clínica, e mais quatro em `flag.teto_autonomia`) não ganha interruptor
 * nenhum, porque a porta recusaria `auto` e a tela não oferece o que o banco recusa.
 *
 * ── As guardas, e onde elas moram ──────────────────────────────────────────────────────────
 * Nenhuma aqui, de novo de propósito. Em `api.registrar_evento` (0104/0160/0165), medidas no
 * corpo VIVO em produção em 14/09: admin/owner · agente existe · capacidade no catálogo vigente
 * (`core.v_config_vigente` nome `capacidade_agente`) · nível ∈ auto|propor|proibido · teto
 * constitucional (`core.teto_capacidade`, fail-closed em `propor`) · MOTIVO com ≥ 3 caracteres.
 *
 * ⚠️ A sexta é a que quase passou batido: o ledger É a auditoria, e a porta recusa evento sem
 * `motivo`. Ele é composto aqui em vez de pedido num diálogo porque o pedido do Diogo foi um
 * interruptor, não um formulário — e o que o campo precisa dizer, o interruptor já sabe: o que
 * mudou e por onde. Quem mudou e quando são do ledger, não deste texto.
 */
export async function alterarAutonomiaAgente(
  agenteId: string,
  capacidade: string,
  ligar: boolean,
): Promise<ResultadoAcao> {
  const id = agenteId.trim();
  if (!id) return { ok: false, motivo: "agente não informado" };
  const cap = capacidade.trim();
  if (!cap) return { ok: false, motivo: "capacidade não informada" };

  const nivel = ligar ? "auto" : "proibido";
  return registrarEventoComReadback({
    tipo: "autonomia_alterada",
    idExterno: randomUUID(),
    payload: {
      agente_id: id,
      capacidade: cap,
      nivel,
      motivo: ligar
        ? `ligada na tela do agente: passa a fazer "${cap}" sozinho`
        : `desligada na tela do agente: deixa de fazer "${cap}"`,
    },
    revalidar: ["/configuracoes/agentes", `/configuracoes/agentes/${id}`],
  });
}

/**
 * RESPONSÁVEL PADRÃO do agente — para quem vai a tarefa quando não há dono claro.
 *
 * ── O que isto resolve ─────────────────────────────────────────────────────────────────────
 * O Jarvis resolve o responsável em três degraus (runtime, `resolverDestinoTarefa`): dono ativo
 * do lead → gestor do departamento de entrada → owner. Em produção o segundo degrau é vazio —
 * `core.usuario_departamento` tem ZERO linhas (medido 14/09) —, então TODA tarefa sem dono cai no
 * owner. Este campo troca esse último degrau por uma pessoa escolhida na tela. O rodízio por
 * departamento continua valendo no dia em que houver lotação: isto é o último degrau, não o
 * primeiro.
 *
 * ── Caminho barato, sem migration ──────────────────────────────────────────────────────────
 * `config_atualizada` com `config_patch` já faz merge em `core.agente.config_jsonb`
 * (`porta.proj_config_agente`, 0107 — conferido no corpo vivo). MERGE, não substituição: o
 * `prompt_conversa` do Jarvis mora no mesmo jsonb e um patch que o apagasse tiraria o Jarvis do
 * ar sem erro nenhum.
 *
 * 🔴 O RUNTIME AINDA NÃO LÊ `responsavel_padrao`. Esta metade grava e é auditável; a outra metade
 * — o degrau em `resolverDestinoTarefa` — é de outro repositório e NÃO foi feita aqui. Enquanto
 * ela não existir, gravar este campo não muda para onde a tarefa vai. A tela diz isso ao lado do
 * campo, com todas as letras: prometer ponta a ponta o que só tem metade é o defeito que a
 * rodada inteira de 14/09 existiu para tirar.
 */
export async function definirResponsavelPadrao(
  agenteId: string,
  usuarioId: string,
): Promise<ResultadoAcao> {
  const id = agenteId.trim();
  if (!id) return { ok: false, motivo: "agente não informado" };
  const uid = usuarioId.trim();
  if (!uid) return { ok: false, motivo: "escolha a pessoa que recebe a tarefa" };

  return registrarEventoComReadback({
    tipo: "config_atualizada",
    idExterno: randomUUID(),
    payload: { agente_id: id, config_patch: { responsavel_padrao: uid } },
    revalidar: ["/configuracoes/agentes", `/configuracoes/agentes/${id}`],
  });
}

/**
 * Publica uma versão nova do prompt de um agente (propõe + aplica, como a tela da Clara faz).
 *
 * São duas chamadas porque o caminho versionado é de duas etapas (0007/0008): `propor` cria a
 * sugestão com lock otimista por `versao_base` e `validar_sugestao` a aplica, gerando
 * `prompt_atualizado`. Publicar sem passar pela proposta existiria fora do ledger.
 */
export async function publicarPromptAgente(
  agenteId: string,
  promptNovo: string,
  justificativa: string,
  versaoBase: number,
): Promise<ResultadoAcao> {
  const id = agenteId.trim();
  if (!id) return { ok: false, motivo: "agente não informado" };
  const texto = promptNovo.trim();
  if (texto.length === 0) return { ok: false, motivo: "prompt vazio" };
  if (justificativa.trim().length === 0) {
    return { ok: false, motivo: "descreva o que mudou (fica no histórico auditável)" };
  }

  const supabase = criarClienteServidor();
  const { data: proposta, error: errProposta } = await supabase
    .schema("api")
    .rpc("propor_atualizacao_prompt", {
      p_agente_alvo: id,
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

  revalidatePath("/configuracoes/agentes");
  revalidatePath(`/configuracoes/agentes/${id}`);
  return { ok: true };
}
