/**
 * O nome do cookie do departamento ativo e a forma do parâmetro de URL que o alimenta.
 *
 * Módulo próprio, minúsculo e SEM dependência de `next/headers` nem do cliente Supabase, por um
 * motivo mecânico: ele é importado pelo `middleware.ts`, que roda no runtime de edge. Puxar
 * `lib/dados/departamentos.ts` para lá arrastaria o cliente de banco inteiro para o bundle do
 * middleware — e o middleware roda em TODA requisição.
 */

export const COOKIE_DEPARTAMENTO = "me_escuta_departamento_ativo";

/**
 * O parâmetro de PORTA DE ENTRADA. Não é a sede do contexto (a sede é o cookie — ver o cabeçalho de
 * `lib/dados/departamentos.ts`, com a medida do Next 14 que decidiu isso). Ele existe para uma coisa
 * só: **o link compartilhado carregar o contexto**, que é o ganho do modelo Vercel apontado pelo
 * benchmark §3-bis.1 ("alguém manda 'olha esse lead' e o outro abre no departamento errado").
 *
 * O middleware o consome, grava o cookie e devolve a URL LIMPA. Consequência que é o ponto do
 * desenho: existe **uma** sede, então o rótulo do header e o conteúdo da tela não têm como
 * discordar. Um parâmetro que sobrevivesse na URL seria uma segunda fonte de verdade, e o header —
 * que mora no layout e não enxerga `searchParams` — mostraria a outra.
 */
export const PARAM_DEPARTAMENTO = "departamento";

/**
 * Forma da chave de departamento: snake_case sem acento, como todo vocabulário deste sistema
 * (Constituição §6). A guarda não é contra injeção — o valor é validado contra
 * `core.v_usuario_departamento` a cada leitura, e chave desconhecida é tratada como ausente. Ela é
 * contra um valor com vírgula ou parêntese entrar no cookie e, mais tarde, quebrar em silêncio a
 * sintaxe do `or` do PostgREST no predicado de escopo — o modo de falha caro, porque parece
 * funcionar.
 */
export const FORMA_CHAVE = /^[a-z0-9_]{1,40}$/;

/** Um ano. É preferência de visualização; expirar antes disso só produz "por que voltou sozinho?". */
export const MAX_AGE_DEPARTAMENTO = 60 * 60 * 24 * 365;
