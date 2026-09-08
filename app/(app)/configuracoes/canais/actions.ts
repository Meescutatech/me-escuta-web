"use server";

import { randomUUID } from "crypto";
import {
  lerPapelAtual,
  registrarEventoComReadback,
  type ResultadoAcao,
} from "@/components/configuracoes/dados/porta";
import { lerCanal, lerHistoricoNivel } from "@/components/configuracoes/dados/canais";
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
  validarTrocaNivel,
  nivelValido,
  payloadNivelCanal,
  type FormCanal,
  type HistoricoNivel,
  type NivelCanal,
} from "@/components/configuracoes/regras/canais.ts";
import {
  exigeAceiteDoTermo,
  motivoAceiteDesatualizado,
} from "@/components/configuracoes/regras/lite-sessao.ts";

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

/**
 * D70 · TROCAR O NÍVEL do canal — de quem ele aceita mensagem e para quem deixa enviar.
 *
 * Três portões, nesta ordem, e a ordem é deliberada:
 *
 *  1. DOMÍNIO. Nível fora de `estrito | responde_qualquer_um | aberto` nem chega ao banco. É o
 *     mesmo fail-closed da leitura: ignorância nunca vira permissão.
 *  2. PAPEL / PROVEDOR / CONSENTIMENTO (`validarTrocaNivel`).
 *  3. D70.b · A VERSÃO DO TERMO. Sair do estrito exige aceite na versão VIGENTE — e este é o
 *     portão que não existia: até 08/09/2026 `TERMO_VERSAO` tinha um único uso no repositório
 *     (carimbar o valor no formulário), e nada comparava a versão gravada com a vigente.
 *
 *     Ele fica DEPOIS dos outros dois porque é o único que a tela sabe resolver sozinha: quando
 *     este é o que barra, o caminho não é "erro", é abrir o termo e registrar o aceite novo. Um
 *     papel insuficiente, ao contrário, não tem conserto nesta tela.
 *
 * ⚠️ A defesa REAL é a da porta e a do banco. `api.registrar_evento` recusa todo evento `canal_*`
 * de quem não é admin nem owner (medido no corpo vivo, 08/09). O que esta função faz é não
 * OFERECER o que seria recusado — a recusa não pode ser a primeira notícia.
 */
export async function definirNivelCanal(
  canalId: string,
  nivel: string,
  opcoes: { motivo?: string } = {},
): Promise<ResultadoAcao> {
  if (!nivelValido(nivel)) {
    return {
      ok: false,
      motivo: `nível "${nivel}" não existe: use estrito, responde_qualquer_um ou aberto`,
      classe: "recusa",
    };
  }
  const alvo: NivelCanal = nivel;

  const [canal, papel] = await Promise.all([lerCanal(canalId), lerPapelAtual()]);
  if (!canal) {
    return { ok: false, motivo: "canal não encontrado (ou sem permissão para lê-lo)", classe: "recusa" };
  }

  const problemas = validarTrocaNivel({ canal, nivel: alvo, papel });
  if (!semProblemas(problemas)) {
    return { ok: false, motivo: Object.values(problemas)[0], classe: "recusa" };
  }

  // ⚠️ ESTE PORTÃO É LIDO DO BANCO, NUNCA DA TELA, e é o que salva uma fraqueza real do caminho
  // do diálogo: o readback de `canal_consentimento_registrado` confere `consentimento_em not null`
  // — e num RE-consentimento essa coluna JÁ era não nula, então aquele readback é vacuo ali e
  // diria "ok" mesmo que a versão não tivesse sido atualizada. Aqui a versão é relida do banco
  // (`lerCanal` acima) e comparada de novo: se o aceite novo não pegou, o nível não troca.
  if (exigeAceiteDoTermo(alvo, canal.consentimento_texto_versao)) {
    return {
      ok: false,
      motivo: motivoAceiteDesatualizado(canal.consentimento_texto_versao),
      classe: "recusa",
    };
  }

  // CONFERE O EFEITO, nunca o rc: `registrarEventoComReadback` relê `core.v_canal_whatsapp` e
  // exige que o `nivel` de lá seja o que acabou de ser pedido (linha `canal_nivel_definido` em
  // CONFERENCIA).
  //
  // ⚠️ CORRIGIDO 08/09 — aqui estava escrito que numa base sem a coluna "o evento entrou no ledger
  // mas o nível não passou a valer". É falso, e medido: `porta.projetor_registro` não tem a linha
  // `canal_nivel_definido`, `porta.aplicar_projetores` levanta PMEE1 quando não acha o tipo, e
  // `porta.inserir_evento` aplica os projetores DEPOIS do insert e na MESMA transação, sem um
  // único `exception when`. O PMEE1 aborta tudo: nada entra no ledger e a releitura nem chega a
  // rodar. Enquanto a trilha do banco não registrar o tipo, esta ação falha inteira, com o texto
  // cru do PMEE1 na faixa vermelha — e é por isso que o PMEE1 está classificado como
  // `indisponivel` em `regras/porta.ts`: o que falta é migration, não permissão.
  return registrarEventoComReadback({
    tipo: "canal_nivel_definido",
    payload: payloadNivelCanal(canalId, alvo, opcoes.motivo),
    idExterno: randomUUID(),
    revalidar: [ROTA, "/conversas"],
  });
}

/**
 * D71.c · A auditoria do nível — a série de INTENÇÕES no ledger, com o limite dito junto: o valor
 * vigente vive em `core.canal_whatsapp.config_jsonb`, e uma alteração por UPDATE direto não passa
 * por evento nenhum e por isso NÃO aparece aqui.
 */
export async function lerTrocasDeNivel(canalId: string): Promise<HistoricoNivel> {
  return lerHistoricoNivel(canalId);
}

/** Só para a UI decidir o que mostrar. A defesa real é a guarda de papel na porta. */
export async function souGestorDeCanais(): Promise<boolean> {
  return podeGerirCanais(await lerPapelAtual());
}

/** Reexportado para a tela montar o id antes de gravar (o `lite:<slug>` sai do nome). */
export async function previsaoCanalId(form: FormCanal): Promise<string> {
  return canalIdDoForm(form);
}
