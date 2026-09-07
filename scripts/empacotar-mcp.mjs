#!/usr/bin/env node
/**
 * Empacota o servidor MCP de marketing em UM arquivo — `dist-mcp/me-escuta-mcp.mjs`.
 *
 * POR QUE UM ARQUIVO SÓ: quem vai rodar isto é o Fernando, que é de marketing e não de código.
 * Clonar repositório, instalar dependência e manter isso atualizado é atrito que ele não tem por
 * que pagar. Node ele já tem — é requisito do Claude Code. Então entregamos um arquivo e uma
 * linha de configuração.
 *
 * Medido em 07/09/2026: não existe precedente de artefato distribuível nos repos (sem `bin`, sem
 * `npm publish`, sem release; o único distribuível é imagem Docker). Este é o primeiro, e por
 * isso o formato é o mais simples que funciona.
 *
 * A URL e a `anon key` são EMBUTIDAS aqui, lidas de `.env.local`. Elas não são segredo: são as
 * mesmas que o navegador já baixa no bundle do site. O que continua sendo segredo é a senha, e
 * ela não entra no pacote — vem da configuração do MCP na máquina de quem usa.
 */
import { build } from "esbuild";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Lê `.env.local` sem depender de dotenv (que o repo não tem). */
function lerEnvLocal() {
  const mapa = new Map();
  let bruto;
  try {
    bruto = readFileSync(resolve(raiz, ".env.local"), "utf8");
  } catch {
    return mapa;
  }
  for (const linha of bruto.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (m) mapa.set(m[1], m[2].replace(/^["']|["']$/g, ""));
  }
  return mapa;
}

const env = lerEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.get("NEXT_PUBLIC_SUPABASE_URL") ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? "";

// Falhar aqui é melhor que entregar um pacote que só quebra na máquina do Fernando.
if (!url || !anon) {
  console.error(
    "empacotar-mcp: faltou NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY.\n" +
      "Eles vêm do .env.local deste repo (ou do ambiente). Sem eles o pacote sai sem saber com qual banco falar.",
  );
  process.exit(1);
}

mkdirSync(resolve(raiz, "dist-mcp"), { recursive: true });

await build({
  entryPoints: [resolve(raiz, "mcp/servidor.ts")],
  outfile: resolve(raiz, "dist-mcp/me-escuta-mcp.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // O alias `@/` do tsconfig; o esbuild não lê `paths` sozinho.
  alias: { "@": raiz },
  define: {
    "process.env.ME_ESCUTA_URL_EMBUTIDA": JSON.stringify(url),
    "process.env.ME_ESCUTA_ANON_EMBUTIDA": JSON.stringify(anon),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  // `import.meta.url` existe em ESM; alguns pacotes checam `require` — o shim evita o erro.
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __criarRequire } from 'node:module';",
      "const require = __criarRequire(import.meta.url);",
    ].join("\n"),
  },
  legalComments: "none",
  logLevel: "info",
});

console.log("\nPronto: dist-mcp/me-escuta-mcp.mjs");
console.log("Entregue ESSE arquivo. A senha não está nele — vem da configuração do MCP.");
