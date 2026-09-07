#!/usr/bin/env node
/**
 * PROVA do servidor MCP de marketing — sobe o pacote de verdade e confere o que ele responde.
 *
 * Não é teste de unidade: é o ponta a ponta. Sobe `dist-mcp/me-escuta-mcp.mjs` como um cliente
 * MCP real (stdio), lista as ferramentas, chama as principais, e depois **confere o número por
 * um caminho independente** — uma consulta crua ao PostgREST com as mesmas credenciais.
 *
 * ⭐ POR QUE A CONFERÊNCIA É CONTRA SQL CRU, e não contra `lerMarketingCom`: o MCP CHAMA
 * `lerMarketingCom`. Comparar os dois provaria que `a === a`. O que pode dar errado de verdade é
 * o RECORTE — a ferramenta somar a coluna errada, ou o período escorregar um dia. Só uma
 * segunda contagem, feita por fora, pega isso.
 *
 * Uso:
 *   ME_ESCUTA_EMAIL=... ME_ESCUTA_SENHA=... node scripts/prova-mcp.mjs
 *
 * Sai com rc≠0 quando alguma conferência falha — o contrato é o código de saída.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACOTE = resolve(raiz, "dist-mcp/me-escuta-mcp.mjs");

function envLocal(chave) {
  try {
    const m = new RegExp(`^\\s*${chave}\\s*=\\s*(.*)$`, "m").exec(readFileSync(resolve(raiz, ".env.local"), "utf8"));
    return m ? m[1].replace(/^["']|["']$/g, "").trim() : "";
  } catch {
    return "";
  }
}

const EMAIL = process.env.ME_ESCUTA_EMAIL ?? "";
const SENHA = process.env.ME_ESCUTA_SENHA ?? "";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || envLocal("NEXT_PUBLIC_SUPABASE_URL");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || envLocal("NEXT_PUBLIC_SUPABASE_ANON_KEY");

if (!EMAIL || !SENHA) {
  console.error("prova-mcp: defina ME_ESCUTA_EMAIL e ME_ESCUTA_SENHA no ambiente.");
  process.exit(2);
}

const falhas = [];
function confere(condicao, oQue) {
  console.log(`${condicao ? "  ok  " : "FALHA "} ${oQue}`);
  if (!condicao) falhas.push(oQue);
}

/** Período fixo e largo o bastante para conter toda a série de hoje. */
const DE = "2026-08-01";
const ATE = "2026-09-07";

console.log(`\n=== PROVA DO MCP · período ${DE} a ${ATE} · usuário ${EMAIL} ===\n`);

// ─────────────────── 1. o MCP, como o Claude Code o vê ───────────────────
const transporte = new StdioClientTransport({
  command: process.execPath,
  args: [PACOTE],
  env: { ...process.env, ME_ESCUTA_EMAIL: EMAIL, ME_ESCUTA_SENHA: SENHA },
  stderr: "pipe",
});
const cliente = new Client({ name: "prova", version: "1.0.0" });
await cliente.connect(transporte);

const { tools } = await cliente.listTools();
console.log(`[1] ferramentas expostas: ${tools.length}`);
for (const t of tools) console.log(`      · ${t.name}`);
const esperadas = [
  "marketing_visao_geral",
  "marketing_origem",
  "marketing_campanhas",
  "marketing_funil",
  "marketing_serie",
  "marketing_cobertura",
  "marketing_lead",
];
confere(
  esperadas.every((n) => tools.some((t) => t.name === n)),
  "as sete ferramentas estão registradas",
);

async function chamar(nome, args) {
  const r = await cliente.callTool({ name: nome, arguments: args });
  return r.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
}

console.log("\n[2] marketing_visao_geral");
const visaoTexto = await chamar("marketing_visao_geral", { de: DE, ate: ATE });
console.log(visaoTexto.split("\n").map((l) => `      ${l}`).join("\n"));

// ─────────────────── 2. a contagem independente ───────────────────
const sb = createClient(URL, ANON, { auth: { persistSession: false } });
const { error: erroLogin } = await sb.auth.signInWithPassword({ email: EMAIL, password: SENHA });
if (erroLogin) {
  console.error(`prova-mcp: não consegui logar para a conferência: ${erroLogin.message}`);
  process.exit(2);
}

const iniIso = `${DE}T00:00:00-03:00`;
// `ate` é inclusivo na ferramenta, então o fim exclusivo é o dia seguinte.
const fimIso = `${new Date(`${ATE}T12:00:00Z`).toISOString().slice(0, 10).replace(/\d{2}$/, (d) => String(Number(d) + 1).padStart(2, "0"))}T00:00:00-03:00`;

const { data: cru, error: erroCru } = await sb
  .schema("core")
  .from("captacao")
  .select("lead_id")
  .gte("capturado_em", iniIso)
  .lt("capturado_em", fimIso);

if (erroCru) {
  console.error(`prova-mcp: consulta de conferência falhou: ${erroCru.message}`);
  process.exit(2);
}
const leadsDistintos = new Set(cru.map((r) => r.lead_id)).size;
console.log(`\n[3] conferência independente: ${cru.length} toques · ${leadsDistintos} leads distintos`);

const casado = new RegExp(`Leads no período\\.+ ${leadsDistintos.toLocaleString("pt-BR")}\\b`).test(visaoTexto);
confere(casado, `o MCP reporta os mesmos ${leadsDistintos} leads que a contagem crua`);

// ─────────────────── 3. as demais ferramentas respondem ───────────────────
console.log("\n[4] cobertura");
const cobertura = await chamar("marketing_cobertura", { de: DE, ate: ATE });
console.log(cobertura.split("\n").map((l) => `      ${l}`).join("\n"));
confere(/Com campanha identificada/.test(cobertura), "a cobertura responde o requisito D1");

console.log("\n[5] campanhas · funil · série");
for (const nome of ["marketing_campanhas", "marketing_funil", "marketing_serie"]) {
  const t = await chamar(nome, { de: DE, ate: ATE });
  confere(t.length > 0 && /Período:/.test(t), `${nome} respondeu com cabeçalho de estado`);
}

// ─────────────────── 4. o negativo: sem sessão, a RLS recusa ───────────────────
console.log("\n[6] negativo — cliente ANÔNIMO (sem login) contra core.captacao");
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: dAnon, error: eAnon } = await anon.schema("core").from("captacao").select("id").limit(1);
console.log(`      erro=${eAnon ? eAnon.message : "(nenhum)"} · linhas=${dAnon ? dAnon.length : 0}`);
confere(Boolean(eAnon) || (dAnon ?? []).length === 0, "sem sessão, core.captacao não devolve nada");

await cliente.close();

console.log(`\n=== ${falhas.length === 0 ? "TUDO VERDE" : `${falhas.length} FALHA(S)`} ===`);
for (const f of falhas) console.log(`  · ${f}`);
process.exit(falhas.length === 0 ? 0 : 1);
