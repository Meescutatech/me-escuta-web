// portao-resolver.mjs — deixa os PORTÕES importarem os módulos REAIS de lib/ fora do Next.
//
// Um portão que reimplementa a consulta não testa o produto: testa a cópia. Para importar o
// código de verdade faltam duas coisas que o Next resolve sozinho e o node não:
//   1. o alias `@/` → raiz do repo (tsconfig paths);
//   2. import sem extensão (`./ficha-calculos`), que o TypeScript aceita e o ESM do node não.
//
// `module.registerHooks` é síncrono e in-thread (Node >= 22.15), então basta importar este
// arquivo ANTES do primeiro import dinâmico do código de produção.
//
// Não stuba nada além disso: `next/headers` resolve normalmente de node_modules, e o
// `criarClienteServidor()` que depende dele nunca chega a ser chamado porque os portões INJETAM
// um cliente (autenticado de verdade, ou o falso que conta chamadas). Se algum caminho esquecer
// de receber o cliente e cair no default, o erro do `cookies()` fora de requisição estoura — que
// é o comportamento certo: falha barulhenta, não portão verde por engano.

import { registerHooks } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSOES = [".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];

/** Caminho que existe em disco para um arquivo escrito sem extensão (estilo TypeScript). */
function comExtensao(caminho) {
  if (existsSync(caminho) && !caminho.endsWith("/")) return caminho;
  for (const ext of EXTENSOES) {
    if (existsSync(caminho + ext)) return caminho + ext;
  }
  return null;
}

registerHooks({
  resolve(especificador, contexto, seguinte) {
    if (especificador.startsWith("@/")) {
      const achado = comExtensao(resolve(raiz, especificador.slice(2)));
      if (achado) return { url: pathToFileURL(achado).href, shortCircuit: true };
    }
    try {
      return seguinte(especificador, contexto);
    } catch (erro) {
      // relativo sem extensão: só o node reclama — o tsc e o Next aceitam
      if (especificador.startsWith(".") && contexto.parentURL) {
        const base = resolve(dirname(fileURLToPath(contexto.parentURL)), especificador);
        const achado = comExtensao(base);
        if (achado) return { url: pathToFileURL(achado).href, shortCircuit: true };
      }
      // subcaminho de pacote sem extensão (`next/headers`): o bundler do Next resolve, o ESM não
      if (!especificador.startsWith(".") && !especificador.startsWith("@/")) {
        try {
          return seguinte(`${especificador}.js`, contexto);
        } catch {
          /* segue o erro original, que é o informativo */
        }
      }
      throw erro;
    }
  },
});
