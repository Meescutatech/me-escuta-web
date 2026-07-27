// medir-janela-fria-f5.mjs — MEDIÇÃO (não é portão), R16-06bis.
//
// Pergunta a responder, levantada pela verificação cruzada: quando `subscribe()` devolve
// SUBSCRIBED, o servidor JÁ está entregando? Ou existe uma janela em que o cliente diz que sim e
// o servidor ainda não tem assinatura nenhuma — janela em que o selo "ao vivo" mentiria?
//
// Duas leituras possíveis do vermelho observado no container ocioso:
//   (a) o portão tem orçamento de tempo curto no caminho a frio → problema de PORTÃO.
//   (b) há janela real entre SUBSCRIBED e a entrega → problema de PRODUTO (o selo mente).
// Só uma medida separa as duas, e é esta: carimbar t_subscribed, t_linha_no_servidor e t_evento
// no MESMO relógio, a frio e a quente.
//
// A condição "container ocioso" é encenada de forma determinística reiniciando o container do
// Realtime — esperar 36 minutos não é reproduzível, reiniciar é.
//
// Uso:  node --experimental-strip-types scripts/medir-janela-fria-f5.mjs [repeticoes]

import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { montarFontesConversa } from "../lib/tempo-real.ts";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const l of readFileSync(resolve(raiz, ".env.local"), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON } = env;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const DB = env.DATABASE_URL;
if (!/127\.0\.0\.1|localhost/.test(URL)) throw new Error("só local");

const CONTAINER_REALTIME = "supabase_realtime_db-r16-web-a";
const REPS = Number(process.argv[2] ?? 3);
const TETO_MS = 30_000;

const sql = new pg.Client({ connectionString: DB });
await sql.connect();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const EMAIL = `medicao-${randomUUID().slice(0, 8)}@meescuta.local`;
const SENHA = "medicao-senha-forte-local";
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { data: novo } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: SENHA,
  email_confirm: true,
});

const TELEFONE = "+5511950000001";
await sql.query("select porta.recebe_evento_externo($1::jsonb)", [
  JSON.stringify({
    tipo: "mensagem_recebida",
    ator: "sistema",
    origem: "medicao",
    id_externo: "medicao-abertura-" + randomUUID(),
    versao_payload: 1,
    payload: {
      conversa: { telefone: TELEFONE, phone_number_id: "MEDICAO" },
      tipo_conteudo: "texto",
      corpo: "conversa da medição",
    },
  }),
]);
const CONVERSA = (await sql.query("select id::text from core.conversa where telefone=$1", [TELEFONE]))
  .rows[0].id;
const FONTES = montarFontesConversa(CONVERSA);

async function contarAssinaturas() {
  const r = await sql.query(
    `select count(*)::int as n from realtime.subscription
      where entity::text in ('core.conversa','core.mensagem')`,
  );
  return r.rows[0].n;
}

async function gravar(marca) {
  await sql.query("select porta.recebe_evento_externo($1::jsonb)", [
    JSON.stringify({
      tipo: "mensagem_recebida",
      ator: "sistema",
      origem: "medicao",
      id_externo: "medicao-" + randomUUID(),
      versao_payload: 1,
      payload: {
        conversa: { telefone: TELEFONE, phone_number_id: "MEDICAO" },
        tipo_conteudo: "texto",
        corpo: `evento da medição ${marca}`,
      },
    }),
  ]);
}

/**
 * Uma rodada: assina como o app assina, e carimba no MESMO relógio
 *   t_sub    — quando o cliente disse SUBSCRIBED
 *   t_linha  — quando a linha apareceu em realtime.subscription (evidência do SERVIDOR)
 *   t_evento — quando o primeiro evento chegou ao callback, para uma escrita feita em t_sub
 */
async function umaRodada(rotulo) {
  const cli = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: s } = await cli.auth.signInWithPassword({ email: EMAIL, password: SENHA });
  cli.realtime.setAuth(s.session.access_token);

  const t0 = Date.now();
  let tSub = null;
  const chegadas = [];
  const status = new Map();
  for (const f of FONTES) {
    const nome = `pg:${f.tabela.schema}.${f.tabela.table}:${f.tabela.filter ?? "*"}`;
    cli
      .channel(nome)
      .on(
        "postgres_changes",
        { event: "*", schema: f.tabela.schema, table: f.tabela.table, filter: f.tabela.filter },
        (msg) => chegadas.push({ em: Date.now(), corpo: msg?.new?.corpo ?? null }),
      )
      .subscribe((st) => status.set(nome, st));
  }

  while (Date.now() - t0 < TETO_MS) {
    if (status.size === FONTES.length && [...status.values()].every((x) => x === "SUBSCRIBED")) {
      tSub = Date.now();
      break;
    }
    await espera(5);
  }
  if (tSub === null) {
    await cli.removeAllChannels();
    await cli.realtime.disconnect();
    return { rotulo, erro: `não chegou a SUBSCRIBED em ${TETO_MS} ms (${[...status.values()].join("/") || "sem status"})` };
  }

  // no INSTANTE do SUBSCRIBED: o servidor já tem assinatura? (a pergunta central)
  const nNoSubscribed = await contarAssinaturas();

  // ESCRITA 1 — sai AGORA, como sairia se o app confiasse no SUBSCRIBED.
  const marcaJanela = "JANELA-" + randomUUID().slice(0, 8);
  await gravar(marcaJanela);

  // espera a EVIDÊNCIA DO SERVIDOR aparecer
  let tLinha = null;
  while (tLinha === null && Date.now() - tSub < TETO_MS) {
    if ((await contarAssinaturas()) > 0) tLinha = Date.now();
    else await espera(10);
  }

  // ESCRITA 2 — depois da evidência do servidor. Separa "perdida na janela" de "canal morto".
  const marcaDepois = "DEPOIS-" + randomUUID().slice(0, 8);
  const tEscrita2 = Date.now();
  await gravar(marcaDepois);
  while (
    !chegadas.some((c) => (c.corpo ?? "").includes(marcaDepois)) &&
    Date.now() - tEscrita2 < 10_000
  )
    await espera(10);

  // dá mais folga para a escrita 1 aparecer atrasada, se for o caso
  await espera(1500);

  const c1 = chegadas.find((c) => (c.corpo ?? "").includes(marcaJanela));
  const c2 = chegadas.find((c) => (c.corpo ?? "").includes(marcaDepois));

  await cli.removeAllChannels();
  await cli.realtime.disconnect();
  return {
    rotulo,
    subMs: tSub - t0,
    nNoSubscribed,
    linhaAposSubMs: tLinha === null ? null : tLinha - tSub,
    janelaEntregue: c1 ? c1.em - tSub : null,
    depoisEntregue: c2 ? c2.em - tEscrita2 : null,
  };
}

function linha(r) {
  if (r.erro) return `${r.rotulo.padEnd(14)} ERRO: ${r.erro}`;
  const n = (v) => (v === null ? " PERDIDA" : `${String(v).padStart(6)}ms`);
  return (
    `${r.rotulo.padEnd(14)} SUBSCRIBED +${String(r.subMs).padStart(5)}ms · ` +
    `assinaturas no servidor nesse instante: ${r.nNoSubscribed} · ` +
    `linha do servidor +${n(r.linhaAposSubMs)} · ` +
    `escrita NA JANELA: ${n(r.janelaEntregue)} · escrita DEPOIS: ${n(r.depoisEntregue)}`
  );
}

console.log("MEDIÇÃO R16-06bis — a janela entre SUBSCRIBED (cliente) e entrega (servidor)");
console.log(`  container do realtime: ${CONTAINER_REALTIME} · ${REPS} repetição(ões) de cada caso`);
console.log("");

const resultados = [];
for (let i = 1; i <= REPS; i++) {
  console.log(`— reinicia o Realtime (encena o container frio) — rodada ${i}`);
  execFileSync("docker", ["restart", CONTAINER_REALTIME], { stdio: "ignore" });
  // espera só o container aceitar conexão; NÃO espera ele "aquecer" — é isso que se quer medir
  const t = Date.now();
  while (Date.now() - t < 90_000) {
    try {
      const r = await fetch(`${URL}/realtime/v1/api/ping`, { headers: { apikey: ANON } });
      if (r.status < 500) break;
    } catch {
      /* ainda subindo */
    }
    await espera(200);
  }
  const frio = await umaRodada(`frio #${i}`);
  resultados.push(frio);
  console.log("  " + linha(frio));

  // QUENTE de verdade: ciclos seguidos, sem restart no meio
  for (let k = 1; k <= 2; k++) {
    const q = await umaRodada(`quente ${i}.${k}`);
    resultados.push(q);
    console.log("  " + linha(q));
  }
  console.log("");
}

const frios = resultados.filter((r) => r.rotulo.startsWith("frio") && !r.erro);
const quentes = resultados.filter((r) => r.rotulo.startsWith("quente") && !r.erro);
const todos = [...frios, ...quentes];
const conta = (xs, f) => `${xs.filter(f).length}/${xs.length}`;
const piorLinha = todos.length
  ? Math.max(...todos.map((r) => r.linhaAposSubMs ?? 0))
  : NaN;

console.log("VEREDITO");
console.log(`  SUBSCRIBED com ZERO assinatura no servidor — frio: ${conta(frios, (r) => r.nNoSubscribed === 0)} · quente: ${conta(quentes, (r) => r.nNoSubscribed === 0)}`);
console.log(`  escrita feita NA JANELA (logo após SUBSCRIBED) PERDIDA — frio: ${conta(frios, (r) => r.janelaEntregue === null)} · quente: ${conta(quentes, (r) => r.janelaEntregue === null)}`);
console.log(`  escrita feita DEPOIS da linha do servidor entregue — frio: ${conta(frios, (r) => r.depoisEntregue !== null)} · quente: ${conta(quentes, (r) => r.depoisEntregue !== null)}`);
console.log(`  pior atraso da linha do servidor após SUBSCRIBED: ${piorLinha} ms`);
console.log("");
console.log("  LEITURA (a): se a janela some quando o container está quente, o problema é do PORTÃO");
console.log("               (orçamento curto no caminho a frio) e se resolve com aquecimento.");
console.log("  LEITURA (b): se a escrita NA JANELA se perde mesmo a quente, SUBSCRIBED do cliente NÃO");
console.log("               é evidência de entrega — e o selo 'ao vivo' não pode acender só com ele.");

await sql.end();
await admin.auth.admin.deleteUser(novo.user.id).catch(() => {});
process.exit(0);
