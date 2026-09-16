// caminho RELATIVO, não `@/`: o runner (`node --test`) não resolve o alias do tsconfig, e o import
// falha em runtime com ERR_MODULE_NOT_FOUND mesmo com o typecheck verde. É o mesmo padrão do
// `numero-conversa.test.ts`, que sempre importou assim.
import { chipDoNumero, type ChipNumero, type OrigemConversa } from "../../components/conversas/regras/numero.ts";

/**
 * OS FIOS DE UM LEAD — a pessoa é uma, os números são vários.
 *
 * Até 15/09/2026 o drawer do card lia UMA conversa por lead (`.limit(1).maybeSingle()`, ordenada por
 * `atualizado_em`). Enquanto todo mundo entrava por um número só, isso era verdade suficiente. Com o
 * fio novo por número (1a, no ar em `7c46bac`), o mesmo lead passa a ter mais de um fio — e mostrar
 * só o mais recente esconde conversa respondida, sem avisar.
 *
 * Medido em produção em 15/09: 5 leads reais com 2+ fios, um deles com 3 (`lite:diogo` 20 msgs,
 * `teste_meta` 18, CLARA 9). É o COO testando pelos três números.
 *
 * Puro de propósito: no 1a a guarda sobre texto-fonte passou no estado quebrado e só a de
 * comportamento reprovou. Ordem e rótulo são comportamento, e é aqui que eles moram.
 */

/** Um fio como a view `core.v_conversa` o entrega, mais as mensagens já lidas. */
export interface FioDoLead extends OrigemConversa {
  conversaId: string;
  /** `null` = a view não soube dizer; o fio continua existindo e vai para o fim da lista. */
  atualizado_em: string | null;
  mensagens: unknown[];
}

/**
 * Mais recente primeiro — é onde a conversa está viva, e é o bloco que a pessoa quer ler antes.
 * Quem não tem data vai para o fim SEM sumir: fio invisível é o dano nº 1 desta tela.
 */
export function ordenarFiosDoLead<T extends { atualizado_em: string | null }>(fios: T[]): T[] {
  return [...fios].sort((a, b) => {
    const ta = a.atualizado_em ? Date.parse(a.atualizado_em) : Number.NEGATIVE_INFINITY;
    const tb = b.atualizado_em ? Date.parse(b.atualizado_em) : Number.NEGATIVE_INFINITY;
    return tb - ta;
  });
}

/**
 * A etiqueta do bloco. Delega ao `chipDoNumero` (M7) em vez de montar rótulo próprio — lá já estão
 * resolvidos os cinco casos, o selo de TESTE, o de identidade ausente, e a regra de que o
 * `phone_number_id` NUNCA vira rótulo (em canal não oficial ele é `lite:<nome-da-fono>`, e
 * `core.conversa` é legível por todo `authenticated`).
 */
export function rotuloDoFio(fio: OrigemConversa): ChipNumero {
  return chipDoNumero(fio);
}
