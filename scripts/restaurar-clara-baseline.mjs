#!/usr/bin/env node
/**
 * PREP DE DEMO — restaura a Clara para o BASELINE v10 (prompt verbatim do n8n, o "antes" que o
 * Rodolfo reconhece). Event-sourced: NÃO digita no estado — re-propõe o texto v10 e aprova pela
 * porta, gerando um novo prompt_atualizado (o conteúdo volta a ser o v10; a versão anda pra frente).
 *
 * QUANDO RODAR: pouco antes da demo, SÓ SE o Rodolfo for rodar o @jarvis ao vivo (assim a destrava
 * v10→algo fica legível). Decisão do Orquestrador (16/07): manter v11 até lá; segurar isto pronto.
 *
 * COMO RODAR (na pasta me-escuta-web, com .env.local apontando pro me_escuta_crm):
 *   node scripts/restaurar-clara-baseline.mjs
 *   node scripts/restaurar-clara-baseline.mjs --dry   # só mostra o que faria, sem escrever
 *
 * O texto v10 vem do próprio ledger (evento prompt_atualizado com versao_anterior=10, campo
 * prompt_anterior) — fonte de verdade, nunca se perde. Se algum dia esse evento não existir, o
 * script aborta em vez de adivinhar.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const dry = process.argv.includes("--dry");

// lê DATABASE_URL do ambiente ou do .env.local (mesma convenção do verificacao-e2e.mjs)
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].trim();
  } catch {
    /* ignore */
  }
  throw new Error("DATABASE_URL não encontrado (env ou .env.local).");
}

const client = new pg.Client({ connectionString: databaseUrl() });
await client.connect();
try {
  // 1) texto do baseline v10 (do ledger)
  const base = await client.query(
    `select payload->>'prompt_anterior' as v10
       from core.evento
      where tipo='prompt_atualizado'
        and payload->>'agente_alvo'='clara'
        and payload->>'versao_anterior'='10'
      order by posicao_global
      limit 1`,
  );
  const v10 = base.rows[0]?.v10;
  if (!v10 || v10.length < 1000) {
    throw new Error("baseline v10 não encontrado/curto demais no ledger — abortando por segurança.");
  }

  // 2) versão vigente da Clara (optimistic lock)
  const cur = await client.query(`select prompt_versao, length(prompt_sistema) as tam from core.agente where id='clara'`);
  const versaoBase = cur.rows[0]?.prompt_versao;
  console.log(`Clara vigente: v${versaoBase} (${cur.rows[0]?.tam} chars). Baseline v10: ${v10.length} chars.`);

  if (dry) {
    console.log("[--dry] Não escreveu. Rodaria: propor(v10) + aprovar → Clara volta ao conteúdo v10 (versão anda pra frente).");
    process.exit(0);
  }

  if (String(v10) === String((await client.query(`select prompt_sistema from core.agente where id='clara'`)).rows[0]?.prompt_sistema)) {
    console.log("Clara já está com o conteúdo do baseline v10 — nada a fazer.");
    process.exit(0);
  }

  // 3) propõe o v10 (pela porta, atribuído ao sistema de restauração) + aprova
  const prop = await client.query(
    `select porta.propor_atualizacao_prompt('clara', $1, 'restaurar baseline n8n (v10) — prep de demo', 'sistema:restaurar-baseline', $2) as r`,
    [v10, versaoBase],
  );
  const sugestaoId = prop.rows[0].r.sugestao_id;
  const val = await client.query(
    `select porta.validar_sugestao($1, 'aprovada', null, 'sistema:restaurar-baseline') as r`,
    [sugestaoId],
  );
  const nova = val.rows[0].r.versao_nova;
  console.log(`OK — Clara restaurada ao conteúdo do baseline v10. Nova versão: v${nova} (conteúdo = v10). Evento prompt_atualizado no ledger.`);
} finally {
  await client.end();
}
