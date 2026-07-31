"use server";

import { randomUUID } from "crypto";
import { registrarEventoComReadback } from "@/components/configuracoes/dados/porta";

/**
 * Ações da tela Configurações > Identidades externas (R18 · M3).
 *
 * A rota se chama `identidades`, NÃO `kommo`, e é decisão de contrato: o D3-dado diz que o ID do
 * Kommo vira ORIGEM HISTÓRICA, não identidade, e a tabela é genérica por entidade justamente para
 * receber leads, conversas e campos depois. Uma rota `/configuracoes/kommo` teria de ser renomeada
 * no dia do desligamento — e rota renomeada quebra link salvo.
 */

export interface ResultadoAcao {
  ok: boolean;
  motivo?: string;
}

/**
 * Emite `identidade_externa_vinculada`.
 *
 * ⚠ `idInterno === null` é DESCARTE EXPLÍCITO ("este ID não corresponde a ninguém"), e é uma
 * decisão de peso: no acervo real ele significa mandar 355 leads para o rodízio (D16). Por isso a
 * intenção tem de vir DECLARADA no parâmetro `descartar`, e não pode ser o valor default de um
 * controle não tocado. Sem essa exigência, um `<select>` vazio submetido por engano descartaria
 * 62% do acervo com um clique — e o evento é append-only.
 *
 * A distinção que o banco faz (chave ausente RECUSA / null explícito DESCARTA) só protege quem
 * chega até ele. Esta função é a fronteira anterior, e ela repete a distinção de propósito.
 */
export async function vincularIdentidadeExterna(
  sistema: string,
  entidade: string,
  idExterno: string,
  idInterno: string | null,
  descartar: boolean,
): Promise<ResultadoAcao> {
  if (!sistema || !entidade || !idExterno) {
    return { ok: false, motivo: "sistema, entidade e id_externo são obrigatórios" };
  }

  // As duas metades da guarda, e as duas erram alto:
  if (descartar && idInterno) {
    return { ok: false, motivo: "descartar e vincular a uma pessoa são decisões incompatíveis" };
  }
  if (!descartar && !idInterno) {
    return {
      ok: false,
      motivo:
        "escolha uma pessoa, ou marque explicitamente que este ID não corresponde a ninguém. " +
        "Não decidir é um estado válido — e é o estado em que a linha já está.",
    };
  }

  // PONTO ÚNICO DE ESCRITA (portão `readback` do Web-B). A versão original desta ação chamava
  // `api.registrar_evento` direto — o que faz o readback virar opcional, e foi o que o portão
  // acusou quando a M3 encontrou o Web-B no merge da integração. `registrarEventoComReadback`
  // monta o envelope, recusa tipo sem conferência declarada ANTES de escrever, e confere a
  // projeção depois. A recusa da porta continua voltando LITERAL para a tela: as mensagens
  // distinguem não-membro, revogado e sem permissão, e o usuário precisa saber qual das três foi.
  return registrarEventoComReadback({
    tipo: "identidade_externa_vinculada",
    idExterno: randomUUID(),
    // `lead_id` NÃO se aplica: não é evento de lead. Declarado para ninguém "consertar" pondo um.
    payload: {
      sistema,
      entidade,
      // ID CRU, sem prefixo. `kommo:10248863` aqui quebraria o portão do backfill em silêncio.
      id_externo: idExterno,
      // A chave vai SEMPRE presente; o valor é que pode ser null (descarte).
      id_interno: descartar ? null : idInterno,
    },
    revalidar: ["/configuracoes/identidades", "/funil"],
  });
}
