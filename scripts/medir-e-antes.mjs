/*
 * R23 · Trilha E — MEDIÇÃO "ANTES" (read-only, produção).
 * Mede o que o painel e a busca do funil custam HOJE, antes de qualquer mudança.
 * SÓ SELECT. Nunca escreve. Uso: node scripts/medir-e-antes.mjs
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
if (!url) { console.error("DATABASE_URL ausente em .env.local"); process.exit(1); }

const AMOSTRAS = Number(process.env.AMOSTRAS ?? 7);
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const resultados = [];
async function medir(c, nome, sql, params = []) {
  const tempos = [];
  let bytes = 0, linhas = 0;
  for (let i = 0; i < AMOSTRAS; i++) {
    const t0 = performance.now();
    const r = await c.query(sql, params);
    tempos.push(performance.now() - t0);
    if (i === 0) { linhas = r.rowCount ?? 0; bytes = Buffer.byteLength(JSON.stringify(r.rows)); }
  }
  const med = mediana(tempos);
  resultados.push({ nome, med, linhas, bytes });
  console.log(
    `${nome.padEnd(52)} mediana=${med.toFixed(0).padStart(5)}ms  linhas=${String(linhas).padStart(5)}  ~${(bytes / 1024).toFixed(1)}KB`,
  );
  return { med, linhas, bytes };
}

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const t0 = performance.now();
await c.connect();
console.log(`conexao TCP+TLS+auth ao pooler: ${(performance.now() - t0).toFixed(0)}ms\n`);
await medir(c, "RTT base (select 1)", "select 1");

const COLS_CARD = "lead_id,nome,telefone,etapa,entrou_etapa_em,valor,origem,dono,dono_id,dono_nome,tags,kommo_lead_id";

// chaves da config vigente, do jeito que chavesDoBoard() monta hoje (TODAS as etapas)
const { rows: cfg } = await c.query(
  "select jsonb_array_elements(payload->'etapas') as e from core.v_config_vigente where nome='funil_vendas'",
);
const etapas = cfg.map((r) => r.e);
const chavesTodas = etapas.map((e) => e.chave);
const chavesBoard = etapas.filter((e) => e.no_board !== true).map((e) => e.chave);
console.log(`\nconfig funil_vendas: ${chavesTodas.length} etapas; ${chavesBoard.length} sem no_board`);

console.log("\n── /funil · leitura do board (lerCardsReais) ──");
await medir(c, "board HOJE (chavesDoBoard = TODAS as etapas)",
  `select ${COLS_CARD} from core.v_lead_card where etapa = any($1) order by entrou_etapa_em desc nulls last, lead_id asc limit 2000`,
  [chavesTodas]);
await medir(c, "board SEM arquivado (intencao documentada)",
  `select ${COLS_CARD} from core.v_lead_card where etapa = any($1) order by entrou_etapa_em desc nulls last, lead_id asc limit 2000`,
  [chavesBoard]);

console.log("\n── busca no SERVIDOR: o que ela custaria ──");
for (const termo of ["maria", "silva", "99", "joao"]) {
  await medir(c, `busca servidor ILIKE '%${termo}%' (nome+telefone, limit 50)`,
    `select ${COLS_CARD} from core.v_lead_card
       where (nome ilike $1 or telefone ilike $1
              or ($2 <> '' and regexp_replace(coalesce(telefone,''), '[^0-9]', '', 'g') like '%' || $2 || '%'))
       order by entrou_etapa_em desc nulls last, lead_id asc limit 50`,
    [`%${termo}%`, (termo.replace(/[^0-9]/g,"").length >= 3 ? termo.replace(/[^0-9]/g,"") : "")]);
}

console.log("\n── /  · painel (lerDashboard) ──");
await medir(c, "painel: contagem por etapa (leitura larga F24a)",
  "select etapa from core.v_lead_card limit 5001");
await medir(c, "painel: mensagens 7d (leitura larga F24a)",
  "select direcao,criado_em from core.mensagem where criado_em >= now()-interval '7 days' limit 20001");
await medir(c, "painel: entrega (status_entrega das saidas)",
  "select status_entrega from core.mensagem where direcao='saida' and status_entrega in ('enviado','entregue','lido','falhou') limit 20001");
await medir(c, "painel: sugestoes pendentes (agente,criado_em)",
  "select agente,criado_em from core.sugestao_ia where status='pendente' limit 2001");
await medir(c, "painel: ultimo evento",
  "select criado_em from core.evento order by criado_em desc limit 1");

console.log("\n── o que AINDA NAO EXISTE no painel (fontes) ──");
await medir(c, "precisao por agente: sugestao_ia agrupada",
  "select agente, status, count(*) from core.sugestao_ia group by 1,2");
await medir(c, "saude do fluxo: ops.ingestao_log agrupado",
  "select resultado, count(*) from ops.ingestao_log group by 1");

console.log("\n=== RESUMO ===");
const soma = resultados.slice(1).reduce((s, r) => s + r.med, 0);
console.log(`${resultados.length - 1} medicoes; soma das medianas = ${soma.toFixed(0)}ms`);
await c.end();
