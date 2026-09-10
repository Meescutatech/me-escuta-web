import type { Mensagem } from "@/lib/dados/conversas";

/**
 * Lógica pura das mensagens INTERATIVAS na thread (E3) — sem React, testável.
 *
 * O que é uma delas: a paciente não digitou, ela TOCOU num botão de resposta rápida de um
 * template. A Meta manda isso como `type: "button"` (botão de template) ou `type: "interactive"`
 * (button_reply / list_reply), e o parser do runtime já normaliza os dois para `botao` e
 * `interativa` (`TIPO_PT`). O texto do botão vira o `corpo` — em produção, 190 de 190 têm corpo.
 *
 * Por que existe um arquivo só para isto, em vez de um `if` dentro do componente: é o mesmo motivo
 * de `midia.ts` — o web testa com `node:test` e não tem harness de React, então regra que mora
 * dentro de JSX é regra que ninguém consegue pôr no vermelho.
 *
 * ⚠️ O QUE NÃO DÁ PARA SABER, e é decisão de honestidade da bolha: a que pergunta o botão
 * responde. 125 das 190 mensagens trazem o `context.id` do template respondido, e ZERO desses
 * templates existe no nosso ledger — eles saíram pelo Kommo, que divide a WABA conosco. Então a
 * bolha mostra o que a pessoa respondeu e não finge saber o que foi perguntado.
 */

/**
 * Tipos de botão: PT do contrato do ingestor (parser `TIPO_PT`) + EN das linhas históricas —
 * mesma dupla cobertura que `ehAudio`/`ehImagem` fazem em `midia.ts`.
 */
const TIPOS_BOTAO = new Set(["botao", "button", "interativa", "interactive"]);

export function ehTipoBotao(tipo: string | null | undefined): boolean {
  return TIPOS_BOTAO.has((tipo ?? "").toLowerCase());
}

/**
 * Pastilha de botão só quando é botão E há texto para mostrar.
 *
 * O `corpo` vazio cai de volta no rótulo honesto de sempre em vez de virar uma pastilha vazia —
 * mesma regra de degrade de `temImagemVisivel`: sem o conteúdo, a UI diz o que sabe em vez de
 * desenhar uma casca. Em produção isso nunca aconteceu (190/190 com corpo), e é justamente por
 * isso que o caminho precisa existir: o caso que nunca aconteceu é o que ninguém vai testar à mão.
 */
export function ehBotaoRecebido(
  m: Pick<Mensagem, "tipo_conteudo" | "corpo">,
): m is Pick<Mensagem, "tipo_conteudo" | "corpo"> & { corpo: string } {
  return ehTipoBotao(m.tipo_conteudo) && !!m.corpo?.trim();
}
