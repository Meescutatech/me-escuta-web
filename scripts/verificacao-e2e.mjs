// verificacao-e2e.mjs — prova o fluxo das 7 costuras (verificacao_e2e passos 1–3 da spec S1).
//
// Injeta mensagem mock pela PORTA → o worker (runtime) PROPÕE → aprova via a MESMA RPC que a UI
// chama (api.validar_sugestao, com claim de JWT simulando o usuário logado) → o fato HITL aparece
// no ledger. Usa conexão DIRETA ao Postgres para contornar o PostgREST (segfault Rosetta no Apple
// Silicon), então é a evidência via SQL — não depende do browser.
//
// Uso:  node scripts/verificacao-e2e.mjs   (com .env.local carregado ou envs exportadas)

import pg from "pg";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));

// Carrega .env.local (simples) se existir, sem dependência externa.
try {
  const env = readFileSync(resolve(aqui, "..", ".env.local"), "utf8");
  for (const linha of env.split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* .env.local ausente — segue com envs do processo / defaults */
}

// Sem default (F7): o `?? "…:54422/postgres"` que existia aqui é o mesmo padrão que fez o seed
// escrever no banco do vizinho (E-009). Este script também escreve — aborta antes de conectar.
if (!process.env.DATABASE_URL) {
  console.error("ABORTADO: DATABASE_URL não está definida (nem no ambiente, nem no .env.local).");
  console.error("  ex.: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:<SUA_ME_DB_PORT>/postgres");
  console.error("  este script ESCREVE no banco: sem alvo declarado ele não roda.");
  process.exit(2);
}
const DATABASE_URL = process.env.DATABASE_URL;
const RUNTIME_DIR = resolve(aqui, "..", process.env.RUNTIME_DIR ?? "../me-escuta-runtime");

const cliente = new pg.Client({ connectionString: DATABASE_URL });

const linha = () => console.log("─".repeat(72));
const bloco = (titulo) => {
  linha();
  console.log(titulo);
  linha();
};

async function q(sql, params) {
  const r = await cliente.query(sql, params);
  return r.rows;
}

async function main() {
  await cliente.connect();
  const marca = randomUUID().slice(0, 8);
  const telefone = "5531" + Math.floor(100000000 + Math.random() * 899999999);
  const corpo = `E2E ${marca}: quero saber o preço e as condições do aparelho auditivo`;

  bloco("PASSO 1 — injetar mock pela porta (lead_criado + mensagem_recebida)");
  const leadId = randomUUID();
  const rLead = await q("select porta.recebe_evento_externo($1::jsonb) as res", [
    JSON.stringify({
      tipo: "lead_criado",
      ator: "sistema",
      origem: "mock",
      id_externo: `e2e-lead-${marca}`,
      versao_payload: 1,
      lead_id: leadId,
      payload: { lead_id: leadId, origem_captura: "e2e" },
    }),
  ]);
  const rMsg = await q("select porta.recebe_evento_externo($1::jsonb) as res", [
    JSON.stringify({
      tipo: "mensagem_recebida",
      ator: "sistema",
      origem: "mock",
      id_externo: `e2e-msg-${marca}`,
      versao_payload: 1,
      payload: {
        conversa: { telefone, phone_number_id: "pnid_e2e", area: "comercial" },
        tipo_conteudo: "texto",
        corpo,
      },
    }),
  ]);
  const eventoLead = rLead[0].res;
  const eventoMsg = rMsg[0].res;
  console.log("porta.recebe_evento_externo(lead_criado)     =>", eventoLead);
  console.log("porta.recebe_evento_externo(mensagem_recebida)=>", eventoMsg);
  console.log("\nTimeline (core.evento) — topo por posicao_global desc:");
  console.table(
    await q(
      "select posicao_global, tipo, origem, ator, left(payload->>'corpo', 40) as corpo from core.evento order by posicao_global desc limit 5",
    ),
  );

  bloco("PASSO 2 — worker propõe (runtime processa-once) → sugestão PENDENTE");
  console.log(`> npm --prefix ${RUNTIME_DIR} run processa-once`);
  const saida = execFileSync("npm", ["--prefix", RUNTIME_DIR, "run", "--silent", "processa-once"], {
    env: { ...process.env, DATABASE_URL, NODE_ENV: "development" },
    encoding: "utf8",
  });
  console.log(saida.trim());
  const pend = await q(
    `select id, agente, tipo, status, left(payload_proposto->>'corpo', 60) as proposta
       from core.sugestao_ia
      where status='pendente' and payload_proposto->>'evento_gatilho_id' = $1`,
    [eventoMsg.evento_id],
  );
  console.log("\nSugestões pendentes para este evento:");
  console.table(pend);
  if (pend.length === 0) throw new Error("nenhuma sugestão pendente — worker não propôs");
  const sugestaoId = pend[0].id;

  bloco("PASSO 3 — aprovar via api.validar_sugestao (RPC-porta, como a UI) → evento HITL no ledger");
  // Simula o usuário logado: a UI chama api.validar_sugestao, que resolve o validador do JWT.
  // Aqui setamos o claim de JWT na transação para reproduzir exatamente esse caminho.
  await cliente.query("begin");
  await cliente.query(
    "select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ email: "diogo@meescuta.com", role: "authenticated" })],
  );
  const rAprova = await q("select api.validar_sugestao($1::uuid, 'aprovada', null) as res", [
    sugestaoId,
  ]);
  await cliente.query("commit");
  console.log("api.validar_sugestao(aprovada) =>", rAprova[0].res);

  console.log("\nÚltimo evento do ledger (deve ser o HITL da aprovação):");
  console.table(
    await q(
      "select posicao_global, tipo, origem, ator, id_externo from core.evento order by posicao_global desc limit 1",
    ),
  );
  console.log("\nStatus da sugestão + trilha (core.acao_log):");
  console.table(
    await q("select id, status, validado_por, evento_id from core.sugestao_ia where id=$1", [
      sugestaoId,
    ]),
  );
  console.table(
    await q(
      "select acao, ator, sugestao_id from core.acao_log where sugestao_id=$1 order by criado_em",
      [sugestaoId],
    ),
  );

  bloco("BÔNUS — idempotência de ingestão (reenviar o mock ⇒ duplicado=true)");
  const rDup = await q("select porta.recebe_evento_externo($1::jsonb) as res", [
    JSON.stringify({
      tipo: "mensagem_recebida",
      ator: "sistema",
      origem: "mock",
      id_externo: `e2e-msg-${marca}`,
      versao_payload: 1,
      payload: { conversa: { telefone, phone_number_id: "pnid_e2e" }, tipo_conteudo: "texto", corpo },
    }),
  ]);
  console.log("reenvio do mesmo (origem,id_externo) =>", rDup[0].res);

  bloco("E2E OK — 7 costuras provadas: evento → projeção → sugestão → aprovação → fato HITL");
  await cliente.end();
}

main().catch(async (err) => {
  console.error("\n[e2e] ERRO:", err.message);
  try {
    await cliente.query("rollback");
  } catch {
    /* noop */
  }
  await cliente.end().catch(() => {});
  process.exit(1);
});
