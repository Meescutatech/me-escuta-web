/**
 * O QUE A BOLHA DE TEXTO MOSTRA — regra única do inbox (`ConteudoBolha`) e do drawer do funil
 * (`FioLead`). Pura, sem React: os dois componentes só desenham o resultado.
 *
 * Existe porque o `FioLead` tinha um ESPELHO do `ConteudoBolha` e o espelho divergiu: o galho de
 * `template` entrou no inbox em 21/09 e o funil continuou escrevendo `Mensagem (template)`.
 *
 * - texto: o corpo; vazio vira `[mensagem vazia]`.
 * - template: é texto, não mídia. Com corpo, o corpo (o sender grava o corpo montado desde 21/09);
 *   sem corpo é linha anterior a isso e vai ficar vazia para sempre — a bolha diz o que houve.
 * - qualquer outro tipo: `null`, e o componente segue para as bolhas tipadas / rótulo de mídia.
 */
export type TextoDaBolha = { tipo: "corpo"; texto: string } | { tipo: "aviso"; texto: string };

export const AVISO_TEMPLATE_SEM_CORPO = "Template enviado — o texto não ficou registrado nesta mensagem.";

export function textoDaBolha(
  tipoConteudo: string | null | undefined,
  corpo: string | null | undefined,
): TextoDaBolha | null {
  const tipo = (tipoConteudo ?? "text").toLowerCase();
  if (tipo === "text" || tipo === "texto") {
    return corpo ? { tipo: "corpo", texto: corpo } : { tipo: "aviso", texto: "[mensagem vazia]" };
  }
  if (tipo === "template") {
    return corpo ? { tipo: "corpo", texto: corpo } : { tipo: "aviso", texto: AVISO_TEMPLATE_SEM_CORPO };
  }
  return null;
}
