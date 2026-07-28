// portao-f22-paginacao.mjs — PORTÃO do F22 (Rodada 16, Agent 1 / Web-A).
//
// Julga duas afirmações: (a) nenhum contador exibe o tamanho da página como se fosse o total, e
// (b) as conversas além da primeira página são ALCANÇÁVEIS, sem repetir nem pular linha.
// Medido antes: 94 conversas visíveis, tela mostrava 50, abas diziam "Todas · 50". As outras 44
// eram inalcançáveis — e a tela não dizia isso.
//
// Exercita a `lerConversas` REAL com cliente autenticado. Nada de cópia da consulta.
//
// LOCAL, NUNCA PRODUÇÃO (ARB-09): a URL vem do .env.local e é recusada se não for 127.0.0.1.
//
//
// MESA: estes portões escrevem no cluster LOCAL e criam usuário no GoTrue local. Rodam bem em
// sequência, mas exigem MESA ISOLADA — nada de dois portões no mesmo stack ao mesmo tempo, e nada
// de rodar contra um stack que outro agente está usando. Sob concorrência o GoTrue devolve
// 504/AuthRetryableFetchError; a criação de usuário retenta com espera crescente e, se ainda assim
// não passar, o portão RECUSA (rc=2) dizendo que o problema é de mesa — nunca reprova o produto
// por ambiente apertado.
// As três partes exigidas pela ARB-07:
//   VACUIDADE     — se o portão não semeou MAIS que uma página, ou a lista voltou vazia, REPROVA.
//                   Paginação medida sobre 3 conversas não julga nada.
//   CONTROLE NEG. — dois defeitos reencenados AO VIVO, não simulados: (i) contador = tamanho do
//                   array (o "50" mentindo sobre 60) e (ii) paginação por OFFSET numa lista que se
//                   move — a conversa sobe entre a página 1 e a 2, e o offset repete uma linha e
//                   pula outra. O keyset passa pelo MESMO movimento sem repetir nem pular.
//   MEDIDA        — total conferido contra `count(*)` por SQL direto (segundo caminho de leitura);
//                   a varredura de páginas conferida contra a ordem canônica lida por SQL.
//
// Uso:  cd me-escuta-web && npm run portao:f22
//       npm run portao:f22 -- --negativo

import "./portao-resolver.mjs";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { erroLegivel } from "./erro-legivel.mjs";
import { criarUsuarioDoPortao } from "./usuario-portao.mjs";

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
  console.error(`\nPORTÃO F22 · RECUSADO — ${msg}`);
  process.exit(2);
}

const SO_NEGATIVO = process.argv.includes("--negativo");

// ── 0 · ambiente declarado, nunca herdado ───────────────────────────────────────────────────
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
console.log("PORTÃO F22 · paginação honesta no inbox");
console.log(`  ALVO local · url=${URL}`);
console.log(`  cluster sid=${alvo.sid} · migrations=${alvo.migrations}`);
console.log("");

const canal = (
  await sql.query("select phone_number_id from core.canal_whatsapp where ativo limit 1")
).rows[0];
if (!canal) reprovar("nenhum canal_whatsapp ativo — sem ele v_conversa.visivel_inbox é sempre falso.");
const PNID = canal.phone_number_id;

// ── 1 · semear MAIS que uma página, com os dois casos que quebram cursor ingênuo ────────────
const PREFIXO = "+5511922";
const QUANTAS = 60; // > 50, que é o teto de uma página
const EMPATADAS = 4; // mesmo carimbo: sem desempate por id, o keyset pula ou repete
const SEM_ENTRADA = 3; // ultima_entrada_em NULL: o bloco dos nulos, que vem por último

async function purgar() {
  await sql.query(
    `delete from core.mensagem where conversa_id in
       (select id from core.conversa where telefone like $1)`,
    [`${PREFIXO}%`],
  );
  await sql.query("delete from core.conversa where telefone like $1", [`${PREFIXO}%`]);
}

const semeadas = [];
const INVISIVEIS = 3; // conversas FORA do inbox — ver o porquê em `semearInvisiveis`

/**
 * Conversas que existem e NÃO são visíveis no inbox (phone_number_id de canal inativo).
 *
 * Não é enfeite de cenário: o total do inbox é `count(*) WHERE visivel_inbox`, e num banco onde
 * TODA conversa é visível esse filtro não muda nada — uma contagem sem o filtro devolveria o mesmo
 * número, e a asserção (1) ficaria verde sobre uma consulta errada. Foi o que o Portão mediu: a
 * mutação que remove o filtro sobrevivia por falta de contra-exemplo no banco. Com estas aqui, o
 * filtro passa a ter consequência mensurável.
 */
async function semearInvisiveis() {
  for (let i = 0; i < INVISIVEIS; i++) {
    await sql.query(
      `insert into core.conversa (id, telefone, phone_number_id, area, criado_em, atualizado_em,
                                  primeira_posicao, ultima_posicao, mode, status, ultima_entrada_em)
       values (gen_random_uuid(), $1, 'CANAL_INATIVO_F22', 'comercial', now(), now(), 0, 0, 'IA',
               'nova', now())`,
      [`${PREFIXO}9${String(i).padStart(5, "0")}`],
    );
  }
}

async function semear() {
  const empate = new Date(Date.now() - 10 * 86400_000).toISOString();
  for (let i = 0; i < QUANTAS; i++) {
    const telefone = `${PREFIXO}${String(i).padStart(6, "0")}`;
    await sql.query("select porta.recebe_evento_externo($1::jsonb)", [
      JSON.stringify({
        tipo: "mensagem_recebida",
        ator: "sistema",
        origem: "portao-f22",
        id_externo: `f22-${randomUUID()}`,
        versao_payload: 1,
        payload: {
          conversa: { telefone, phone_number_id: PNID },
          tipo_conteudo: "texto",
          corpo: `portao f22 #${i}`,
        },
      }),
    ]);
    const id = (await sql.query("select id::text from core.conversa where telefone = $1", [telefone]))
      .rows[0]?.id;
    if (!id) reprovar(`a porta não criou a conversa #${i}`);

    // as últimas ficam sem entrada (bloco dos nulos); um punhado no meio empata o carimbo
    let em = null;
    if (i < QUANTAS - SEM_ENTRADA) {
      em =
        i >= 20 && i < 20 + EMPATADAS
          ? empate
          : new Date(Date.now() - (i + 1) * 3600_000).toISOString();
    }
    await sql.query(
      "update core.conversa set ultima_entrada_em = $2, atualizado_em = now() where id = $1",
      [id, em],
    );
    semeadas.push({ id, telefone, em });
  }
}

// ── 2 · usuário autenticado (a consulta roda sob o RLS dele) ────────────────────────────────
let admin, supabase, UID;
try {
  ({ admin, supabase, UID } = await criarUsuarioDoPortao({ URL, ANON, SERVICE, prefixo: "portao-f22" }));
} catch (e) {
  reprovar(`${e.message} — os portões precisam de mesa isolada; ver o cabeçalho`);
}

async function encerrar(codigo) {
  await purgar();
  await admin.auth.admin.deleteUser(UID).catch(() => {});
  await sql.end().catch(() => {});
  process.exit(codigo);
}

// ── 3 · a verdade pelo SEGUNDO caminho de leitura ───────────────────────────────────────────
async function totalPorSql() {
  return Number(
    (await sql.query("select count(*)::int as n from core.v_conversa where visivel_inbox")).rows[0].n,
  );
}
async function ordemCanonicaPorSql() {
  return (
    await sql.query(
      `select id::text as id from core.v_conversa
        where visivel_inbox
        order by ultima_entrada_em desc nulls last, id asc`,
    )
  ).rows.map((r) => r.id);
}

const { lerConversas } = await import("../lib/dados/conversas.ts");

/** Varre todas as páginas com o keyset real do produto. */
async function varrerPaginas(limite) {
  const vistos = [];
  const repetidos = [];
  let cursor = null;
  let paginas = 0;
  for (let i = 0; i < 200; i++) {
    const r = await lerConversas({ cliente: supabase, cursor, limite, jaCarregadas: vistos.length });
    paginas += 1;
    for (const c of r.conversas) {
      if (vistos.includes(c.id)) repetidos.push(c.id);
      vistos.push(c.id);
    }
    if (!r.proximoCursor) return { vistos, repetidos, paginas, ultima: r };
    cursor = r.proximoCursor;
  }
  reprovar("a varredura não terminou em 200 páginas — laço de paginação");
}

// ── 4 · execução ────────────────────────────────────────────────────────────────────────────
await purgar();
await semear();
await semearInvisiveis();
const TOTAL_SQL = await totalPorSql();
console.log(`  semeadas ${semeadas.length} conversas (${EMPATADAS} com carimbo EMPATADO, ${SEM_ENTRADA} sem entrada)`);
console.log(`  total visível no cluster (SQL): ${TOTAL_SQL}`);
console.log("");

const pagina1 = await lerConversas({ cliente: supabase });
const LIMITE = 50;

// ── VACUIDADE, ANTES DE TUDO ────────────────────────────────────────────────────────────────
// Primeiro porque é a única asserção cuja falha invalida as outras: paginação medida sobre menos
// de uma página não julga nada, e o resto do portão nem chega a fazer sentido (o controle negativo
// precisa mover uma linha de FORA da primeira página — que não existe). Portão que não consegue
// julgar tem de dizer isso e parar, não seguir e reprovar por um efeito colateral qualquer.
if (semeadas.length <= LIMITE || TOTAL_SQL <= LIMITE || pagina1.conversas.length === 0) {
  nok(
    `(0) vacuidade: ${TOTAL_SQL} conversas visíveis e ${semeadas.length} semeadas contra teto de ` +
      `${LIMITE}; página 1 devolveu ${pagina1.conversas.length} — sem segunda página não há o que medir`,
  );
  console.log(linhas.join("\n"));
  console.log("\nPORTÃO F22 · VERMELHO — 1 asserção(ões) falharam.");
  await encerrar(1);
}
const invisiveisNoBanco = Number(
  (await sql.query("select count(*)::int as n from core.v_conversa where not visivel_inbox")).rows[0].n,
);
if (invisiveisNoBanco === 0) {
  nok(
    "(0) vacuidade: o banco não tem NENHUMA conversa fora do inbox — sem contra-exemplo, uma " +
      "contagem SEM o filtro visivel_inbox devolveria o mesmo total e a asserção (1) ficaria verde " +
      "sobre a consulta errada",
  );
  console.log(linhas.join("\n"));
  console.log("\nPORTÃO F22 · VERMELHO — 1 asserção(ões) falharam.");
  await encerrar(1);
}
ok(
  `(0) vacuidade: ${TOTAL_SQL} conversas visíveis (> ${LIMITE}) e ${invisiveisNoBanco} FORA do inbox ` +
    `(contra-exemplo do filtro); página 1 devolveu ${pagina1.conversas.length} pela lerConversas real`,
);

// ── CONTROLE NEGATIVO ───────────────────────────────────────────────────────────────────────
// (i) o contador antigo: tamanho do array carregado.
const contadorAntigo = pagina1.conversas.length;
const contadorMente = contadorAntigo !== TOTAL_SQL;

// (ii) OFFSET numa lista que se move. Entre a página 1 e a 2, uma conversa lá de baixo sobe pro
// topo (chegou mensagem) — que é o que acontece o dia inteiro num inbox.
async function paginarPorOffset(limite, aoVirar) {
  const p1 = (
    await supabase
      .schema("core")
      .from("v_conversa")
      .select("id")
      .eq("visivel_inbox", true)
      .order("ultima_entrada_em", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(0, limite - 1)
  ).data.map((r) => String(r.id));
  if (aoVirar) await aoVirar();
  const p2 = (
    await supabase
      .schema("core")
      .from("v_conversa")
      .select("id")
      .eq("visivel_inbox", true)
      .order("ultima_entrada_em", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(limite, limite * 2 - 1)
  ).data.map((r) => String(r.id));
  return { p1, p2 };
}

async function paginarPorKeyset(limite, aoVirar) {
  const r1 = await lerConversas({ cliente: supabase, limite });
  if (aoVirar) await aoVirar();
  const r2 = await lerConversas({
    cliente: supabase,
    limite,
    cursor: r1.proximoCursor,
    jaCarregadas: r1.conversas.length,
  });
  return { p1: r1.conversas.map((c) => c.id), p2: r2.conversas.map((c) => c.id) };
}

const LIM_MOV = 8;

/**
 * Uma conversa DE FORA da primeira página sobe pro topo — o movimento real de "chegou mensagem".
 *
 * Tem de vir de FORA da página 1: mover uma linha que já está nela não desloca a fronteira, e o
 * offset sobreviveria por acidente. Vindo de fora, tudo desce uma posição, e a última linha da
 * página 1 reaparece na página 2 — que é a duplicação que o keyset existe para evitar.
 */
async function subirUmaParaOTopo() {
  const alvo = (
    await sql.query(
      `select id::text as id from core.v_conversa
        where visivel_inbox and telefone like $1
        order by ultima_entrada_em desc nulls last, id asc
        limit 1 offset $2`,
      [`${PREFIXO}%`, LIM_MOV + 2],
    )
  ).rows[0];
  await sql.query("update core.conversa set ultima_entrada_em = now() where id = $1", [alvo.id]);
  return alvo.id;
}
const offsetMovido = await paginarPorOffset(LIM_MOV, subirUmaParaOTopo);
const offsetRepetiu = offsetMovido.p2.filter((id) => offsetMovido.p1.includes(id));
const ordemDepois = await ordemCanonicaPorSql();
const offsetCobriu = new Set([...offsetMovido.p1, ...offsetMovido.p2]);
const offsetPulou = ordemDepois.slice(0, LIM_MOV * 2).filter((id) => !offsetCobriu.has(id));

const keysetMovido = await paginarPorKeyset(LIM_MOV, subirUmaParaOTopo);
const keysetRepetiu = keysetMovido.p2.filter((id) => keysetMovido.p1.includes(id));

if (SO_NEGATIVO) {
  console.log("CONTROLE NEGATIVO (isolado):");
  console.log(`  (i)  contador = tamanho do array: ${contadorAntigo} vs total real ${TOTAL_SQL} → mente=${contadorMente}`);
  console.log(`  (ii) OFFSET com lista em movimento: repetiu=${offsetRepetiu.length} pulou=${offsetPulou.length}`);
  console.log(`       KEYSET no mesmo movimento:    repetiu=${keysetRepetiu.length}`);
  const acusou = contadorMente && offsetRepetiu.length + offsetPulou.length > 0 && keysetRepetiu.length === 0;
  console.log(acusou ? "P1 OK — os dois defeitos antigos são ACUSADOS." : "P1 FALHOU — defeito passou verde.");
  await encerrar(acusou ? 0 : 1);
}

// ── 5 · MEDIDA ──────────────────────────────────────────────────────────────────────────────
if (pagina1.total === TOTAL_SQL)
  ok(`(1) total do servidor == count(*) por SQL direto: ${pagina1.total}`);
else nok(`(1) total divergente — lerConversas diz ${pagina1.total}, SQL diz ${TOTAL_SQL}`);

if (pagina1.total !== pagina1.conversas.length)
  ok(`(2) o total NÃO é o tamanho da página (${pagina1.total} ≠ ${pagina1.conversas.length})`);
else nok("(2) total == tamanho da página — é exatamente a mentira que o item existe pra tirar");

{
  const canonica = await ordemCanonicaPorSql();
  const { vistos, repetidos, paginas } = await varrerPaginas(LIMITE);
  const buracos = canonica.filter((id) => !vistos.includes(id));
  if (repetidos.length) nok(`(3) a varredura REPETIU ${repetidos.length} conversa(s)`);
  else if (buracos.length) nok(`(3) a varredura PULOU ${buracos.length} conversa(s)`);
  else if (vistos.length !== canonica.length)
    nok(`(3) a varredura viu ${vistos.length} de ${canonica.length}`);
  else if (vistos.join(",") !== canonica.join(","))
    nok("(3) a união das páginas cobre tudo, mas fora da ordem canônica");
  else ok(`(3) ${paginas} páginas cobrem as ${canonica.length} conversas: sem repetir, sem buraco, na ordem`);
}

{
  // páginas pequenas forçam a virada a cair EM CIMA do empate de carimbo — é o caso em que um
  // cursor só de timestamp pula ou repete, e o desempate por id é o que salva
  const canonica = await ordemCanonicaPorSql();
  const { vistos, repetidos } = await varrerPaginas(3);
  if (repetidos.length === 0 && vistos.join(",") === canonica.join(","))
    ok(`(4) com página de 3 (viradas em cima dos ${EMPATADAS} carimbos empatados) segue exata`);
  else nok(`(4) página pequena quebrou: repetidos=${repetidos.length}, cobertura ${vistos.length}/${canonica.length}`);
}

{
  // limite maior que o total: tudo coube, então NÃO há corte nem "carregar mais"
  const tudo = await lerConversas({ cliente: supabase, limite: TOTAL_SQL + 10 });
  if (tudo.corte === false && tudo.proximoCursor === null)
    ok(`(5) com tudo carregado (${tudo.conversas.length}/${tudo.total}), corte=false e sem "carregar mais"`);
  else nok(`(5) tudo carregado mas corte=${tudo.corte} e proximoCursor=${tudo.proximoCursor ? "presente" : "null"}`);
}

{
  // cursor corrompido: recomeça do topo, NUNCA vira consulta sem filtro que reembaralha a lista.
  // A base de comparação é RELIDA agora: o controle negativo mexeu na lista de propósito, e
  // comparar contra a página 1 do começo do portão acusaria movimento, não o defeito do cursor.
  const agora = await lerConversas({ cliente: supabase });
  const p1ids = agora.conversas.map((c) => c.id).join(",");
  // várias formas de corrupção, porque elas caem em ramos DIFERENTES do decodificar: base64
  // inválido, base64 válido que não é JSON, JSON que não é o par, e par com uuid inventado.
  // Testar só uma deixaria os outros ramos sem rede — foi o que a bateria pegou.
  const forjados = {
    "base64 inválido": "isto###nao#e#base64",
    "base64 que não é JSON": btoa("nao sou json"),
    "JSON que não é o par": btoa(JSON.stringify({ em: null, id: "x" })),
    "par com uuid inventado": btoa(JSON.stringify(["2026-07-20T00:00:00.000Z", "nao-e-uuid"])),
    "par truncado": btoa(JSON.stringify(["2026-07-20T00:00:00.000Z"])),
  };
  const desviaram = [];
  for (const [rotulo, cursor] of Object.entries(forjados)) {
    const r = await lerConversas({ cliente: supabase, cursor });
    if (r.conversas.map((c) => c.id).join(",") !== p1ids) desviaram.push(rotulo);
  }
  if (desviaram.length === 0)
    ok(`(6) ${Object.keys(forjados).length} formas de cursor corrompido recomeçam do topo — degrade, não brecha`);
  else nok(`(6) cursor corrompido mudou a página devolvida: ${desviaram.join(", ")}`);
}

if (contadorMente && offsetRepetiu.length + offsetPulou.length > 0 && keysetRepetiu.length === 0)
  ok(
    `(7) controle negativo: contador-antigo diria ${contadorAntigo} de ${TOTAL_SQL}; OFFSET com a ` +
      `lista em movimento repetiu ${offsetRepetiu.length} e pulou ${offsetPulou.length}; ` +
      `o KEYSET no mesmo movimento repetiu 0`,
  );
else
  nok(
    `(7) controle negativo não acusou — contadorMente=${contadorMente}, ` +
      `offset repetiu=${offsetRepetiu.length}/pulou=${offsetPulou.length}, keyset repetiu=${keysetRepetiu.length}`,
  );

// ── 7 · PROVA ESTÁTICA: a UI não usa mais o tamanho do array como total ─────────────────────
const inbox = readFileSync(resolve(raiz, "components/conversas/inbox.tsx"), "utf8");
if (/rotuloContagem\("todas"\)/.test(inbox) && /totalAtual != null/.test(inbox))
  ok("(8) a aba Todas usa o total do servidor, não o tamanho do array");
else nok("(8) não achei a aba Todas ligada ao total do servidor");

// olha o BLOCO de declaração do corte, não a palavra solta: `corteAtual ?` também aparece no
// rótulo das abas, e um grep frouxo ficaria verde com o aviso apagado
if (/\{corteAtual && \(/.test(inbox) && /Carregar mais/.test(inbox))
  ok('(9) a tela DECLARA o corte e oferece "Carregar mais"');
else nok("(9) a tela não declara o corte nem oferece carregar mais");

// ── 8 · veredito ────────────────────────────────────────────────────────────────────────────
console.log(linhas.join("\n"));
console.log("");
if (falhas.length) {
  console.log(`PORTÃO F22 · VERMELHO — ${falhas.length} asserção(ões) falharam.`);
  await encerrar(1);
}
console.log("PORTÃO F22 · VERDE — vacuidade + medida (6) + controle negativo duplo + prova estática.");
await encerrar(0);
