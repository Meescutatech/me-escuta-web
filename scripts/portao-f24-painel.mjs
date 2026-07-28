// portao-f24-painel.mjs — PORTÃO do F24a (Rodada 16, Agent 1 / Web-A).
//
// Julga: o painel sai de ~37 requisições por visita para <= 12, SEM mudar nenhum número.
//
// Contado antes (lendo o corpo da função): 1 último evento + 2 leads novos + 14 mensagens por dia
// (7 janelas × 2 direções) + 3 de entrega + 1 primeira resposta + 1 config + 14 contagens por etapa
// (1 por etapa, 14 em produção) + 2 de valor = ~37.
//
// Duas medições, porque as afirmações são de naturezas diferentes:
//   · CLIENTE FALSO QUE CONTA — prova quantas requisições o código FAZ. Nenhum resultado prova isso.
//   · BANCO REAL, autenticado — prova que cada número bate com o caminho de head-count ANTIGO,
//     recalculado aqui do zero. É a asserção que importa: a troca de técnica não pode mudar número.
//
// LOCAL, NUNCA PRODUÇÃO (ARB-09).
//
//
// MESA: estes portões escrevem no cluster LOCAL e criam usuário no GoTrue local. Rodam bem em
// sequência, mas exigem MESA ISOLADA — nada de dois portões no mesmo stack ao mesmo tempo, e nada
// de rodar contra um stack que outro agente está usando. Sob concorrência o GoTrue devolve
// 504/AuthRetryableFetchError; a criação de usuário retenta com espera crescente e, se ainda assim
// não passar, o portão RECUSA (rc=2) dizendo que o problema é de mesa — nunca reprova o produto
// por ambiente apertado.
// As três partes (ARB-07):
//   VACUIDADE     — números todos nulos/zero aprovariam qualquer implementação. Se o painel não
//                   tiver nada para contar, REPROVA.
//   CONTROLE NEG. — o caminho ANTIGO é medido no MESMO cliente falso: ele TEM de estourar as 12.
//                   Se as duas medidas derem igual, a medida não mede.
//   MEDIDA        — o par antes/depois em requisições, e a igualdade número a número.
//
// Uso:  cd me-escuta-web && npm run portao:f24
//       npm run portao:f24 -- --negativo

import "./portao-resolver.mjs";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { erroLegivel } from "./erro-legivel.mjs";
import { criarUsuarioDoPortao } from "./usuario-portao.mjs";
import { criarClienteFalso } from "./cliente-falso.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "..");

const falhas = [];
const linhas = [];
const ok = (m) => linhas.push(`  VERDE   · ${m}`);
const nok = (m) => {
  linhas.push(`  VERMELHO· ${m}`);
  falhas.push(m);
};
function reprovar(msg) {
  console.error(`\nPORTÃO F24a · RECUSADO — ${msg}`);
  process.exit(2);
}
const SO_NEGATIVO = process.argv.includes("--negativo");
const TETO_REQUISICOES = 12;

// ── 0 · ambiente ────────────────────────────────────────────────────────────────────────────
const env = {};
try {
  for (const l of readFileSync(resolve(raiz, ".env.local"), "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  reprovar("não achei .env.local — o portão não adivinha alvo (E-009).");
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB = env.DATABASE_URL ?? "";
if (!URL || !ANON || !SERVICE || !DB) reprovar("faltam chaves no .env.local.");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL))
  reprovar(`alvo não é local: ${URL}. Portão automatizado NÃO fala com produção (ARB-09).`);
if (!/@(127\.0\.0\.1|localhost):/.test(DB))
  reprovar("DATABASE_URL não é local. Portão automatizado NÃO fala com produção (ARB-09).");

const sql = new pg.Client({ connectionString: DB });
await sql.connect();
const alvo = (
  await sql.query(
    `select system_identifier::text as sid,
            (select count(*) from supabase_migrations.schema_migrations)::int as migrations
       from pg_control_system()`,
  )
).rows[0];
console.log("PORTÃO F24a · painel com agregação em JS (<= 12 requisições)");
console.log(`  ALVO local · url=${URL}`);
console.log(`  cluster sid=${alvo.sid} · migrations=${alvo.migrations}`);
console.log("");

// ── 1 · semear mensagens espalhadas pelos 7 dias, com estados de entrega ────────────────────
const MARCA = "portao-f24";
const PREFIXO = "+5511924";

async function purgar() {
  await sql.query(
    `delete from core.mensagem where conversa_id in
       (select id from core.conversa where telefone like $1)`,
    [`${PREFIXO}%`],
  );
  await sql.query("delete from core.conversa where telefone like $1", [`${PREFIXO}%`]);
}

async function semear() {
  const telefone = `${PREFIXO}000001`;
  await sql.query("select porta.recebe_evento_externo($1::jsonb)", [
    JSON.stringify({
      tipo: "mensagem_recebida",
      ator: "sistema",
      origem: MARCA,
      id_externo: `f24-${randomUUID()}`,
      versao_payload: 1,
      payload: {
        conversa: { telefone, phone_number_id: "PORTAO_F24" },
        tipo_conteudo: "texto",
        corpo: "nascimento f24",
      },
    }),
  ]);
  const conv = (await sql.query("select id::text from core.conversa where telefone = $1", [telefone]))
    .rows[0]?.id;
  if (!conv) reprovar("a porta não criou a conversa do cenário");
  await sql.query("delete from core.mensagem where conversa_id = $1", [conv]);

  // 6 dias × (3 entradas + 1 saída), com estados variados — para que TODOS os blocos do painel
  // tenham o que contar e a igualdade número a número signifique alguma coisa.
  //
  // A ASSIMETRIA É DELIBERADA (achado do Portão no R16-23). Antes eram 2 entradas + 2 saídas por
  // dia, e com entrada == saída uma mutação que TROCA os dois baldes não muda número nenhum: ela
  // só disparava graças a dado AMBIENTE do cluster, não ao cenário. Cenário simétrico não distingue
  // as duas direções — e distinguir as duas direções é metade do que o bloco mede.
  //
  // O contador de saídas também é PRÓPRIO: com um contador só, as entradas consumiam índices e as
  // saídas caíam sempre nos mesmos dois estados; o cenário nunca continha "enviado" nem "lido", e
  // uma mutação que confundisse esses com "entregue" passava despercebida.
  const estados = ["enviado", "entregue", "lido", "falhou"];
  const POR_DIA = [
    ["entrada", "entrada", "entrada", "saida"], // 3×1: nunca empata
  ][0];
  let saidas = 0;
  let n = 0;
  for (let dia = 0; dia < 6; dia++) {
    for (let k = 0; k < POR_DIA.length; k++) {
      {
        const direcao = POR_DIA[k];
        const quando = new Date(Date.now() - dia * 86400_000 - (k + 1) * 3600_000).toISOString();
        const evento = (
          await sql.query(
            `insert into core.evento (tipo, ator, origem, id_externo, versao_payload, payload)
             values ($1,'sistema',$2,$3,1,'{}'::jsonb) returning id`,
            [direcao === "entrada" ? "mensagem_recebida" : "mensagem_enviada", MARCA, `f24-${randomUUID()}`],
          )
        ).rows[0].id;
        await sql.query(
          `insert into core.mensagem (id, conversa_id, evento_id, direcao, tipo_conteudo, corpo,
                                      criado_em, timestamp_origem, status_entrega)
           values ($1,$2,$3,$4,'texto',$5,$6,$6,$7)`,
          [
            randomUUID(),
            conv,
            evento,
            direcao,
            `f24 msg ${n}`,
            quando,
            direcao === "saida" ? estados[saidas++ % estados.length] : null,
          ],
        );
        n += 1;
      }
    }
  }
}

// ── 2 · usuário autenticado ─────────────────────────────────────────────────────────────────
let admin, supabase, UID;
try {
  ({ admin, supabase, UID } = await criarUsuarioDoPortao({ URL, ANON, SERVICE, prefixo: "portao-f24" }));
} catch (e) {
  reprovar(`${e.message} — os portões precisam de mesa isolada; ver o cabeçalho`);
}

async function encerrar(codigo) {
  await purgar();
  await admin.auth.admin.deleteUser(UID).catch(() => {});
  await sql.end().catch(() => {});
  process.exit(codigo);
}

await purgar();
await semear();

const { lerDashboard } = await import("../lib/dados/dashboard.ts");
const { lerEtapasReais, ETAPAS_PADRAO } = await import("../lib/dados/funil.ts");
const { janelasUltimosDias } = await import("../lib/dados/dashboard-calculos.ts");

const AGORA = new Date();

// ── 3 · CAMINHO ANTIGO recalculado do zero (segundo caminho de leitura) ─────────────────────
// Não é uma cópia do código novo: é o head-count por linha, como estava antes, batendo no banco
// real. Se os dois discordarem, quem está errado é a técnica nova — que é o risco declarado do item.
async function contarAntigo(tabela, aplicar) {
  const q = aplicar(supabase.schema("core").from(tabela).select("*", { count: "exact", head: true }));
  const { count, error } = await q;
  return error ? null : count ?? 0;
}

async function painelPeloCaminhoAntigo() {
  const janelas = janelasUltimosDias(AGORA, 7);
  const etapas = (await lerEtapasReais(supabase)) ?? ETAPAS_PADRAO;
  const contagensEtapa = [];
  for (const e of etapas) contagensEtapa.push(await contarAntigo("v_lead_card", (q) => q.eq("etapa", e.chave)));
  const porDia = [];
  for (const j of janelas) {
    porDia.push({
      rotulo: j.rotulo,
      entrada: await contarAntigo("mensagem", (q) =>
        q.eq("direcao", "entrada").gte("criado_em", j.inicioIso).lt("criado_em", j.fimIso),
      ),
      saida: await contarAntigo("mensagem", (q) =>
        q.eq("direcao", "saida").gte("criado_em", j.inicioIso).lt("criado_em", j.fimIso),
      ),
    });
  }
  const base = await contarAntigo("mensagem", (q) =>
    q.eq("direcao", "saida").in("status_entrega", ["enviado", "entregue", "lido", "falhou"]),
  );
  const entregues = await contarAntigo("mensagem", (q) =>
    q.eq("direcao", "saida").in("status_entrega", ["entregue", "lido"]),
  );
  const falhas = await contarAntigo("mensagem", (q) => q.eq("direcao", "saida").eq("status_entrega", "falhou"));
  return { contagensEtapa, porDia, base, entregues, falhas };
}

const novo = await lerDashboard(AGORA, supabase);
const antigo = await painelPeloCaminhoAntigo();

// ── 4 · MEDIÇÃO de requisições com o cliente falso ──────────────────────────────────────────
const etapasReais = (await lerEtapasReais(supabase)) ?? ETAPAS_PADRAO;
const leadsFalsos = Array.from({ length: 300 }, (_, i) => ({
  etapa: etapasReais[i % etapasReais.length].chave,
  valor: null,
}));
const msgsFalsas = Array.from({ length: 400 }, (_, i) => ({
  direcao: i % 2 ? "entrada" : "saida",
  criado_em: new Date(Date.now() - (i % 7) * 86400_000).toISOString(),
  conversa_id: `c${i % 20}`,
  status_entrega: ["enviado", "entregue", "lido", "falhou"][i % 4],
}));

function responder(q) {
  if (q.head) return { data: null, count: 1 };
  if (q.tabela === "v_config_vigente")
    return { data: { payload: { etapas: etapasReais.map((e) => ({ ...e })) } } };
  if (q.tabela === "v_lead_card") {
    const cols = (q.colunas ?? "").split(",");
    return { data: leadsFalsos.map((l) => Object.fromEntries(cols.map((k) => [k, l[k]]))) };
  }
  if (q.tabela === "mensagem") {
    const cols = (q.colunas ?? "").split(",");
    return { data: msgsFalsas.map((m) => Object.fromEntries(cols.map((k) => [k, m[k]]))) };
  }
  if (q.tabela === "conversa") return { data: [{ id: "c1" }] };
  if (q.tabela === "evento") return { data: { criado_em: new Date().toISOString() } };
  return { data: [] };
}

const falso = criarClienteFalso(responder);
await lerDashboard(AGORA, falso);
const REQ_DEPOIS = falso.total;

// CONTROLE NEGATIVO: o caminho antigo, no MESMO cliente falso.
const falsoAntigo = criarClienteFalso(responder);
{
  const janelas = janelasUltimosDias(AGORA, 7);
  const s = falsoAntigo;
  await s.schema("core").from("evento").select("criado_em").order("criado_em").limit(1).maybeSingle();
  await s.schema("core").from("lead").select("*", { count: "exact", head: true }).gte("criado_em", "x");
  await s.schema("core").from("lead").select("*", { count: "exact", head: true }).gte("criado_em", "y");
  for (const j of janelas) {
    await s.schema("core").from("mensagem").select("*", { count: "exact", head: true })
      .eq("direcao", "entrada").gte("criado_em", j.inicioIso).lt("criado_em", j.fimIso);
    await s.schema("core").from("mensagem").select("*", { count: "exact", head: true })
      .eq("direcao", "saida").gte("criado_em", j.inicioIso).lt("criado_em", j.fimIso);
  }
  for (let i = 0; i < 3; i++)
    await s.schema("core").from("mensagem").select("*", { count: "exact", head: true }).eq("direcao", "saida");
  await s.schema("core").from("conversa").select("id").gte("criado_em", "z").limit(300);
  await s.schema("core").from("mensagem").select("conversa_id,direcao,criado_em").in("conversa_id", ["c1"]).limit(5000);
  await s.schema("core").from("v_config_vigente").select("payload").eq("nome", "funil_vendas").maybeSingle();
  for (const e of etapasReais)
    await s.schema("core").from("v_lead_card").select("*", { count: "exact", head: true }).eq("etapa", e.chave);
  await s.schema("core").from("v_lead_card").select("valor").in("etapa", []).limit(1000);
  await s.schema("core").from("v_lead_card").select("*", { count: "exact", head: true }).is("valor", null);
}
const REQ_ANTES = falsoAntigo.total;

if (SO_NEGATIVO) {
  console.log("CONTROLE NEGATIVO (isolado) — caminho ANTIGO no mesmo cliente falso:");
  console.log(`  antigo: ${REQ_ANTES} requisições · novo: ${REQ_DEPOIS} · teto ${TETO_REQUISICOES}`);
  const acusou = REQ_ANTES > TETO_REQUISICOES && REQ_DEPOIS <= TETO_REQUISICOES;
  console.log(acusou ? "P1 OK — o caminho antigo ESTOURA o teto que o novo cumpre." : "P1 FALHOU.");
  await encerrar(acusou ? 0 : 1);
}

// ── 5 · VACUIDADE ───────────────────────────────────────────────────────────────────────────
const totalLeads = novo.leadsPorEtapa.reduce((s, f) => s + (f.qtd ?? 0), 0);
const totalMsgs = novo.mensagens7d.reduce((s, d) => s + (d.entrada ?? 0) + (d.saida ?? 0), 0);
if (totalLeads === 0 || totalMsgs === 0 || (novo.entrega.base ?? 0) === 0)
  nok(
    `(0) vacuidade: painel sem o que contar (leads=${totalLeads}, mensagens7d=${totalMsgs}, ` +
      `entrega.base=${novo.entrega.base}) — qualquer implementação passaria`,
  );
else
  ok(
    `(0) vacuidade: ${totalLeads} leads em ${novo.leadsPorEtapa.length} etapas, ${totalMsgs} mensagens ` +
      `em 7d, base de entrega ${novo.entrega.base}`,
  );

// ── 6 · MEDIDA ──────────────────────────────────────────────────────────────────────────────
if (REQ_DEPOIS <= TETO_REQUISICOES)
  ok(`(1) lerPainel faz ${REQ_DEPOIS} requisições (teto ${TETO_REQUISICOES}) — antes: ${REQ_ANTES}`);
else nok(`(1) lerPainel faz ${REQ_DEPOIS} requisições, acima do teto ${TETO_REQUISICOES}`);

{
  const novos = novo.leadsPorEtapa.map((f) => f.qtd);
  const iguais = JSON.stringify(novos) === JSON.stringify(antigo.contagensEtapa);
  if (iguais) ok(`(2) contagem por etapa idêntica ao head-count antigo: [${novos.join(", ")}]`);
  else nok(`(2) contagem por etapa DIVERGIU — nova=[${novos}] antiga=[${antigo.contagensEtapa}]`);
}

{
  const novos = novo.mensagens7d.map((d) => `${d.rotulo}:${d.entrada}/${d.saida}`).join(" ");
  const velhos = antigo.porDia.map((d) => `${d.rotulo}:${d.entrada}/${d.saida}`).join(" ");
  if (novos === velhos) ok(`(3) mensagens por dia idênticas ao head-count antigo: ${novos}`);
  else nok(`(3) mensagens por dia DIVERGIRAM —\n        nova = ${novos}\n        antiga= ${velhos}`);
}

{
  const a = `${novo.entrega.base}/${novo.entrega.entregues}/${novo.entrega.falhas}`;
  const b = `${antigo.base}/${antigo.entregues}/${antigo.falhas}`;
  if (a === b) ok(`(4) entrega idêntica ao head-count antigo (base/entregues/falhas = ${a})`);
  else nok(`(4) entrega DIVERGIU — nova=${a} antiga=${b}`);
}

{
  // acima do teto: a leitura devolve TETO+1 linhas e o caminho tem de cair no fallback, que faz
  // MUITO mais requisições. É o critério de aceite, não melhoria futura.
  const { TETO_LEADS_AGREGACAO, TETO_MENSAGENS_AGREGACAO } = await import("../lib/dados/dashboard-calculos.ts");
  const muitosLeads = Array.from({ length: TETO_LEADS_AGREGACAO + 1 }, () => ({ etapa: "novo", valor: null }));
  const muitasMsgs = Array.from({ length: TETO_MENSAGENS_AGREGACAO + 1 }, (_, i) => ({
    direcao: i % 2 ? "entrada" : "saida",
    criado_em: new Date().toISOString(),
    status_entrega: "enviado",
    conversa_id: "c1",
  }));
  const falsoCheio = criarClienteFalso((q) => {
    if (q.head) return { data: null, count: 1 };
    if (q.tabela === "v_config_vigente")
      return { data: { payload: { etapas: etapasReais.map((e) => ({ ...e })) } } };
    if (q.tabela === "v_lead_card") return { data: muitosLeads };
    if (q.tabela === "mensagem") return { data: muitasMsgs };
    if (q.tabela === "conversa") return { data: [{ id: "c1" }] };
    if (q.tabela === "evento") return { data: { criado_em: new Date().toISOString() } };
    return { data: [] };
  });
  await lerDashboard(AGORA, falsoCheio);
  // olha QUEM caiu no fallback, não só o total: "mais requisições" poderia vir de qualquer bloco,
  // e o que o teto promete é que a agregação por etapa volta a ser head-count por etapa.
  const headsDeEtapa = falsoCheio.chamadas.filter((c) => c.tabela === "v_lead_card" && c.head).length;
  if (headsDeEtapa >= etapasReais.length && falsoCheio.total > REQ_DEPOIS)
    ok(
      `(5) acima do teto o fallback assume: ${headsDeEtapa} head-counts por etapa ` +
        `(${etapasReais.length} etapas) e ${falsoCheio.total} requisições contra ${REQ_DEPOIS} no agregado`,
    );
  else
    nok(
      `(5) acima do teto NÃO caiu no fallback — head-counts de etapa=${headsDeEtapa} ` +
        `(esperado >= ${etapasReais.length}), total=${falsoCheio.total} vs ${REQ_DEPOIS}. O teto é decorativo.`,
    );
}

{
  // uma leitura que falha deixa SÓ o bloco dela nulo — nunca zera os vizinhos
  const falsoQuebrado = criarClienteFalso((q) => {
    if (q.tabela === "v_lead_card") return { data: null, error: { message: "falha simulada" } };
    return responder(q);
  });
  const parcial = await lerDashboard(AGORA, falsoQuebrado);
  const etapasNulas = parcial.leadsPorEtapa.every((f) => f.qtd == null);
  const vizinhosVivos = parcial.mensagens7d.some((d) => (d.entrada ?? 0) + (d.saida ?? 0) > 0);
  if (etapasNulas && vizinhosVivos)
    ok("(6) falha de um bloco deixa só ele null — os vizinhos seguem com número");
  else
    nok(`(6) falha de um bloco contaminou o resto (etapasNulas=${etapasNulas}, vizinhosVivos=${vizinhosVivos})`);
}

// ── 7 · CONTROLE NEGATIVO ───────────────────────────────────────────────────────────────────
// O piso de 30 não é enfeite: o caminho antigo eram ~37 requisições, e um controle negativo que
// reencena só uma parte delas (por exemplo, esquecendo as 14 contagens por etapa) continuaria
// acima de 12 e passaria verde sem controlar nada. A bateria pegou exatamente esse buraco.
const PISO_CONTROLE = 30;
if (REQ_ANTES >= PISO_CONTROLE && REQ_DEPOIS <= TETO_REQUISICOES)
  ok(
    `(7) controle negativo: o caminho ANTIGO faz ${REQ_ANTES} requisições (piso ${PISO_CONTROLE}, ` +
      `condiz com as ~37 contadas na spec) — estoura o teto que o novo cumpre`,
  );
else
  nok(
    `(7) controle negativo não acusou — antigo=${REQ_ANTES} (piso ${PISO_CONTROLE}), ` +
      `novo=${REQ_DEPOIS}, teto=${TETO_REQUISICOES}`,
  );

// ── 8 · PROVA ESTÁTICA: o ponto de troca do F24b está declarado ─────────────────────────────
const fonte = readFileSync(resolve(raiz, "lib/dados/dashboard.ts"), "utf8");
if (/painel_resumo/.test(fonte)) ok("(8) o ponto de troca para api.painel_resumo() está declarado no código");
else nok("(8) não há ponto de troca declarado para o F24b");

// ── 9 · veredito ────────────────────────────────────────────────────────────────────────────
console.log(`  MEDIDA antes×depois (cliente falso): ${REQ_ANTES} → ${REQ_DEPOIS} requisições`);
console.log(`  requisições do caminho novo: ${falso.resumo().join(" | ")}`);
console.log("");
console.log(linhas.join("\n"));
console.log("");
if (falhas.length) {
  console.log(`PORTÃO F24a · VERMELHO — ${falhas.length} asserção(ões) falharam.`);
  await encerrar(1);
}
console.log("PORTÃO F24a · VERDE — vacuidade + medida (6) + controle negativo + prova estática.");
await encerrar(0);
