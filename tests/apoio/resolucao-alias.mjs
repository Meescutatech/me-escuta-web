/**
 * Hook de resolução de módulo para o `node --test` (22/08).
 *
 * POR QUE ELE EXISTE — e por que ele não é conveniência.
 *
 * `npm test` roda `node --experimental-strip-types --test tests/*.test.ts`: sem bundler, sem
 * `tsconfig.paths`, sem resolução de extensão. Consequência medida: TODO teste deste repo que
 * tocava em `lib/dados/*` só podia importar TIPOS (`import type`), porque o primeiro
 * `import { criarClienteServidor } from "@/lib/supabase/server"` derruba o processo com
 * ERR_MODULE_NOT_FOUND ("Cannot find package '@/lib'"). Foi por isso que o degrau de colunas do
 * board viveu meses sem uma única execução coberta: não era falta de vontade, era falta de
 * resolvedor.
 *
 * O hook faz três coisas e só três:
 *   1. `@/x` → `<raiz>/x`  (o mesmo alias do tsconfig.json / next);
 *   2. tenta `.ts` quando o caminho sem extensão não existe (imports internos do repo);
 *   3. tenta `.js` quando o pacote não publica o subcaminho sem extensão (`next/navigation`).
 *
 * Ele NÃO stuba nada e NÃO troca implementação: o módulo que o teste importa é o mesmo que o
 * Next importa. Quem quiser evitar o cliente real injeta o cliente pelo parâmetro — que é
 * exatamente o conserto que este hook tornou testável.
 *
 * A raiz vem do próprio arquivo (`import.meta.url`), NÃO de `process.cwd()`: o `npm test` pode
 * ser chamado de qualquer diretório e o alias tem de continuar apontando para o repo.
 */
const RAIZ = new URL("../../", import.meta.url).href;

export async function resolve(especificador, contexto, proximo) {
  const alvo = especificador.startsWith("@/") ? RAIZ + especificador.slice(2) : especificador;
  for (const tentativa of [alvo, `${alvo}.ts`, `${alvo}.js`]) {
    try {
      return await proximo(tentativa, contexto);
    } catch {
      // segue para a próxima tentativa; o erro real é relançado abaixo
    }
  }
  return await proximo(alvo, contexto); // deixa o erro original subir com a mensagem do node
}
