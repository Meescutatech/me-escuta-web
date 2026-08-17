/*
 * PORTÃO R23 · Trilha E — a busca acha lead que NÃO está na página carregada.
 *
 * SÓ SELECT contra produção. Nunca escreve. Uso: node scripts/portao-r23-e-busca.mjs
 *
 * O teste unitário prova o PLANO (que a consulta não filtra por etapa). Este portão prova o FATO:
 * pega um lead que o board deixou de carregar, digita o nome dele, e verifica que a busca o
 * devolve. Mock nenhum consegue afirmar isso — só o banco.
 *
 * Mede também o ANTES × DEPOIS do board, porque o conserto tem dois lados: a busca passa a achar
 * mais, e o board passa a carregar menos.
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
const COLS = "lead_id,nome,telefone,etapa,entrou_etapa_em,valor,origem,dono,dono_id,dono_nome,tags,kommo_lead_id";

let falhas = 0;
function conferir(nome, condicao, detalhe = "") {
  const marca = condicao ? "  ok  " : " FALHA";
  if (!condicao) falhas++;
  console.log(`${marca}  ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
}

async function medir(c, sql, params = []) {
  const tempos = [];
  let r;
  for (let i = 0; i < AMOSTRAS; i++) {
    const t0 = performance.now();
    r = await c.query(sql, params);
    tempos.push(performance.now() - t0);
  }
  return { ms: mediana(tempos), linhas: r.rowCount ?? 0, bytes: Buffer.byteLength(JSON.stringify(r.rows)), rows: r.rows };
}

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

// ── a config vigente, como o app a lê ──
const { rows: cfg } = await c.query(
  "select jsonb_array_elements(payload->'etapas') as e from core.v_config_vigente where nome='funil_vendas'",
);
const etapas = cfg.map((r) => r.e);
const chavesAntes = etapas.map((e) => e.chave);                                        // .map — o código antigo
const chavesDepois = etapas.filter((e) => e.no_board !== true && e.tipo !== "arquivado").map((e) => e.chave);

console.log(`\nconfig funil_vendas vigente: ${chavesAntes.length} etapas · ${chavesDepois.length} de trabalho`);
conferir("a config REALMENTE tem etapa no_board", chavesAntes.length > chavesDepois.length,
  `fora do board: ${chavesAntes.filter((k) => !chavesDepois.includes(k)).join(", ")}`);

// ── 1. o board: ANTES × DEPOIS ──
console.log("\n── 1 · leitura do board ──");
const SQL_BOARD = `select ${COLS} from core.v_lead_card where etapa = any($1)
   order by entrou_etapa_em desc nulls last, lead_id asc limit 2000`;
const antes = await medir(c, SQL_BOARD, [chavesAntes]);
const depois = await medir(c, SQL_BOARD, [chavesDepois]);
console.log(`  ANTES   ${String(antes.linhas).padStart(4)} cards  ${(antes.bytes / 1024).toFixed(1).padStart(6)} KB  ${antes.ms.toFixed(0).padStart(4)} ms`);
console.log(`  DEPOIS  ${String(depois.linhas).padStart(4)} cards  ${(depois.bytes / 1024).toFixed(1).padStart(6)} KB  ${depois.ms.toFixed(0).padStart(4)} ms`);
console.log(`  queda de payload: ${(100 - (depois.bytes / antes.bytes) * 100).toFixed(1)}%`);
conferir("o board DEPOIS carrega menos que ANTES", depois.linhas < antes.linhas,
  `${antes.linhas} → ${depois.linhas} cards`);

// ── 2. a prova: um lead FORA do board, achado pela busca ──
console.log("\n── 2 · a busca acha o que o board não carrega ──");
const idsBoard = new Set(depois.rows.map((r) => r.lead_id));

// escolhe uma cobaia real: um lead com nome que NÃO está entre os cards carregados
const { rows: cobaias } = await c.query(
  `select lead_id, nome, etapa from core.v_lead_card
    where nome is not null and length(nome) >= 6 and not (etapa = any($1))
    order by nome limit 3`,
  [chavesDepois],
);
conferir("existe lead fora do board para servir de prova", cobaias.length > 0);

const SQL_BUSCA = `select ${COLS} from core.v_lead_card
   where (nome ilike $1 or telefone ilike $1)
   order by entrou_etapa_em desc nulls last, lead_id asc limit 51`;

for (const cobaia of cobaias) {
  const termo = cobaia.nome.split(/\s+/)[0]; // o primeiro nome, como um humano digitaria
  const r = await medir(c, SQL_BUSCA, [`%${termo}%`]);
  const achou = r.rows.some((x) => x.lead_id === cobaia.lead_id);
  const foraDoBoard = r.rows.filter((x) => !idsBoard.has(x.lead_id));
  console.log(
    `\n  "${termo}" → ${r.linhas} achados (${foraDoBoard.length} fora do board) em ${r.ms.toFixed(0)} ms`,
  );
  console.log(`     cobaia: ${cobaia.nome} · etapa ${cobaia.etapa} · ${cobaia.lead_id}`);
  conferir(`a busca acha "${cobaia.nome}"`, achou);
  conferir(`e ele NÃO está no board carregado`, !idsBoard.has(cobaia.lead_id));
}

// ── 3. o filtro do cliente NÃO acharia — é o contrafactual que dá sentido ao conserto ──
console.log("\n── 3 · o filtro do cliente sozinho (o comportamento antigo) ──");
{
  const cobaia = cobaias[0];
  const termo = cobaia.nome.split(/\s+/)[0].toLowerCase();
  // exatamente o que `buscaCasa` faz, sobre exatamente o que o board carregou
  const acharia = depois.rows.filter(
    (x) => (x.nome ?? "").toLowerCase().includes(termo) || (x.telefone ?? "").includes(termo),
  );
  console.log(`  filtrando "${termo}" sobre os ${depois.linhas} cards do board: ${acharia.length} achados`);
  conferir("o filtro do cliente NÃO acha a cobaia — só o servidor acha",
    !acharia.some((x) => x.lead_id === cobaia.lead_id));
}

// ── 4. teto da busca ──
console.log("\n── 4 · teto e truncamento ──");
{
  const r = await medir(c, SQL_BUSCA, ["%a%"]); // casa quase tudo: força o teto
  conferir("busca larga bate no teto+1 (51) e a UI saberá pedir refino", r.linhas === 51,
    `voltaram ${r.linhas} linhas`);
  console.log(`  busca larga: ${r.ms.toFixed(0)} ms · ${(r.bytes / 1024).toFixed(1)} KB`);
}

// ── 5. saúde do fluxo: a fonte e o alcance ──
console.log("\n── 5 · saúde do fluxo (RF-15.4) ──");
{
  const { rows } = await c.query("select * from ops.v_saude_fluxo");
  const colunas = Object.keys(rows[0] ?? {});
  const esperadas = [
    "eventos_ultimo_minuto", "eventos_ultima_hora", "duplicados_rejeitados_ultima_hora",
    "falhas_ultima_hora", "lag_fila_eventos", "idade_fila_eventos_seg", "lag_fila_saida",
    "idade_fila_saida_seg", "envios_falhados_24h", "ultima_ingestao_whatsapp",
  ];
  const faltando = esperadas.filter((k) => !colunas.includes(k));
  conferir("ops.v_saude_fluxo tem todas as colunas que o painel mapeia", faltando.length === 0,
    faltando.length ? `faltam: ${faltando.join(", ")}` : `${colunas.length} colunas`);

  const { rows: exposto } = await c.query(
    "select 1 from information_schema.tables where table_schema='core' and table_name='v_saude_fluxo'",
  );
  console.log(`  core.v_saude_fluxo (migration 0180) aplicada neste banco: ${exposto.length > 0 ? "SIM" : "NÃO"}`);
  if (exposto.length === 0) {
    console.log("     → esperado: a 0180 não foi aplicada (produção só com GO do Diogo).");
    console.log("       Enquanto isso o painel mostra 'não medido', não zeros.");
  }
}

// ── 6. precisão por agente: o número de hoje, direto do ledger ──
console.log("\n── 6 · precisão por agente (RF-15.3), conferida no ledger ──");
{
  const { rows } = await c.query(`
    select agente,
           count(*) filter (where status='aprovada')  as aprovadas,
           count(*) filter (where status='corrigida') as corrigidas,
           count(*) filter (where status='rejeitada') as rejeitadas,
           count(*) filter (where status in ('aprovada','corrigida','rejeitada')) as decididas,
           count(*) filter (where status='pendente')  as pendentes
      from core.sugestao_ia group by 1 order by 1`);
  let tA = 0, tD = 0;
  for (const r of rows) {
    const d = Number(r.decididas), a = Number(r.aprovadas);
    tA += a; tD += d;
    const pct = d > 0 ? ((a / d) * 100).toFixed(1) + "%" : "—";
    console.log(`  ${r.agente.padEnd(10)} ${a}/${r.corrigidas}/${r.rejeitadas}  decididas=${String(d).padStart(2)}  pendentes=${String(r.pendentes).padStart(3)}  precisão=${pct}`);
  }
  console.log(`  ${"GERAL".padEnd(10)} ${tA} de ${tD} decididas → ${tD > 0 ? ((tA / tD) * 100).toFixed(1) + "%" : "—"}`);
  const { rows: [chk] } = await c.query(
    "select count(*) filter (where payload_aprovado is not null) as com_payload, count(*) as total from core.sugestao_ia");
  conferir("'sem correção' vem do STATUS (payload_aprovado nunca é preenchido)",
    Number(chk.com_payload) === 0, `${chk.com_payload} de ${chk.total} linhas com payload_aprovado`);
}

console.log(`\n=== ${falhas === 0 ? "PORTÃO VERDE" : `PORTÃO VERMELHO — ${falhas} falha(s)`} ===`);
await c.end();
process.exit(falhas === 0 ? 0 : 1);
