/**
 * M7 · R18 — REGRAS PURAS do chip de número na conversa (SPEC-M7 §5.1 e §5.2).
 *
 * Responde a UMA pergunta que a tela hoje não responde: **por qual número esta conversa entrou?**
 * Medido em produção 28/07/2026: `lib/dados/conversas.ts` nem pede `phone_number_id` no select —
 * o chip não existe hoje nem por acidente, porque o dado está na view e a tela não o busca.
 *
 * Três coisas que quem mexer aqui precisa saber e não descobre lendo o código:
 *
 *  1. O RÓTULO NUNCA É O `phone_number_id`. Canal não oficial tem id `lite:<slug-do-nome-da-fono>`,
 *     e `core.conversa` é legível por TODO `authenticated` — expor o id como rótulo contornaria a
 *     RLS que existe justamente para esconder o nome dela (CA-9). O rótulo é o APELIDO, e quando
 *     não há apelido legível o chip degrada para texto neutro, nunca para o id cru.
 *
 *  2. O CHIP NUNCA FICA EM BRANCO. Cinco casos, e os cinco existem em produção hoje. Ausência de
 *     rótulo é indistinguível de bug de renderização, e "sem número de origem" é informação.
 *
 *  3. O SELO `TESTE` NÃO SE ESCONDE POR VALOR ÚNICO (ARB-R18-05). Hoje 100% das conversas do inbox
 *     são de número de teste e NADA na tela diz isso. A regra genérica da casa — coluna de valor
 *     único some — apagaria exatamente o alarme. Valor único aqui não é redundância: é o achado.
 */

import type { Finalidade } from "@/components/configuracoes/regras/canais.ts";

/**
 * O que a conversa sabe sobre o próprio número. Todos os campos podem faltar, e cada ausência tem
 * um significado diferente — é por isso que são quatro campos e não um objeto "canal".
 */
export interface OrigemConversa {
  /** `core.conversa.phone_number_id`. `null` = conversa sem contraparte (13 linhas medidas). */
  phone_number_id: string | null;
  /** apelido do canal. `null` = não cadastrado OU a RLS não deixa este papel ler a linha. */
  numero_apelido: string | null;
  /** E.164 do canal. `null` = idem, e também "identidade nunca registrada" (o caso do M7). */
  numero_e164: string | null;
  /** `null` = coluna ainda não existe neste ambiente, OU não legível. NUNCA "produção". */
  finalidade: Finalidade | null;
}

export type CasoChip =
  | "cadastrado"
  | "cadastrado_sem_identidade"
  | "nao_cadastrado"
  | "sem_numero";

/** Selos que se acumulam sobre o rótulo. Nenhum deles se esconde. */
export type SeloChip = "teste" | "sem_identidade" | "finalidade_ausente";

export interface ChipNumero {
  /** Sempre preenchido. Nunca o `phone_number_id`, nunca vazio. */
  rotulo: string;
  caso: CasoChip;
  /** Ordem estável: `teste` primeiro, porque é o que corrige um engano ativo. */
  selos: SeloChip[];
  /** Texto de apoio (tooltip / linha de detalhe). Diz o MOTIVO, não repete o rótulo. */
  titulo: string;
  /** `true` quando o chip carrega aviso — a tela usa âmbar, não cinza. Aviso não é metadado. */
  atencao: boolean;
}

export const ROTULO_SEM_NUMERO = "sem número de origem";
export const ROTULO_NAO_CADASTRADO = "número desconhecido";
export const ROTULO_NAO_VISIVEL = "número não visível para o seu papel";

/**
 * O chip, nos cinco casos. Puro: entra o que a view devolveu, sai o que a tela desenha.
 *
 * A ordem dos testes importa e não é estética — `sem_numero` tem de vir antes de tudo, senão uma
 * conversa sem contraparte cai em "não cadastrado" e a tela acusa um cadastro que falta e não
 * existe.
 */
export function chipDoNumero(o: OrigemConversa): ChipNumero {
  const pnid = (o.phone_number_id ?? "").trim();
  const apelido = (o.numero_apelido ?? "").trim();
  const e164 = (o.numero_e164 ?? "").trim();

  if (pnid.length === 0) {
    return {
      rotulo: ROTULO_SEM_NUMERO,
      caso: "sem_numero",
      selos: [],
      titulo: "esta conversa não tem número de contraparte registrado — veio de importação ou de teste interno",
      atencao: false,
    };
  }

  // Não cadastrado OU não legível pela RLS. Os dois degradam igual DE PROPÓSITO: a tela não tem
  // como distinguir os dois, e fingir que tem seria inventar. O texto cobre os dois sem mentir.
  if (apelido.length === 0) {
    return {
      rotulo: ROTULO_NAO_CADASTRADO,
      caso: "nao_cadastrado",
      selos: [],
      titulo:
        "o número por onde esta conversa entrou não está cadastrado em Configurações › Números — ou não é visível para o seu papel",
      atencao: true,
    };
  }

  const selos: SeloChip[] = [];
  if (o.finalidade === "teste") selos.push("teste");
  else if (o.finalidade === null) selos.push("finalidade_ausente");

  if (e164.length === 0) {
    selos.push("sem_identidade");
    return {
      rotulo: apelido,
      caso: "cadastrado_sem_identidade",
      selos,
      titulo:
        "este número está cadastrado e LIGADO, mas não tem identidade registrada: ninguém sabe, pelo banco, qual número é",
      atencao: true,
    };
  }

  return {
    rotulo: apelido,
    caso: "cadastrado",
    selos,
    titulo: o.finalidade === "teste"
      ? "número de TESTE da Meta: só entrega a destinatários em lista de permissão"
      : `conversa recebida por ${apelido}`,
    atencao: selos.length > 0,
  };
}

export function rotuloSelo(s: SeloChip): string {
  if (s === "teste") return "TESTE";
  if (s === "sem_identidade") return "SEM IDENTIDADE";
  return "SEM FINALIDADE";
}

// ────────────────────────── a regra de envio: o sistema nunca escolhe ──────────────────────────

/**
 * SPEC-M7 §5.2 — a resposta sai SEMPRE pelo mesmo número que recebeu. Não há seletor, e a ausência
 * de seletor é deliberada: enquanto responder pelo mesmo número for a regra, a classe inteira de
 * "respondeu pelo chip errado" não tem como acontecer.
 *
 * O que esta função decide é só QUANDO avisar e QUANDO desabilitar, e a distinção entre as duas é
 * o ponto do critério CA-13 — ele tem de reprovar nos DOIS sentidos:
 *
 *  - **avisar** quando o número é de teste. Enviar por número de teste é LEGÍTIMO em ensaio (foi
 *    assim que as 12 mensagens de 27/07 chegaram ao telefone do Diogo). Bloquear quebraria ensaio
 *    legítimo. O que não é legítimo é descobrir depois.
 *  - **desabilitar** quando o número não está cadastrado ou está inativo, porque aí o `sender` já
 *    devolveria `falha_permanente` (`sender.ts:313-322`) — e falha permanente DEPOIS do clique é
 *    pior que botão desabilitado antes dele.
 */
export interface VereditoEnvio {
  pode: boolean;
  /** Preenchido só quando `pode = false`. Nomeia o limite, nunca "erro ao enviar". */
  motivo: string | null;
  /** Preenchido quando dá para enviar mas há risco. Aviso NÃO bloqueia. */
  aviso: string | null;
  /** Texto de apoio do composer: por qual número a resposta sai. Sem seletor. */
  respondePor: string | null;
}

export interface ContextoEnvio extends OrigemConversa {
  /**
   * `core.canal_whatsapp.ativo` do número desta conversa. `null` = não deu para saber (canal não
   * cadastrado, ou coluna não legível) — e "não sei" NÃO é "está ligado".
   */
  canal_ativo: boolean | null;
}

export function vereditoEnvio(c: ContextoEnvio): VereditoEnvio {
  const chip = chipDoNumero(c);

  if (chip.caso === "sem_numero") {
    return {
      pode: false,
      motivo:
        "esta conversa não tem número de contraparte: não há por onde responder. O envio falharia de forma permanente",
      aviso: null,
      respondePor: null,
    };
  }

  if (chip.caso === "nao_cadastrado") {
    return {
      pode: false,
      motivo:
        "o número por onde esta conversa entrou não está cadastrado: o envio falharia de forma PERMANENTE e a mensagem não volta sozinha. Cadastre o número em Configurações › Números",
      aviso: null,
      respondePor: null,
    };
  }

  if (c.canal_ativo === false) {
    return {
      pode: false,
      motivo:
        "o número desta conversa está DESLIGADO: o envio falharia de forma permanente. Ligue o número em Configurações › Números antes de responder",
      aviso: null,
      respondePor: chip.rotulo,
    };
  }

  if (c.finalidade === "teste") {
    return {
      pode: true,
      motivo: null,
      aviso:
        "este número é de teste e só entrega a destinatários em lista de permissão; a mensagem pode falhar",
      respondePor: chip.rotulo,
    };
  }

  if (chip.caso === "cadastrado_sem_identidade") {
    return {
      pode: true,
      motivo: null,
      aviso:
        "este número não tem identidade registrada: dá para enviar, mas não há como conferir, pelo banco, por qual número a mensagem sai",
      respondePor: chip.rotulo,
    };
  }

  return { pode: true, motivo: null, aviso: null, respondePor: chip.rotulo };
}
