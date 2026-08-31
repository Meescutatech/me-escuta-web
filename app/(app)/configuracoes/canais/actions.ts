"use server";

import { randomUUID } from "crypto";
import {
  lerPapelAtual,
  registrarEventoComReadback,
  type ResultadoAcao,
} from "@/components/configuracoes/dados/porta";
import { lerCanal } from "@/components/configuracoes/dados/canais";
import {
  canalIdDoForm,
  payloadCanalAtivado,
  payloadCanalAtualizado,
  payloadCanalDesativado,
  payloadCanalRegistrado,
  podeGerirCanais,
  semProblemas,
  validarAtivacao,
  validarRegistroCanal,
  type FormCanal,
} from "@/components/configuracoes/regras/canais.ts";

/**
 * F9 · Ações da tela de canais de WhatsApp.
 *
 * Toda escrita passa por `registrarEventoComReadback` (ponto único, com releitura da projeção).
 * Nenhuma valida permissão por conta própria como se fosse a defesa: a guarda de papel vive na
 * porta e é ela que recusa. A checagem daqui existe para NÃO OFERECER o que o banco recusaria —
 * e quando escapa, o texto que aparece é o do banco, cru.
 */

const ROTA = "/configuracoes/canais";

export async function registrarCanal(form: FormCanal): Promise<ResultadoAcao> {
  const problemas = validarRegistroCanal(form);
  if (!semProblemas(problemas)) {
    return { ok: false, motivo: Object.values(problemas)[0], classe: "recusa" };
  }
  const { payload } = payloadCanalRegistrado(form);
  return registrarEventoComReadback({
    tipo: "canal_registrado",
    payload,
    idExterno: randomUUID(),
    revalidar: [ROTA],
  });
}

/**
 * R22/A1 · `area` SAIU desta assinatura, e a saída não é cosmética.
 *
 * Enquanto ela ficasse aqui, o campo seria aceito e DESCARTADO em silêncio: `payloadCanalAtualizado`
 * passou a emitir `departamento`, e `{ area }` continuaria compilando porque TypeScript só faz
 * checagem de propriedade excedente sobre literal de objeto — um `patch` vindo de variável passaria
 * limpo e o evento sairia sem departamento nenhum. Chamador que ainda mande `area` agora quebra o
 * `tsc`, que é onde esse tipo de engano deve aparecer.
 */
export async function atualizarCanal(
  canalId: string,
  patch: { nome?: string; numeroE164?: string; wabaId?: string; departamento?: string },
): Promise<ResultadoAcao> {
  if (Object.keys(patch).length === 0) {
    return { ok: false, motivo: "nada para atualizar", classe: "recusa" };
  }
  return registrarEventoComReadback({
    tipo: "canal_atualizado",
    payload: payloadCanalAtualizado(canalId, patch),
    idExterno: randomUUID(),
    revalidar: [ROTA],
  });
}

/**
 * Ligar. O corte de inbox é EXIGIDO quando o canal ainda não tem um (ARB-18.1): sem ele, ativar
 * despeja o histórico inteiro do número no inbox de todo mundo. A porta também exige — mas a
 * recusa não pode ser a primeira notícia que a gestora tem do assunto.
 */
export async function ativarCanal(canalId: string, inboxDesde: string): Promise<ResultadoAcao> {
  const [canal, papel] = await Promise.all([lerCanal(canalId), lerPapelAtual()]);
  if (!canal) {
    return { ok: false, motivo: "canal não encontrado (ou sem permissão para lê-lo)", classe: "recusa" };
  }
  const problemas = validarAtivacao({ canal, inboxDesde, papel });
  if (!semProblemas(problemas)) {
    return { ok: false, motivo: Object.values(problemas)[0], classe: "recusa" };
  }
  return registrarEventoComReadback({
    tipo: "canal_ativado",
    payload: payloadCanalAtivado(canalId, inboxDesde),
    idExterno: randomUUID(),
    revalidar: [ROTA, "/conversas"],
  });
}

/**
 * Desligar. `confirmado` não é cerimônia: desligar canal com fila cheia transforma cada mensagem
 * pendente em falha PERMANENTE, e o sender não retenta. A tela mostra o aviso e só chama isto
 * depois do "sim" — a flag é o que impede um caminho de código pular a confirmação em silêncio.
 */
export async function desativarCanal(
  canalId: string,
  opcoes: { confirmado: boolean; motivo?: string },
): Promise<ResultadoAcao> {
  if (!opcoes.confirmado) {
    return {
      ok: false,
      motivo: "desligar exige confirmação explícita: as mensagens ainda na fila deste canal viram falha permanente",
      classe: "recusa",
    };
  }
  return registrarEventoComReadback({
    tipo: "canal_desativado",
    payload: payloadCanalDesativado(canalId, opcoes.motivo),
    idExterno: randomUUID(),
    revalidar: [ROTA, "/conversas"],
  });
}

/** Só para a UI decidir o que mostrar. A defesa real é a guarda de papel na porta. */
export async function souGestorDeCanais(): Promise<boolean> {
  return podeGerirCanais(await lerPapelAtual());
}

/** Reexportado para a tela montar o id antes de gravar (o `lite:<slug>` sai do nome). */
export async function previsaoCanalId(form: FormCanal): Promise<string> {
  return canalIdDoForm(form);
}
