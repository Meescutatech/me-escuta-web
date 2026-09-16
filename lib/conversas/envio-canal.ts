/**
 * POR QUAL NÚMERO ESTA MENSAGEM SAI — a decisão, isolada e pura.
 *
 * Até 15/09/2026 o seletor "Enviando por X ▾" era decoração: `canalEscolhido` existia no estado do
 * composer, `fioNovo` era calculado, e nenhum dos dois entrava na chamada de envio. O payload saía
 * `{conversa_id, corpo}` e a porta derivava o número DA CONVERSA — então escolher "Oficial" mandava
 * pelo `teste_meta` do mesmo jeito. Relato do COO, com três números: *"todas as msgs vieram para mim
 * pelo teste_meta"*.
 *
 * A conversa É o par (número, telefone) — o id dela é `md5(phone_number_id|telefone)`. Por isso
 * falar com a mesma pessoa por outro número não é "a mesma conversa com outro remetente": é outro
 * fio, e é assim que o Kommo mostra. Quem cria esse fio é a porta, ao receber o par no payload.
 */

export interface CanalDisponivel {
  id: string;
  apelido: string;
  producao: boolean;
}

export type EscolhaEnvio =
  /** responde no fio em que a pessoa já está — 100% do uso de hoje */
  | { modo: "mesma_conversa" }
  /** abre (ou reencontra) o fio daquele número com aquela pessoa */
  | { modo: "fio_novo"; phone_number_id: string; telefone: string }
  /** não sai: dizer por que, antes do clique, é melhor que falhar depois */
  | { modo: "recusado"; motivo: string };

export interface PedidoEnvio {
  /** o que o seletor marcou. `null` = seletor intocado. */
  canalEscolhidoId: string | null;
  /** o canal por onde esta conversa entrou. */
  canalDaConversaId: string | null;
  /** a contraparte. Sem ela a porta recusa com PMEE5 e a mensagem não projeta. */
  telefone: string | null;
  /** os canais que o SERVIDOR autorizou para esta pessoa (`lerCanaisDeEnvio`). */
  canaisPermitidos: CanalDisponivel[];
}

/**
 * O PAYLOAD DO ENVIO — e a exclusividade é o ponto inteiro desta função.
 *
 * `porta.inserir_evento` completa a identidade pela conversa apontada quando recebe `conversa_id`
 * (passo ii da 0118). Então mandar o par JUNTO do `conversa_id` não é redundância inofensiva: o
 * número escolhido é descartado e a mensagem sai pelo canal da conversa, em silêncio — o bug
 * original, de volta. Aqui os dois modos não podem coexistir por construção.
 *
 * Existe como função, e não como ternário na action, porque guarda sobre texto de arquivo passa no
 * estado quebrado: com o defeito aplicado, as três palavras continuavam no arquivo e a suíte seguia
 * verde. Só o teste de comportamento reprova.
 */
export function montarPayloadEnvio(p: {
  conversaId: string;
  canalDestino?: { phone_number_id: string; telefone: string } | null;
}): Record<string, unknown> {
  return p.canalDestino
    ? { telefone: p.canalDestino.telefone, phone_number_id: p.canalDestino.phone_number_id }
    : { conversa_id: p.conversaId };
}

export function escolherCanalDeEnvio(p: PedidoEnvio): EscolhaEnvio {
  // Seletor intocado, ou marcado no próprio canal da conversa: nada muda.
  if (!p.canalEscolhidoId || p.canalEscolhidoId === p.canalDaConversaId) {
    return { modo: "mesma_conversa" };
  }

  // Autorização antes de qualquer outra coisa: a lista vem do servidor, e a tela não inventa por
  // onde falar. No Lite, o número é o WhatsApp PESSOAL de uma fonoaudióloga.
  if (!p.canaisPermitidos.some((c) => c.id === p.canalEscolhidoId)) {
    return { modo: "recusado", motivo: "este número não está autorizado para você" };
  }

  if (!p.telefone) {
    return {
      modo: "recusado",
      motivo: "esta conversa não tem telefone: não há com quem abrir o fio novo",
    };
  }

  return { modo: "fio_novo", phone_number_id: p.canalEscolhidoId, telefone: p.telefone };
}
