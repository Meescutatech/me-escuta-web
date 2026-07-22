/**
 * MODO DO COMPOSER — comandos `/` e a TRAVA DE ENVIO (Rodada 13 / Bloco C).
 * Spec: SPEC-NOTAS-TAREFAS-MENCOES §6.1, §6.2 e risco nº1 ("nota interna vazar para o cliente").
 *
 * Duas regras, ambas puras e testadas (tests/composer-modo.test.ts):
 *
 *  C1 — `/` só abre o menu como PRIMEIRO caractere do campo. No meio de uma frase é barra
 *       literal: em PT-BR se digita data com barra o tempo todo (23/07), e o menu não pode
 *       aparecer nisso. Um espaço depois da barra também fecha o menu — virou texto.
 *
 *  C3 — enquanto o modo for `nota` ou `tarefa` é IMPOSSÍVEL mandar mensagem ao cliente.
 *       A trava mora AQUI, no caminho de envio: `despacharAoCliente` é o único portão que a
 *       UI usa para falar com o cliente, e ele não chama o `enviar` em modo interno. Botão
 *       desabilitado por CSS é conforto visual, não garantia — CSS não impede Enter, não
 *       impede submit programático e some num refactor.
 */

export type ModoComposer = "mensagem" | "nota" | "tarefa";
export type ModoInterno = Exclude<ModoComposer, "mensagem">;

export interface ComandoComposer {
  modo: ModoInterno;
  comando: string;
  explicacao: string;
}

/** Os dois comandos da rodada. Ordem = ordem do menu (mockup composer-comandos-v3, estado b). */
export const COMANDOS: ComandoComposer[] = [
  { modo: "nota", comando: "/nota", explicacao: "Nota interna, só para a equipe" },
  { modo: "tarefa", comando: "/tarefa", explicacao: "Tarefa com responsável e prazo" },
];

/**
 * Termo digitado depois da barra, ou null quando não há menu.
 * `""` (barra sozinha) é um termo válido — abre o menu inteiro.
 */
export function termoComando(texto: string): string | null {
  if (!texto.startsWith("/")) return null;
  const termo = texto.slice(1);
  if (/\s/.test(termo)) return null; // "/ola mundo" já é frase, não comando
  return termo;
}

/** Comandos que casam com o termo (prefixo, sem acento/caixa). `[]` = menu fechado. */
export function menuComandos(texto: string): ComandoComposer[] {
  const termo = termoComando(texto);
  if (termo === null) return [];
  const alvo = normalizar(termo);
  return COMANDOS.filter((c) => normalizar(c.comando.slice(1)).startsWith(alvo));
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function ehModoInterno(modo: ModoComposer): modo is ModoInterno {
  return modo === "nota" || modo === "tarefa";
}

export function rotuloModo(modo: ModoInterno): string {
  return modo === "nota" ? "Nota interna" : "Tarefa";
}

/** Motivo único da recusa — o mesmo texto no aviso da UI e no retorno da trava. */
export const MOTIVO_TRAVA =
  "o campo está em modo interno — nada daqui vai para o cliente";

/** A pergunta que o caminho de envio faz antes de qualquer coisa. */
export function podeEnviarAoCliente(modo: ModoComposer): boolean {
  return modo === "mensagem";
}

export interface ResultadoDespacho {
  enviado: boolean;
  motivo?: string;
}

/**
 * ÚNICO portão de saída para o cliente. Em modo interno devolve `enviado:false` e — o que
 * importa — NÃO invoca `enviar`. O teste da trava (C3) prova exatamente isso: o espião de
 * envio fica com zero chamadas em modo nota e em modo tarefa.
 */
export function despacharAoCliente(
  modo: ModoComposer,
  texto: string,
  enviar: (texto: string) => void,
): ResultadoDespacho {
  if (!podeEnviarAoCliente(modo)) return { enviado: false, motivo: MOTIVO_TRAVA };
  const corpo = texto.trim();
  if (!corpo) return { enviado: false, motivo: "mensagem vazia" };
  enviar(corpo);
  return { enviado: true };
}
