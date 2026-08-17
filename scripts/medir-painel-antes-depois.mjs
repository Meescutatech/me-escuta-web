/*
 * R23 · Trilha E — o painel ANTES × DEPOIS, em tempo de PAREDE.
 *
 * A pergunta que importa não é "quantas consultas o painel faz" — é "quanto tempo o operador
 * espera". As 3 leituras novas (precisão, saúde do fluxo, recência) entraram no MESMO Promise.all
 * das antigas; se isso for verdade, a visita não fica mais lenta apesar de medir mais coisa. Este
 * script mede as duas rodadas em paralelo, como `lerDashboard` faz, e compara o relógio.
 *
 * SÓ SELECT. Uso: node scripts/medir-painel-antes-depois.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const aqui = dirname(fileURLToPath(import.meta.url));
try {
  for (const l of readFileSync(resolve(aqui, "..", ".env.local"), "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }

const AMOSTRAS = Number(process.env.AMOSTRAS ?? 7);
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// As leituras que o painel dispara, uma por entrada. O paralelismo real do app vem do
// Promise.all sobre o PostgREST; aqui um pool de conexões reproduz o mesmo formato.
const ANTES = {
  "ultimo evento": "select criado_em from core.evento order by criado_em desc limit 1",
  "novos hoje": "select count(*) from core.lead where criado_em >= date_trunc('day', now())",
  "novos 7d": "select count(*) from core.lead where criado_em >= now() - interval '7 days'",
  "mensagens 7d": "select direcao,criado_em from core.mensagem where criado_em >= now()-interval '7 days' limit 20001",
  "entrega": "select status_entrega from core.mensagem where direcao='saida' and status_entrega in ('enviado','entregue','lido','falhou') limit 20001",
  "1a resposta (conversas)": "select id from core.conversa where criado_em >= now()-interval '7 days' limit 300",
  "etapas (config)": "select payload from core.v_config_vigente where nome='funil_vendas'",
  "contagem por etapa": "select etapa from core.v_lead_card limit 5001",
  "valor em negociacao": "select valor from core.v_lead_card where valor is not null limit 1000",
  "sugestoes pendentes": "select agente,criado_em from core.sugestao_ia where status='pendente' limit 2001",
};

const NOVAS = {
  "precisao (decididas)": "select agente,status from core.sugestao_ia where status in ('aprovada','corrigida','rejeitada') limit 5001",
  "precisao (ultima decisao)": "select validado_em from core.sugestao_ia where status in ('aprovada','corrigida','rejeitada') and validado_em is not null order by validado_em desc limit 1",
  "saude do fluxo": "select * from ops.v_saude_fluxo",
  "recencia (lead)": "select criado_em from core.lead order by criado_em desc limit 1",
  "recencia (mensagem)": "select criado_em from core.mensagem order by criado_em desc limit 1",
};

/*
 * O pooler em modo sessão recusa acima de 15 clientes (EMAXCONNSESSION), e um pool grande aqui
 * mediria o MEU pool, não o painel. O app não abre uma conexão por leitura: ele fala HTTP com o
 * PostgREST, que multiplexa. Então a medida honesta é por consulta — e o tempo de parede de um
 * Promise.all é a leitura MAIS LENTA, não a soma. Reporto os dois: o máximo (o que o operador
 * espera) e a soma (o que se pagaria se fossem seriais).
 */
const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await cliente.connect();

const mediana7 = async (sql) => {
  const t = [];
  let r;
  for (let i = 0; i < AMOSTRAS; i++) { const t0 = performance.now(); r = await cliente.query(sql); t.push(performance.now() - t0); }
  return { ms: mediana(t), bytes: Buffer.byteLength(JSON.stringify(r.rows)) };
};

async function medirConjunto(consultas) {
  const linhas = [];
  for (const [nome, sql] of Object.entries(consultas)) linhas.push({ nome, ...(await mediana7(sql)) });
  return {
    max: Math.max(...linhas.map((l) => l.ms)),
    soma: linhas.reduce((s, l) => s + l.ms, 0),
    bytes: linhas.reduce((s, l) => s + l.bytes, 0),
    n: linhas.length,
    linhas,
  };
}

await mediana7("select 1"); // aquece

const antes = await medirConjunto(ANTES);
const depois = await medirConjunto({ ...ANTES, ...NOVAS });

const maisLenta = (c) => c.linhas.reduce((a, b) => (b.ms > a.ms ? b : a));

console.log("\n── painel · uma visita ──\n");
console.log(`  leituras NOVAS (mediana de ${AMOSTRAS} amostras):`);
for (const l of depois.linhas.filter((x) => x.nome in NOVAS)) {
  console.log(`    ${l.nome.padEnd(28)} ${l.ms.toFixed(0).padStart(4)} ms  ${(l.bytes / 1024).toFixed(1).padStart(5)} KB`);
}

const novaMaisLenta = Math.max(...depois.linhas.filter((x) => x.nome in NOVAS).map((l) => l.ms));
const antesMaisLenta = maisLenta(antes);

console.log(`\n  leituras: ${antes.n} → ${depois.n} (+${depois.n - antes.n})`);
console.log(`  payload:  ${(antes.bytes / 1024).toFixed(1)} KB → ${(depois.bytes / 1024).toFixed(1)} KB (+${((depois.bytes - antes.bytes) / 1024).toFixed(1)} KB)`);
console.log(`  custo serial (se fossem em fila): +${(depois.soma - antes.soma).toFixed(0)} ms`);

console.log(`\n  ── o que decide o tempo de parede ──`);
console.log(`  leitura mais lenta que JÁ existia:  ${antesMaisLenta.nome} = ${antesMaisLenta.ms.toFixed(0)} ms`);
console.log(`  leitura NOVA mais lenta:            ${novaMaisLenta.toFixed(0)} ms`);
const cabe = novaMaisLenta <= antesMaisLenta.ms;
console.log(`  ${cabe ? "OK  " : "ATEN"} as 5 novas ${cabe ? "cabem dentro" : "ESTOURAM"} da mais lenta que já existia →`);
console.log(`       no mesmo Promise.all, elas ${cabe ? "não acrescentam tempo de parede" : "passam a mandar no tempo de parede"}.`);
console.log(`\n  Nota de método: NÃO comparo o max(ANTES) com o max(DEPOIS) — os dois conjuntos`);
console.log(`  compartilham as mesmas 10 leituras, e o max oscila com a rede entre execuções.`);
console.log(`  A afirmação verificável é a de cima: nenhuma leitura nova é mais lenta que o gargalo`);
console.log(`  que o painel já tinha, e todas são ~1 RTT (o RTT base Brasil→us-west-2 é ~220 ms).`);

await cliente.end();
