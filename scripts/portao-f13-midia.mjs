// portao-f13-midia.mjs — PORTÃO do F13 (Rodada 16, Agent 1 / Web-A).
//
// Julga: a mesma foto é baixada UMA vez por sessão, não a cada releitura da thread.
//
// O F13 não é "fazer imagem carregar" — a bolha já estava bem-feita, com URL preguiçosa, erro em
// PT-BR e lightbox. O defeito é ela carregar DE NOVO: `createSignedUrls` devolve token novo a cada
// chamada, `lerMensagens` roda a cada `router.refresh()`, e URL nova = `src` diferente = download
// novo. O cache do navegador nunca é usado, porque a chave dele é a URL.
//
// A dedução acima é da PESQUISA e estava marcada como "só lida, NÃO medida". A asserção (0-bis)
// deste portão MEDE: assina o mesmo caminho duas vezes contra o Storage real e compara. Se a
// medição desmentir, o item encolhe — e o portão diz isso em vez de seguir em frente.
//
// LOCAL, NUNCA PRODUÇÃO (ARB-09).
//
// As três partes (ARB-07):
//   VACUIDADE     — sem mídia na thread, "as URLs são idênticas" é verdade vazia (dois nadas são
//                   iguais). Se o cenário não tiver foto assinada, REPROVA.
//   CONTROLE NEG. — o comportamento ANTIGO (assinar sempre) é exercido no mesmo Storage: ele TEM
//                   de produzir URL diferente a cada leitura. Se não produzir, não havia defeito.
//   MEDIDA        — N releituras seguidas produzem quantas URLs DISTINTAS, antes e depois.
//
// Uso:  cd me-escuta-web && npm run portao:f13
//       npm run portao:f13 -- --negativo

import "./portao-resolver.mjs";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
  console.error(`\nPORTÃO F13 · RECUSADO — ${msg}`);
  process.exit(2);
}
const SO_NEGATIVO = process.argv.includes("--negativo");
const RELEITURAS = 12; // ~1 minuto de refresh a 5 s, que era o intervalo antes do F4

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
console.log("PORTÃO F13 · a mesma foto baixa uma vez, não a cada releitura");
console.log(`  ALVO local · url=${URL}`);
console.log(`  cluster sid=${alvo.sid} · migrations=${alvo.migrations}`);
console.log("");

// ── 1 · bucket + objetos + conversa com fotos ───────────────────────────────────────────────
const PREFIXO = "+5511925";
const BUCKET = "midia-whatsapp";
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function purgar() {
  await sql.query(
    `delete from core.mensagem where conversa_id in
       (select id from core.conversa where telefone like $1)`,
    [`${PREFIXO}%`],
  );
  await sql.query("delete from core.conversa where telefone like $1", [`${PREFIXO}%`]);
}

// 1×1 PNG — o menor arquivo real que o Storage aceita; o que importa é existir, não o conteúdo
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const CAMINHOS = ["portao-f13/a.png", "portao-f13/b.png", "portao-f13/c.png"];

async function prepararStorage() {
  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error } = await admin.storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message))
      reprovar(`não consegui criar o bucket ${BUCKET}: ${error.message}`);
  }
  for (const caminho of CAMINHOS) {
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(caminho, PNG_1x1, { contentType: "image/png", upsert: true });
    if (error) reprovar(`não consegui subir ${caminho}: ${error.message}`);
  }
}

let CONVERSA = null;
async function semear() {
  const telefone = `${PREFIXO}000001`;
  await sql.query("select porta.recebe_evento_externo($1::jsonb)", [
    JSON.stringify({
      tipo: "mensagem_recebida",
      ator: "sistema",
      origem: "portao-f13",
      id_externo: `f13-${randomUUID()}`,
      versao_payload: 1,
      payload: {
        conversa: { telefone, phone_number_id: "PORTAO_F13" },
        tipo_conteudo: "texto",
        corpo: "nascimento f13",
      },
    }),
  ]);
  CONVERSA = (await sql.query("select id::text from core.conversa where telefone = $1", [telefone]))
    .rows[0]?.id;
  if (!CONVERSA) reprovar("a porta não criou a conversa do cenário");
  await sql.query("delete from core.mensagem where conversa_id = $1", [CONVERSA]);

  for (let i = 0; i < CAMINHOS.length; i++) {
    const evento = (
      await sql.query(
        `insert into core.evento (tipo, ator, origem, id_externo, versao_payload, payload)
         values ('mensagem_recebida','sistema','portao-f13',$1,1,'{}'::jsonb) returning id`,
        [`f13-msg-${randomUUID()}`],
      )
    ).rows[0].id;
    await sql.query(
      `insert into core.mensagem (id, conversa_id, evento_id, direcao, tipo_conteudo, corpo,
                                  criado_em, timestamp_origem, midia_caminho, midia_mime)
       values ($1,$2,$3,'entrada','imagem',$4, now(), now(), $5, 'image/png')`,
      [randomUUID(), CONVERSA, evento, `foto ${i}`, CAMINHOS[i]],
    );
  }
}

// ── 2 · usuário autenticado ─────────────────────────────────────────────────────────────────
const EMAIL = `portao-f13-${randomUUID().slice(0, 8)}@meescuta.local`;
const SENHA = "portao-f13-senha-forte-local";
const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: SENHA,
  email_confirm: true,
});
if (erroCriar) reprovar(`não consegui criar o usuário do portão: ${erroCriar.message}`);
const UID = criado.user.id;
const supabase = createClient(URL, ANON, { auth: { persistSession: false } });
const { error: erroLogin } = await supabase.auth.signInWithPassword({ email: EMAIL, password: SENHA });
if (erroLogin) reprovar(`não consegui autenticar: ${erroLogin.message}`);

async function encerrar(codigo) {
  await purgar();
  await admin.storage.from(BUCKET).remove(CAMINHOS).catch(() => {});
  await admin.auth.admin.deleteUser(UID).catch(() => {});
  await sql.end().catch(() => {});
  process.exit(codigo);
}

await purgar();
await prepararStorage();
await semear();

const { lerMensagens } = await import("../lib/dados/conversas.ts");
const { TTL_CACHE_SEG, TTL_ASSINATURA_SEG, MARGEM_SEG } = await import(
  "../lib/conversas/cache-midia.ts"
);

// ── 3 · MEDIÇÃO: a dedução da PESQUISA, agora medida ────────────────────────────────────────
// Assinar o MESMO caminho duas vezes devolve tokens diferentes? Se não devolver, o defeito que o
// item descreve não existe, e o portão precisa dizer isso em vez de aprovar um conserto inútil.
const assinada1 = (await admin.storage.from(BUCKET).createSignedUrls([CAMINHOS[0]], 3600)).data?.[0]
  ?.signedUrl;
await new Promise((r) => setTimeout(r, 1100)); // o token da Meta/GoTrue tem `iat` em segundos
const assinada2 = (await admin.storage.from(BUCKET).createSignedUrls([CAMINHOS[0]], 3600)).data?.[0]
  ?.signedUrl;
const assinaturaMuda = Boolean(assinada1 && assinada2 && assinada1 !== assinada2);

// CONTROLE NEGATIVO: o comportamento antigo — assinar a cada leitura, sem cache.
// As releituras são ESPAÇADAS de propósito. O token assinado carimba `iat` em SEGUNDOS: um laço
// apertado assina 12 vezes dentro do mesmo segundo e recebe a mesma string, então a medida
// mostraria "URL estável" mesmo com o cache desligado. Espaçar é o que faz a medida medir — sem
// isso a asserção (1) ficava verde com o cache desligado (medido: a mutação M1 sobrevivia).
const PASSO_MS = 150; // 12 × 150 ms ≈ 1,8 s: cobre mais de um segundo de relógio

const urlsSemCache = new Set();
for (let i = 0; i < RELEITURAS; i++) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(CAMINHOS, TTL_ASSINATURA_SEG);
  for (const a of data ?? []) if (a.signedUrl) urlsSemCache.add(a.signedUrl);
  await new Promise((r) => setTimeout(r, PASSO_MS));
}

// DEPOIS: N releituras pela lerMensagens real, no MESMO ritmo.
const urlsComCache = new Set();
let bolhasComUrl = 0;
for (let i = 0; i < RELEITURAS; i++) {
  const msgs = await lerMensagens(CONVERSA, supabase);
  for (const m of msgs) {
    if (m.midia_url) {
      urlsComCache.add(m.midia_url);
      if (i === 0) bolhasComUrl += 1;
    }
  }
  await new Promise((r) => setTimeout(r, PASSO_MS));
}

if (SO_NEGATIVO) {
  console.log("CONTROLE NEGATIVO (isolado) — assinar a cada leitura, sem cache:");
  console.log(`  ${RELEITURAS} releituras × ${CAMINHOS.length} fotos → ${urlsSemCache.size} URLs DISTINTAS`);
  console.log(`  com cache: ${urlsComCache.size} URLs distintas`);
  const acusou = assinaturaMuda && urlsSemCache.size > CAMINHOS.length;
  console.log(acusou ? "P1 OK — o defeito antigo é ACUSADO." : "P1 FALHOU — a URL já era estável.");
  await encerrar(acusou ? 0 : 1);
}

// ── 4 · VACUIDADE ───────────────────────────────────────────────────────────────────────────
if (bolhasComUrl < CAMINHOS.length)
  nok(
    `(0) vacuidade: só ${bolhasComUrl} de ${CAMINHOS.length} bolhas receberam URL assinada — ` +
      '"as URLs são idênticas" seria verdade vazia sobre nada',
  );
else ok(`(0) vacuidade: ${bolhasComUrl} bolhas com URL assinada de verdade, vindas da lerMensagens real`);

if (assinaturaMuda)
  ok("(0-bis) a dedução da PESQUISA está MEDIDA: assinar o mesmo caminho 2× devolve URLs diferentes");
else
  nok(
    "(0-bis) assinar o mesmo caminho 2× devolveu a MESMA URL — a premissa do item não se confirma " +
      "neste ambiente; o item encolhe para lazy + espaço reservado e isso tem de entrar no relatório",
  );

// ── 5 · MEDIDA ──────────────────────────────────────────────────────────────────────────────
if (urlsComCache.size === CAMINHOS.length)
  ok(
    `(1) ${RELEITURAS} releituras da MESMA thread → ${urlsComCache.size} URLs distintas ` +
      `(uma por foto). Sem cache seriam ${urlsSemCache.size}.`,
  );
else
  nok(
    `(1) ${RELEITURAS} releituras produziram ${urlsComCache.size} URLs distintas, esperava ` +
      `${CAMINHOS.length} — a foto continua sendo rebaixada a cada refresh`,
  );

{
  // Caractere a caractere, como a spec pede — com MAIS DE UM SEGUNDO entre as duas leituras.
  // A espera não é frescura: o token assinado carimba `iat` em segundos, então duas assinaturas
  // no mesmo segundo saem idênticas SEM cache nenhum. Sem a espera, esta asserção ficava verde
  // com o cache desligado (medido: a mutação M2 sobrevivia). Ela passava a testar a granularidade
  // do relógio, não o cache.
  const urlsDe = (msgs) => msgs.map((m) => m.midia_url).filter(Boolean);
  const a = urlsDe(await lerMensagens(CONVERSA, supabase));
  await new Promise((r) => setTimeout(r, 1100));
  const b = urlsDe(await lerMensagens(CONVERSA, supabase));
  // conta URLs DE VERDADE, não o tamanho da string juntada: com `join("|")`, três bolhas sem URL
  // viram "||", que tem comprimento 2 e passaria por "não vazio". Verde por separador.
  if (a.length === CAMINHOS.length && a.join("|") === b.join("|"))
    ok(`(2) duas releituras seguidas devolvem as ${a.length} URLs idênticas, caractere a caractere`);
  else
    nok(
      `(2) duas releituras seguidas devolveram conjuntos de URL diferentes ` +
        `(1ª tinha ${a.length} URLs, 2ª tinha ${b.length}, esperava ${CAMINHOS.length})`,
    );
}

{
  // depois do TTL do cache, a URL TEM de mudar — senão um dia entregamos assinatura vencida
  const antes = (await lerMensagens(CONVERSA, supabase)).map((m) => m.midia_url).filter(Boolean);
  const futuro = Date.now() + (TTL_CACHE_SEG + 5) * 1000;
  const depois = (await lerMensagens(CONVERSA, supabase, futuro)).map((m) => m.midia_url).filter(Boolean);
  const mudou = antes.length > 0 && depois.length === antes.length && depois.every((u, i) => u !== antes[i]);
  if (mudou) ok(`(3) passado o TTL do cache (${TTL_CACHE_SEG}s), a URL é reassinada — nenhuma vence na mão do cliente`);
  else nok(`(3) depois do TTL a URL NÃO mudou (antes=${antes.length}, depois=${depois.length})`);
}

if (TTL_CACHE_SEG < TTL_ASSINATURA_SEG && TTL_ASSINATURA_SEG - TTL_CACHE_SEG === MARGEM_SEG)
  ok(`(4) a margem existe e é a declarada: cache ${TTL_CACHE_SEG}s < assinatura ${TTL_ASSINATURA_SEG}s (${MARGEM_SEG}s de folga)`);
else nok(`(4) margem inválida: cache=${TTL_CACHE_SEG}s assinatura=${TTL_ASSINATURA_SEG}s margem=${MARGEM_SEG}s`);

// ── 6 · CONTROLE NEGATIVO ───────────────────────────────────────────────────────────────────
if (urlsSemCache.size > urlsComCache.size)
  ok(
    `(5) controle negativo: sem cache, ${RELEITURAS} releituras dão ${urlsSemCache.size} URLs ` +
      `distintas contra ${urlsComCache.size} com cache — ${urlsSemCache.size - urlsComCache.size} downloads a mais`,
  );
else
  nok(`(5) controle negativo não acusou — sem cache ${urlsSemCache.size}, com cache ${urlsComCache.size}`);

// ── 7 · PROVA ESTÁTICA: lazy e espaço reservado na bolha ───────────────────────────────────
const bolha = readFileSync(resolve(raiz, "components/conversas/bolha-imagem.tsx"), "utf8");
if (/loading="lazy"/.test(bolha)) ok('(6) a <img> tem loading="lazy" — a thread traz até 500 mensagens');
else nok('(6) a <img> não tem loading="lazy"');

if (/decoding="async"/.test(bolha)) ok('(7) a <img> tem decoding="async"');
else nok('(7) a <img> não tem decoding="async"');

if (/width=\{\d+\}/.test(bolha) && /height=\{\d+\}/.test(bolha))
  ok("(8) a <img> reserva espaço (width/height) — a foto que chega não empurra as vizinhas");
else nok("(8) a <img> não reserva espaço — cada foto que chega desloca a thread");

// degrade preservado: sem URL pré-assinada, a bolha continua caindo no caminho preguiçoso
if (/obterUrlMidia\(caminho\)/.test(bolha) && /não deu pra carregar a foto/.test(bolha))
  ok("(9) o degrade continua: sem URL em lote, a bolha busca sozinha; erro segue em PT-BR");
else nok("(9) o degrade da bolha foi perdido");

// ── 8 · veredito ────────────────────────────────────────────────────────────────────────────
console.log(`  MEDIDA antes×depois em ${RELEITURAS} releituras de ${CAMINHOS.length} fotos:`);
console.log(`    sem cache: ${urlsSemCache.size} URLs distintas (= downloads novos)`);
console.log(`    com cache: ${urlsComCache.size} URLs distintas`);
console.log("");
console.log(linhas.join("\n"));
console.log("");
if (falhas.length) {
  console.log(`PORTÃO F13 · VERMELHO — ${falhas.length} asserção(ões) falharam.`);
  await encerrar(1);
}
console.log("PORTÃO F13 · VERDE — vacuidade + premissa medida + medida (4) + controle negativo + prova estática.");
await encerrar(0);
