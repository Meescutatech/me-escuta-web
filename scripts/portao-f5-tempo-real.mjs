// portao-f5-tempo-real.mjs — PORTÃO do F5 (Rodada 16, Agent 1 / Web-A).
//
// Julga o conserto do tempo real do inbox: postgres_changes em canal PRÓPRIO, status de
// subscribe() propagado, e o selo só diz "ao vivo" quando há assinatura confirmada.
//
// LOCAL, NUNCA PRODUÇÃO. A URL é lida do .env.local e RECUSADA se não for 127.0.0.1/localhost
// (ARB-09: portão automatizado não fala com produção). O alvo é IMPRESSO antes de qualquer
// asserção, com system_identifier e nº de migrations — o padrão do wrapper `db`
// (specs-noite/AMBIENTE-PSQL.md §5, guarda G1): declarar a fonte, não torcer para acertar.
//
// As três partes exigidas pela ARB-07 para todo portão de contagem:
//   VACUIDADE       — se o portão não observou evento nenhum, ele REPROVA em vez de passar vazio.
//   CONTROLE NEG.   — com a política de realtime.messages derrubada, a fiação ANTIGA (canal
//                     privado + postgres_changes no MESMO canal) TEM de morrer. Se ela sobreviver,
//                     o portão não está medindo nada e REPROVA.
//   MEDIDA          — a fiação NOVA entrega uma mensagem_recebida real em < 3000 ms.
//
// Uso:  cd ~/Developer/me-escuta/me-escuta-web && node scripts/portao-f5-tempo-real.mjs

import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { erroLegivel } from "./erro-legivel.mjs";
import { montarFontesConversa } from "../lib/tempo-real.ts";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "..");

const LIMITE_ENTREGA_MS = 3000;
const ESPERA_ASSINATURA_MS = 8000;
// R16-06bis: o cliente diz SUBSCRIBED em ~40 ms, mas o SERVIDOR pode levar até ~1,9 s para ter a
// assinatura, e escrita feita nessa janela SE PERDE. Portão de deploy roda UMA vez, a frio, então
// ele NÃO pode começar a contar os 3 s no SUBSCRIBED — conta a partir da evidência do servidor.
// Tudo o que ele espera é limitado e IMPRESSO. Nunca há retry silencioso até passar.
const ESPERA_EVIDENCIA_SERVIDOR_MS = 15_000;
const ESPERA_REALTIME_DE_PE_MS = 60_000;

// ── 0 · ambiente declarado, nunca herdado ───────────────────────────────────────────────────
function lerEnvLocal() {
  const env = {};
  try {
    for (const linha of readFileSync(resolve(raiz, ".env.local"), "utf8").split("\n")) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    reprovar("não achei .env.local — o portão não adivinha alvo (E-009).");
  }
  return env;
}

const falhas = [];
const linhas = [];
function ok(msg) {
  linhas.push(`  VERDE   · ${msg}`);
}
function nok(msg) {
  linhas.push(`  VERMELHO· ${msg}`);
  falhas.push(msg);
}
function reprovar(msg) {
  console.error(`\nPORTÃO F5 · RECUSADO — ${msg}`);
  process.exit(2);
}

const env = lerEnvLocal();
const URL = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB = env.DATABASE_URL ?? "";

for (const [nome, v] of [
  ["NEXT_PUBLIC_SUPABASE_URL", URL],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE],
  ["DATABASE_URL", DB],
]) {
  if (!v) reprovar(`${nome} ausente no .env.local.`);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL))
  reprovar(`alvo não é local: ${URL}. Portão automatizado NÃO fala com produção (ARB-09).`);
if (!/@(127\.0\.0\.1|localhost):/.test(DB))
  reprovar(`DATABASE_URL não é local. Portão automatizado NÃO fala com produção (ARB-09).`);

const cliente = new pg.Client({ connectionString: DB });
await cliente.connect();
const { rows: alvo } = await cliente.query(
  `select system_identifier::text as sid,
          (select count(*) from supabase_migrations.schema_migrations)::int as migrations,
          inet_server_port() as porta
     from pg_control_system()`,
);
console.log("PORTÃO F5 · tempo real do inbox");
console.log(`  ALVO local · url=${URL}`);
console.log(`  cluster sid=${alvo[0].sid} · migrations=${alvo[0].migrations}`);
console.log("");

// ── 1 · as fontes que o inbox monta não abrem canal privado ─────────────────────────────────
// A conversa é REAL: o critério de aceite fala da "conversa aberta", então o canal filtrado por
// conversa_id precisa apontar para uma linha que existe, senão a asserção (3) só exercita a lista.
const TELEFONE_ABERTA = "+5511970000001";
await cliente.query("select porta.recebe_evento_externo($1::jsonb)", [
  JSON.stringify({
    tipo: "mensagem_recebida",
    ator: "sistema",
    origem: "portao-f5",
    id_externo: "portao-f5-abertura-" + randomUUID(),
    versao_payload: 1,
    payload: {
      conversa: { telefone: TELEFONE_ABERTA, phone_number_id: "PORTAO_F5" },
      tipo_conteudo: "texto",
      corpo: "conversa aberta do portão F5",
    },
  }),
]);
const CONVERSA_ABERTA = (
  await cliente.query("select id::text from core.conversa where telefone = $1", [TELEFONE_ABERTA])
).rows[0]?.id;
if (!CONVERSA_ABERTA) reprovar("não consegui semear a conversa aberta pela porta.");

const fontes = montarFontesConversa(CONVERSA_ABERTA);
const fontesSemConversa = montarFontesConversa(null);
const CANAL_LISTA = "pg:core.conversa:*";
const CANAL_THREAD = `pg:core.mensagem:conversa_id=eq.${CONVERSA_ABERTA}`;

const comCanal = fontes.filter((f) => f.canal);
const comAmbos = fontes.filter((f) => f.canal && f.tabela);
if (comCanal.length === 0) ok(`(1) nenhuma fonte do inbox abre canal privado — ${fontes.length} fonte(s), todas postgres_changes`);
else nok(`(1) ${comCanal.length} fonte(s) ainda declaram 'canal' (canal privado morre sem política em realtime.messages)`);
if (comAmbos.length > 0) nok(`(1) ${comAmbos.length} fonte(s) declaram 'canal' E 'tabela' na MESMA entrada — é o defeito original`);

const tabelas = fontes.map((f) => `${f.tabela?.schema}.${f.tabela?.table}`).sort();
if (tabelas.join(",") === "core.conversa,core.mensagem")
  ok(`(1) fontes cobrem exatamente core.conversa + core.mensagem`);
else nok(`(1) fontes cobrem [${tabelas.join(", ")}] — esperava core.conversa + core.mensagem`);
if (fontesSemConversa.length === 1 && fontesSemConversa[0].tabela?.table === "conversa")
  ok(`(1) sem conversa aberta, só a lista é assinada`);
else nok(`(1) sem conversa aberta as fontes deveriam ser só core.conversa`);

// ── infra comum ─────────────────────────────────────────────────────────────────────────────
const EMAIL = "portao-f5@meescuta.local";
const SENHA = "portao-f5-" + "senha-forte-local";

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
await admin.auth.admin.createUser({ email: EMAIL, password: SENHA, email_confirm: true });
const login = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: sessao, error: erroLogin } = await login.auth.signInWithPassword({
  email: EMAIL,
  password: SENHA,
});
if (erroLogin) reprovar(`login local falhou: ${erroLegivel(erroLogin)}`);
const TOKEN = sessao.session.access_token;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Assina as fontes EXATAMENTE como components/projecao-viva.ts assina: um canal por fonte. */
function assinarComoOApp(cli, fontesEfetivas, aoEvento) {
  const status = new Map();
  const canais = [];
  for (const f of fontesEfetivas) {
    const nome = f.canal ?? `pg:${f.tabela.schema}.${f.tabela.table}:${f.tabela.filter ?? "*"}`;
    let c = cli.channel(nome, f.canal ? { config: { private: true } } : undefined);
    if (f.canal) c = c.on("broadcast", { event: "*" }, () => aoEvento(nome));
    if (f.tabela)
      c = c.on(
        "postgres_changes",
        { event: "*", schema: f.tabela.schema, table: f.tabela.table, filter: f.tabela.filter },
        () => aoEvento(nome),
      );
    canais.push(c.subscribe((s, err) => status.set(nome, err ? `${s} :: ${err.message}` : s)));
  }
  return { status, canais };
}

/** A fiação ANTIGA (25a3855): canal privado com nome E postgres_changes pendurados no MESMO canal. */
function assinarComoOAppAntigo(cli, aoEvento) {
  const status = new Map();
  const c = cli
    .channel("conversas", { config: { private: true } })
    .on("broadcast", { event: "*" }, aoEvento)
    .on("postgres_changes", { event: "*", schema: "core", table: "conversa" }, aoEvento)
    .subscribe((s, err) => status.set("conversas", err ? `${s} :: ${err.message}` : s));
  return { status, canais: [c] };
}

async function esperarStatus(status, quantos, limiteMs) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (status.size >= quantos && [...status.values()].every((s) => s === "SUBSCRIBED")) return true;
    if ([...status.values()].some((s) => s.startsWith("CHANNEL_ERROR") || s.startsWith("TIMED_OUT")))
      return false;
    await espera(100);
  }
  return false;
}

let seqTelefone = 0;
/** Grava uma mensagem_recebida pela porta. Sem argumento, numa conversa nova. */
async function gravarMensagemRecebida(telefoneAlvo) {
  seqTelefone += 1;
  const telefone = telefoneAlvo ?? `+551190000${String(1000 + seqTelefone).slice(-4)}`;
  await cliente.query("select porta.recebe_evento_externo($1::jsonb)", [
    JSON.stringify({
      tipo: "mensagem_recebida",
      ator: "sistema",
      origem: "portao-f5",
      id_externo: "portao-f5-" + randomUUID(),
      versao_payload: 1,
      payload: {
        conversa: { telefone, phone_number_id: "PORTAO_F5" },
        tipo_conteudo: "texto",
        corpo: "mensagem do portão F5",
      },
    }),
  ]);
}

/** Maior id já existente: tudo acima disto foi criado DEPOIS deste ponto. */
async function marcaDeAssinaturas() {
  const { rows } = await cliente.query(
    "select coalesce(max(id), 0)::bigint::text as m from realtime.subscription",
  );
  return rows[0].m;
}

/**
 * Assinaturas criadas DEPOIS da marca — evidência de que o SERVIDOR registrou as MINHAS, e não
 * contagem de linhas velhas de outro cliente (foi assim que a medição se confundiu antes).
 */
async function contarAssinaturas(marca) {
  const { rows } = await cliente.query(
    `select count(*)::int as n from realtime.subscription
      where entity::text in ('core.conversa','core.mensagem') and id > $1::bigint`,
    [marca],
  );
  return rows[0].n;
}

/** Espera LIMITADA pela evidência do servidor. Devolve {n, ms} ou {n:0} no teto. */
async function esperarEvidenciaServidor(marca, quantas) {
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < ESPERA_EVIDENCIA_SERVIDOR_MS) {
    n = await contarAssinaturas(marca);
    if (n >= quantas) return { n, ms: Date.now() - t0 };
    await espera(50);
  }
  return { n, ms: Date.now() - t0 };
}

/**
 * O Realtime aceita conexão? Espera LIMITADA e IMPRESSA — um container recém-subido responde
 * CLOSED e nada disso é culpa do código que o portão julga.
 */
async function esperarRealtimeDePe() {
  const t0 = Date.now();
  let ultimo = "(sem resposta)";
  while (Date.now() - t0 < ESPERA_REALTIME_DE_PE_MS) {
    try {
      const r = await fetch(`${URL}/realtime/v1/api/ping`, { headers: { apikey: ANON } });
      ultimo = String(r.status);
      if (r.status < 500) return { pronto: true, ms: Date.now() - t0, ultimo };
    } catch (e) {
      ultimo = String(e?.cause?.code ?? e?.message ?? e);
    }
    await espera(250);
  }
  return { pronto: false, ms: Date.now() - t0, ultimo };
}

async function politicaBroadcast(ligar) {
  if (ligar)
    await cliente.query(`do $$ begin
      if not exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages'
                       and policyname='staff_recebe_broadcast') then
        create policy staff_recebe_broadcast on realtime.messages
          for select to authenticated using (realtime.messages.extension = 'broadcast');
      end if; end $$;`);
  else await cliente.query("drop policy if exists staff_recebe_broadcast on realtime.messages");
}

const tinhaPolitica =
  (
    await cliente.query(
      `select count(*)::int as n from pg_policies
        where schemaname='realtime' and tablename='messages' and policyname='staff_recebe_broadcast'`,
    )
  ).rows[0].n > 0;

let entregasNovas = 0;
let entregasAntigas = 0;

try {
  // ── 1-bis · o Realtime está de pé? (espera LIMITADA e impressa, nunca retry silencioso) ────
  {
    const pe = await esperarRealtimeDePe();
    if (pe.pronto) ok(`(0) Realtime aceitou conexão após ${pe.ms} ms de espera (teto ${ESPERA_REALTIME_DE_PE_MS} ms)`);
    else {
      nok(`(0) Realtime não respondeu em ${ESPERA_REALTIME_DE_PE_MS} ms (última resposta: ${pe.ultimo}) — ambiente, não código`);
    }
  }

  // ── 2 · CONTROLE NEGATIVO ─────────────────────────────────────────────────────────────────
  // Sem política em realtime.messages, a fiação ANTIGA tem de perder o postgres_changes junto
  // com o canal privado. Se ela sobreviver aqui, este portão não mede nada.
  await politicaBroadcast(false);
  {
    const cli = createClient(URL, ANON, { auth: { persistSession: false } });
    cli.realtime.setAuth(TOKEN);
    const antigo = assinarComoOAppAntigo(cli, () => {
      entregasAntigas += 1;
    });
    const subiu = await esperarStatus(antigo.status, 1, ESPERA_ASSINATURA_MS);
    const st = antigo.status.get("conversas") ?? "(sem status)";
    if (!subiu && st.startsWith("CHANNEL_ERROR"))
      ok(`(controle negativo) fiação ANTIGA morre sem política: ${st}`);
    else nok(`(controle negativo) fiação ANTIGA deveria morrer sem política, mas deu "${st}" — o portão não está medindo`);

    await gravarMensagemRecebida();
    await espera(LIMITE_ENTREGA_MS);
    if (entregasAntigas === 0)
      ok(`(controle negativo) fiação ANTIGA: 0 evento(s) — o postgres_changes cai junto com o canal privado`);
    else nok(`(controle negativo) fiação ANTIGA entregou ${entregasAntigas} evento(s); o defeito não foi reproduzido`);
    await cli.removeAllChannels();
    await cli.realtime.disconnect();
  }

  // ── 3 · a fiação NOVA, no MESMO ambiente hostil ───────────────────────────────────────────
  {
    const marca = await marcaDeAssinaturas();
    const cli = createClient(URL, ANON, { auth: { persistSession: false } });
    cli.realtime.setAuth(TOKEN);
    const porCanal = new Map();
    const novo = assinarComoOApp(cli, fontes, (nome) => {
      entregasNovas += 1;
      porCanal.set(nome, (porCanal.get(nome) ?? 0) + 1);
    });
    const subiu = await esperarStatus(novo.status, fontes.length, ESPERA_ASSINATURA_MS);
    const st = [...novo.status.entries()].map(([n, s]) => `${n}=${s}`).join(" · ");
    if (subiu) ok(`(2) todos os ${fontes.length} canais SUBSCRIBED sem política de broadcast · ${st}`);
    else nok(`(2) nem todos os canais subiram · ${st}`);

    // (4) EVIDÊNCIA DO SERVIDOR — e é ela, não o SUBSCRIBED, que abre a contagem dos 3 s.
    const ev = await esperarEvidenciaServidor(marca, fontes.length);
    if (ev.n >= fontes.length)
      ok(`(4) realtime.subscription registrou as ${ev.n} assinaturas DESTE cliente ${ev.ms} ms após o SUBSCRIBED`);
    else
      nok(`(4) o servidor não registrou as assinaturas em ${ESPERA_EVIDENCIA_SERVIDOR_MS} ms (achei ${ev.n} de ${fontes.length}) — SUBSCRIBED sem assinatura no servidor`);
    if (ev.ms > 0)
      console.log(`  (nota) janela SUBSCRIBED → assinatura no servidor: ${ev.ms} ms. Escrita feita nessa janela se PERDE; por isso o selo só acende com evidência, e o portão só conta os ${LIMITE_ENTREGA_MS} ms a partir daqui.`);

    // (3a) mensagem nova NA CONVERSA ABERTA → o canal filtrado por conversa_id tem de acender.
    entregasNovas = 0;
    porCanal.clear();
    let t0 = Date.now();
    await gravarMensagemRecebida(TELEFONE_ABERTA);
    while ((porCanal.get(CANAL_THREAD) ?? 0) === 0 && Date.now() - t0 < LIMITE_ENTREGA_MS)
      await espera(25);
    let ms = Date.now() - t0;
    if ((porCanal.get(CANAL_THREAD) ?? 0) > 0 && ms < LIMITE_ENTREGA_MS)
      ok(`(3a) mensagem na CONVERSA ABERTA chegou ao canal filtrado em ${ms} ms (< ${LIMITE_ENTREGA_MS} ms)`);
    else
      nok(
        `(3a) a mensagem da conversa aberta NÃO chegou ao canal ${CANAL_THREAD} em ${LIMITE_ENTREGA_MS} ms`,
      );

    // (3b) conversa nova (outra linha em core.conversa) → o canal da LISTA tem de acender.
    porCanal.clear();
    t0 = Date.now();
    await gravarMensagemRecebida();
    while ((porCanal.get(CANAL_LISTA) ?? 0) === 0 && Date.now() - t0 < LIMITE_ENTREGA_MS)
      await espera(25);
    ms = Date.now() - t0;
    if ((porCanal.get(CANAL_LISTA) ?? 0) > 0 && ms < LIMITE_ENTREGA_MS)
      ok(`(3b) mudança em core.conversa chegou ao canal da lista em ${ms} ms (< ${LIMITE_ENTREGA_MS} ms)`);
    else nok(`(3b) a mudança da lista NÃO chegou ao canal ${CANAL_LISTA} em ${LIMITE_ENTREGA_MS} ms`);

    // VACUIDADE — o portão precisa ter observado alguma coisa para poder dizer verde.
    if (entregasNovas > 0 && ev.n > 0)
      ok(`(vacuidade) o portão observou ${entregasNovas} evento(s) e ${ev.n} assinatura(s) do próprio cliente — não passou vazio`);
    else nok(`(vacuidade) o portão não observou evento nem assinatura; verde aqui seria falso`);

    await cli.removeAllChannels();
    await cli.realtime.disconnect();
  }
} finally {
  await politicaBroadcast(tinhaPolitica);
  const restaurada = (
    await cliente.query(
      `select count(*)::int as n from pg_policies
        where schemaname='realtime' and tablename='messages' and policyname='staff_recebe_broadcast'`,
    )
  ).rows[0].n;
  console.log("");
  console.log(
    `  (higiene) política staff_recebe_broadcast: antes=${tinhaPolitica ? 1 : 0} depois=${restaurada}`,
  );
  await cliente.end();
}

console.log("");
for (const l of linhas) console.log(l);
console.log("");
if (falhas.length > 0) {
  console.log(`PORTÃO F5 · VERMELHO — ${falhas.length} asserção(ões) falharam.`);
  process.exit(1);
}
console.log("PORTÃO F5 · VERDE — 4/4 asserções + evidência de servidor + controle negativo + vacuidade.");
process.exit(0);
