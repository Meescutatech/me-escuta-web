/*
 * MEDIÇÃO read-only da latência por query (Brasil → Supabase us-west-2, pooler 5432).
 * Espelha as queries reais de cada rota (lib/dados/*) como SQL, roda N amostras e reporta
 * mediana/p95 + bytes do resultado. SÓ SELECT — nunca escreve (regra de produção).
 *
 * Uso: node scripts/perf-medir-queries-prod.mjs   (lê DATABASE_URL do .env.local)
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const aqui = dirname(fileURLToPath(import.meta.url));
try {
  for (const l of readFileSync(resolve(aqui, "..", ".env.local"), "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }

const AMOSTRAS = Number(process.env.AMOSTRAS ?? 5);

const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

async function medir(c, nome, sql, params = []) {
  const tempos = [];
  let bytes = 0, linhas = 0;
  for (let i = 0; i < AMOSTRAS; i++) {
    const t0 = performance.now();
    const r = await c.query(sql, params);
    tempos.push(performance.now() - t0);
    if (i === 0) {
      linhas = r.rowCount ?? 0;
      bytes = Buffer.byteLength(JSON.stringify(r.rows));
    }
  }
  const med = mediana(tempos);
  console.log(
    `${nome.padEnd(42)} mediana=${med.toFixed(0).padStart(5)}ms  min=${Math.min(...tempos).toFixed(0).padStart(5)}ms  max=${Math.max(...tempos).toFixed(0).padStart(5)}ms  linhas=${String(linhas).padStart(5)}  ~${(bytes / 1024).toFixed(1)}KB`,
  );
  return { nome, med, linhas, bytes };
}

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const t0 = performance.now();
await c.connect();
console.log(`conexao TCP+TLS+auth ao pooler: ${(performance.now() - t0).toFixed(0)}ms\n`);

// RTT base
await medir(c, "RTT base (select 1)", "select 1");

console.log("\n── /timeline ──");
await medir(c, "evento (50 + payload)", "select id,posicao_global,lead_id,tipo,ator,origem,criado_em,payload from core.evento order by posicao_global desc limit 50");

console.log("\n── /fila ──");
await medir(c, "sugestao_ia pendentes (50)", "select id,agente,tipo,conversa_id,payload_proposto,status,criado_em from core.sugestao_ia where status='pendente' order by criado_em desc limit 50");

console.log("\n── /funil (cadeia serial: etapas → cards) ──");
const cfg = await medir(c, "v_config_vigente funil_vendas", "select payload from core.v_config_vigente where nome='funil_vendas'");
const etapas = (await c.query("select payload from core.v_config_vigente where nome='funil_vendas'")).rows[0]?.payload?.etapas ?? [];
const chaves = etapas.map((e) => e.chave);
await medir(c, "v_lead_card cards do board (teto 2000)", "select lead_id,nome,telefone,etapa,entrou_etapa_em,valor,origem,dono,tags,kommo_lead_id from core.v_lead_card where etapa = any($1) order by entrou_etapa_em desc nulls last, lead_id asc limit 2000", [chaves]);

console.log("\n── /conversas (cadeia serial: v_conversa → v_lead_card → config → mensagens-prévia; depois msgs+sugestões; depois painel) ──");
const convs = await medir(c, "1. v_conversa visivel_inbox (50)", "select id,telefone,lead_id,mode,dono_atual,status,atualizado_em from core.v_conversa where visivel_inbox order by atualizado_em desc nulls last limit 50");
const convRows = (await c.query("select id,lead_id from core.v_conversa where visivel_inbox order by atualizado_em desc nulls last limit 50")).rows;
const leadIds = convRows.map((r) => r.lead_id).filter(Boolean);
const convIds = convRows.map((r) => r.id);
await medir(c, "2. v_lead_card dos leads do inbox", "select lead_id,nome,etapa,valor,origem,entrou_etapa_em,tags,kommo_lead_id from core.v_lead_card where lead_id = any($1)", [leadIds]);
await medir(c, "3. v_config_vigente funil_vendas", "select payload from core.v_config_vigente where nome='funil_vendas'");
await medir(c, "4. mensagem prévia/não-lidas (limit 800)", "select conversa_id,direcao,corpo,criado_em from core.mensagem where conversa_id = any($1) order by criado_em desc limit 800", [convIds]);
const umaConv = convIds[0];
if (umaConv) {
  await medir(c, "5. mensagens da conversa (limit 500)", "select id,direcao,tipo_conteudo,corpo,criado_em,status_entrega,erro_codigo,autor,timestamp_origem,midia_caminho,midia_mime from core.mensagem where conversa_id=$1 order by criado_em asc, id asc limit 500", [umaConv]);
  await medir(c, "6. sugestao_ia da conversa", "select id,payload_proposto,criado_em,tipo,status,conversa_id from core.sugestao_ia where conversa_id=$1 and tipo='enviar_mensagem' and status='pendente' order by criado_em desc limit 10", [umaConv]);
}
const umLead = leadIds[0];
if (umLead) {
  await medir(c, "7. v_config_vigente ficha_lead", "select payload from core.v_config_vigente where nome='ficha_lead'");
  await medir(c, "8. lead_campo do lead", "select campo,valor from core.lead_campo where lead_id=$1 limit 500", [umLead]);
  await medir(c, "9. tarefa do lead", "select id,titulo,responsavel,prazo,status,resultado,criado_em,concluida_em from core.tarefa where lead_id=$1 order by criado_em desc limit 100", [umLead]);
  await medir(c, "10. anotacao do lead", "select id,autor,texto,criado_em from core.anotacao where lead_id=$1 order by criado_em desc limit 100", [umLead]);
}

console.log("\n── sidebar/layout (toda navegação com hard load + revalidate) ──");
await medir(c, "count v_lead_card etapas abertas", "select count(*) from core.v_lead_card where etapa = any($1)", [etapas.filter((e) => (e.tipo ?? "aberto") === "aberto").map((e) => e.chave)]);
console.log("(+ a cadeia 1-4 de /conversas inteira de novo, só pra contar não-lidas)");

console.log("\n── volumes de produção (contexto) ──");
for (const t of ["lead", "conversa", "mensagem", "evento", "sugestao_ia"]) {
  const { rows } = await c.query(`select count(*) n from core.${t}`);
  console.log(`  core.${t}: ${rows[0].n}`);
}

await c.end();
