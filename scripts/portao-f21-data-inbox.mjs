// portao-f21-data-inbox.mjs — PORTÃO do F21 (Rodada 16, Agent 1 / Web-A).
//
// Julga uma afirmação só: a lista do inbox mostra e ordena pela hora em que a MENSAGEM existiu,
// não pela hora em que a LINHA foi gravada. O defeito original: o import do Kommo carimba
// `atualizado_em` de todas as conversas com "agora", e a caixa inteira passa a parecer nova.
//
// Exercita a `lerConversas` REAL (importada de lib/dados/conversas.ts, com o alias `@/` resolvido
// pelo portao-resolver), com um cliente Supabase AUTENTICADO de verdade — mesma consulta, mesmo
// RLS, mesmo mapeamento que a página usa. Nada de cópia da lógica.
//
// LOCAL, NUNCA PRODUÇÃO (ARB-09): a URL vem do .env.local e é recusada se não for 127.0.0.1.
//
// As três partes exigidas pela ARB-07:
//   VACUIDADE     — se o portão não semeou conversa, ou a lista voltou vazia, ou nenhuma conversa
//                   tinha mensagem, REPROVA. Um portão sobre lista vazia não julga nada.
//   CONTROLE NEG. — o defeito ORIGINAL é reencenado: com as conversas ordenadas/exibidas por
//                   `atualizado_em` (todas carimbadas "agora", como o import faz), as asserções
//                   TÊM de ficar vermelhas. Se ficarem verdes, elas não medem o que dizem medir.
//   MEDIDA        — para cada conversa semeada, a data exibida é conferida contra
//                   max(timestamp_origem) lido por SQL DIRETO (segundo caminho de leitura), e a
//                   ordem devolvida contra a ordem por ultima_entrada_em desc nulls last.
//
// Uso:  cd me-escuta-web && npm run portao:f21
//       npm run portao:f21 -- --negativo   (só o controle negativo, para inspeção)

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
  console.error(`\nPORTÃO F21 · RECUSADO — ${msg}`);
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
console.log("PORTÃO F21 · a lista do inbox datada pela hora da mensagem");
console.log(`  ALVO local · url=${URL}`);
console.log(`  cluster sid=${alvo.sid} · migrations=${alvo.migrations}`);
console.log("");

// ── 1 · o canal que faz `visivel_inbox` ser verdadeiro ──────────────────────────────────────
const canal = (
  await sql.query(
    `select phone_number_id, config_jsonb->>'inbox_desde' as desde
       from core.canal_whatsapp where ativo limit 1`,
  )
).rows[0];
if (!canal) reprovar("nenhum canal_whatsapp ativo — sem ele v_conversa.visivel_inbox é sempre falso.");
const PNID = canal.phone_number_id;

// ── 2 · semear conversas de IDADES DIFERENTES, que é o cenário do defeito ───────────────────
// `atualizado_em` de TODAS = agora (é o que o import do Kommo faz). As mensagens é que são
// antigas. Se a lista datar por atualizado_em, tudo parece de hoje — e é isso que o F21 conserta.
const MARCA = `f21-${randomUUID().slice(0, 8)}`;
const semeadas = [];

// [rótulo, dias atrás da última ENTRADA, dias atrás da última SAÍDA (null = não tem)]
const RECEITA = [
  ["seis-dias", 6, null],
  ["quatro-dias", 4, null],
  ["um-dia-e-meio", 1.5, null],
  ["saida-mais-nova", 5, 2], // última mensagem é NOSSA: a exibição usa ela, a ordem usa a entrada
  ["so-saida", null, 3], // nasceu de disparo: ultima_entrada_em é NULL
  ["sem-mensagem", null, null], // sem mensagem nenhuma: tem de exibir "sem data"
];

/** Mensagem com o evento de origem que o schema exige (mensagem.evento_id é NOT NULL + FK). */
async function inserirMensagem(convId, direcao, quandoIso, corpo) {
  const evento = (
    await sql.query(
      `insert into core.evento (tipo, ator, origem, id_externo, versao_payload, payload)
       values ($1,'sistema','portao-f21',$2,1,'{}'::jsonb) returning id`,
      [direcao === "entrada" ? "mensagem_recebida" : "mensagem_enviada", `${MARCA}-${randomUUID()}`],
    )
  ).rows[0].id;
  // `criado_em` = AGORA de propósito (é a hora em que "processamos"); `timestamp_origem` = a hora
  // real da mensagem. Assim o portão prova que a exibição usa a ORIGEM, não o processamento.
  await sql.query(
    `insert into core.mensagem (id, conversa_id, evento_id, direcao, tipo_conteudo, corpo,
                                criado_em, timestamp_origem)
     values ($1,$2,$3,$4,'texto',$5, now(), $6)`,
    [randomUUID(), convId, evento, direcao, `${MARCA} ${corpo}`, quandoIso],
  );
}

// Prefixo próprio do portão: é por ele que a limpeza acha o que É dela e não encosta no que é
// dos vizinhos (o stack local é compartilhado com os portões F5/F6).
const PREFIXO = "+5511921";

/**
 * Resíduo de execução interrompida (o processo pode morrer antes do encerrar). Limpa só as
 * PROJEÇÕES do prefixo do portão — os eventos ficam: o ledger é append-only por constituição
 * (`core.impedir_mutacao_ledger` recusa DELETE), e evento de portão no ledger local é rastro
 * honesto, não sujeira.
 */
async function purgar() {
  await sql.query(
    `delete from core.mensagem where conversa_id in
       (select id from core.conversa where telefone like $1)`,
    [`${PREFIXO}%`],
  );
  await sql.query("delete from core.conversa where telefone like $1", [`${PREFIXO}%`]);
}

async function semear() {
  for (const [rotulo, diasEntrada, diasSaida] of RECEITA) {
    const telefone = `${PREFIXO}${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
    // a conversa nasce pela PORTA de verdade (evento → projetor), como em produção: assim o
    // portão não inventa uma linha que o sistema nunca produziria.
    await sql.query("select porta.recebe_evento_externo($1::jsonb)", [
      JSON.stringify({
        tipo: "mensagem_recebida",
        ator: "sistema",
        origem: "portao-f21",
        id_externo: `${MARCA}-nasce-${randomUUID()}`,
        versao_payload: 1,
        payload: {
          conversa: { telefone, phone_number_id: PNID },
          tipo_conteudo: "texto",
          corpo: `${MARCA} nascimento ${rotulo}`,
        },
      }),
    ]);
    const convId = (await sql.query("select id::text from core.conversa where telefone = $1", [telefone]))
      .rows[0]?.id;
    if (!convId) reprovar(`a porta não criou a conversa ${rotulo} — o cenário não foi encenado`);

    // a mensagem do nascimento sai de cena: quem manda no cenário é a RECEITA
    await sql.query("delete from core.mensagem where conversa_id = $1", [convId]);

    const entradaEm =
      diasEntrada == null ? null : new Date(Date.now() - diasEntrada * 86400_000).toISOString();
    if (entradaEm) await inserirMensagem(convId, "entrada", entradaEm, `entrada ${rotulo}`);
    if (diasSaida != null) {
      const saidaEm = new Date(Date.now() - diasSaida * 86400_000).toISOString();
      await inserirMensagem(convId, "saida", saidaEm, `saida ${rotulo}`);
    }

    // o carimbo que a ORDEM usa, e o `atualizado_em` = agora que é o defeito original: o import
    // toca todas as linhas de uma vez, e é por isso que a caixa inteira parece nova.
    await sql.query(
      "update core.conversa set ultima_entrada_em = $2, atualizado_em = now() where id = $1",
      [convId, entradaEm],
    );
    semeadas.push({ rotulo, id: convId, telefone, entradaEm });
  }
}

async function limpar() {
  await purgar();
}

// ── 3 · usuário autenticado de verdade (a consulta roda sob o RLS dele) ─────────────────────
const EMAIL = `portao-f21-${randomUUID().slice(0, 8)}@meescuta.local`;
const SENHA = "portao-f21-senha-forte-local";
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
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
  await limpar();
  await admin.auth.admin.deleteUser(UID).catch(() => {});
  await sql.end().catch(() => {});
  process.exit(codigo);
}

// ── 4 · a verdade pelo SEGUNDO caminho de leitura (SQL direto, não o do produto) ────────────
async function verdadePorSql(ids) {
  const { rows } = await sql.query(
    `select c.id::text as id,
            c.ultima_entrada_em,
            (select max(coalesce(m.timestamp_origem, m.criado_em))
               from core.mensagem m where m.conversa_id = c.id) as ultima_msg_em
       from core.conversa c where c.id = any($1::uuid[])`,
    [ids],
  );
  return new Map(rows.map((r) => [r.id, r]));
}

const mesmoInstante = (a, b) => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return new Date(a).getTime() === new Date(b).getTime();
};

// ── 5 · as asserções, sobre a lista que o produto realmente devolve ─────────────────────────
// Recebe `datar` (como a UI decide a data) e `ordenar` para que o CONTROLE NEGATIVO possa trocar
// as duas pelo comportamento antigo e provar que as asserções ficam vermelhas.
async function medir({ datar, ordenar, rotuloDoModo }) {
  const { lerConversas } = await import("../lib/dados/conversas.ts");
  const todas = await lerConversas(supabase);
  const minhas = todas.filter((c) => semeadas.some((s) => s.id === c.id));
  const verdade = await verdadePorSql(semeadas.map((s) => s.id));

  const res = { exibicao: true, ordem: true, semGravacao: true, vistas: minhas.length };
  if (minhas.length === 0) return { ...res, exibicao: false, ordem: false, semGravacao: false };

  // (1) data exibida == max(timestamp_origem) das mensagens da conversa
  for (const c of minhas) {
    const v = verdade.get(c.id);
    const exibida = datar(c);
    const esperada = v?.ultima_msg_em ?? v?.ultima_entrada_em ?? null;
    if (!mesmoInstante(exibida, esperada)) {
      res.exibicao = false;
      res.porqueExibicao = `conversa ${c.telefone}: exibiu ${exibida ?? "—"}, SQL diz ${esperada ?? "—"}`;
      break;
    }
  }

  // (2) a ordem devolvida == ordem por ultima_entrada_em desc nulls last (desempate por id)
  const esperadaOrdem = [...minhas].sort((a, b) => {
    const va = verdade.get(a.id)?.ultima_entrada_em;
    const vb = verdade.get(b.id)?.ultima_entrada_em;
    const ta = va ? new Date(va).getTime() : null;
    const tb = vb ? new Date(vb).getTime() : null;
    if (ta == null && tb == null) return a.id < b.id ? -1 : 1;
    if (ta == null) return 1; // nulls last
    if (tb == null) return -1;
    return tb !== ta ? tb - ta : a.id < b.id ? -1 : 1;
  });
  const obtida = ordenar(minhas, verdade);
  res.ordem =
    obtida.length === esperadaOrdem.length && obtida.every((c, i) => c.id === esperadaOrdem[i].id);
  if (!res.ordem) {
    res.porqueOrdem =
      `obtida=[${obtida.map((c) => rotuloDe(c)).join(", ")}] ` +
      `esperada=[${esperadaOrdem.map((c) => rotuloDe(c)).join(", ")}]`;
  }

  // (3) conversa sem entrada NÃO exibe data de gravação
  const semEntrada = minhas.filter((c) => !verdade.get(c.id)?.ultima_entrada_em);
  for (const c of semEntrada) {
    const v = verdade.get(c.id);
    const exibida = datar(c);
    if (v?.ultima_msg_em) {
      // "só saída": tem de exibir a data da SAÍDA, não a de gravação
      if (!mesmoInstante(exibida, v.ultima_msg_em)) {
        res.semGravacao = false;
        res.porqueSemGravacao = `só-saída ${c.telefone} exibiu ${exibida ?? "—"} (esperado ${v.ultima_msg_em})`;
      }
    } else if (exibida != null) {
      // "sem mensagem": tem de exibir ausência — qualquer data aqui é a de gravação disfarçada
      res.semGravacao = false;
      res.porqueSemGravacao = `sem-mensagem ${c.telefone} exibiu ${exibida} em vez de nada`;
    }
  }
  res.modo = rotuloDoModo;
  return res;
}

function rotuloDe(c) {
  return semeadas.find((s) => s.id === c.id)?.rotulo ?? c.id.slice(0, 6);
}

// ── 6 · execução ────────────────────────────────────────────────────────────────────────────
await purgar(); // resíduo de execução anterior interrompida não pode contaminar a medida
await semear();
console.log(`  semeadas ${semeadas.length} conversas (marca ${MARCA})`);
console.log("");

const { dataDaLista } = await import("../lib/conversas/thread.ts");

// MODO PRODUTO: exatamente o que a UI faz — data por dataDaLista, ordem como o banco devolveu.
const produto = await medir({
  datar: (c) => dataDaLista(c),
  ordenar: (lista) => lista,
  rotuloDoModo: "produto",
});

// CONTROLE NEGATIVO: o defeito de antes do F21, reencenado — datar e ordenar por `atualizado_em`.
// Como o import carimba todas com "agora", isto TEM de reprovar. Se passar, as asserções mentem.
const antigo = await medir({
  datar: (c) => c.atualizado_em ?? null,
  ordenar: (lista) =>
    [...lista].sort(
      (a, b) => new Date(b.atualizado_em ?? 0).getTime() - new Date(a.atualizado_em ?? 0).getTime(),
    ),
  rotuloDoModo: "antigo (atualizado_em)",
});

if (SO_NEGATIVO) {
  console.log("CONTROLE NEGATIVO (isolado) — comportamento ANTIGO, datando por atualizado_em:");
  console.log(`  exibicao=${antigo.exibicao} ordem=${antigo.ordem} semGravacao=${antigo.semGravacao}`);
  const acusou = !antigo.exibicao || !antigo.semGravacao;
  console.log(acusou ? "P1 OK — o defeito antigo é ACUSADO." : "P1 FALHOU — o defeito passou verde.");
  await encerrar(acusou ? 0 : 1);
}

// ── 7 · VACUIDADE ───────────────────────────────────────────────────────────────────────────
const comMensagem = semeadas.filter((s) => s.rotulo !== "sem-mensagem").length;
if (semeadas.length < 4) nok(`(0) vacuidade: semeei só ${semeadas.length} conversas — não julga nada`);
else if (produto.vistas < semeadas.length)
  nok(`(0) vacuidade: a lista devolveu ${produto.vistas} das ${semeadas.length} semeadas`);
else if (comMensagem < 3) nok(`(0) vacuidade: só ${comMensagem} conversas com mensagem`);
else ok(`(0) vacuidade: ${produto.vistas} conversas semeadas E devolvidas pela lerConversas real`);

// ── 8 · MEDIDA ──────────────────────────────────────────────────────────────────────────────
if (produto.exibicao) ok("(1) data exibida == max(timestamp_origem) das mensagens, em todas");
else nok(`(1) data exibida diverge do SQL — ${produto.porqueExibicao}`);

if (produto.ordem) ok("(2) ordem devolvida == ultima_entrada_em desc nulls last (desempate por id)");
else nok(`(2) ordem diverge — ${produto.porqueOrdem}`);

if (produto.semGravacao) ok("(3) conversa sem entrada não exibe data de gravação");
else nok(`(3) data de gravação vazou — ${produto.porqueSemGravacao}`);

// ── 9 · CONTROLE NEGATIVO ───────────────────────────────────────────────────────────────────
if (!antigo.exibicao || !antigo.semGravacao)
  ok("(4) controle negativo: datar por atualizado_em REPROVA nas mesmas asserções");
else
  nok("(4) controle negativo passou verde — as asserções (1)/(3) não medem o que dizem medir");

// ── 10 · PROVA ESTÁTICA: atualizado_em não é mais argumento de tempoLista ───────────────────
const inbox = readFileSync(resolve(raiz, "components/conversas/inbox.tsx"), "utf8");
const chamadasRuins = [...inbox.matchAll(/tempoLista\(([^)]*)\)/g)]
  .map((m) => m[1].trim())
  .filter((arg) => /atualizado_em/.test(arg));
if (chamadasRuins.length === 0) ok("(5) nenhuma chamada de tempoLista recebe atualizado_em");
else nok(`(5) tempoLista ainda recebe atualizado_em: ${chamadasRuins.join(" | ")}`);

// O campo continua no SELECT da lista — é o que o tempo real usa pra detectar mudança, e trocar
// a ordenação é exatamente a hora em que alguém "limpa" o select e leva o gatilho junto.
// Olha o select DA CONSULTA, não o arquivo: `grep` de arquivo inteiro ficaria verde só porque a
// palavra sobrevive no tipo e no mapeamento — verde por presença de texto, não por comportamento.
const dados = readFileSync(resolve(raiz, "lib/dados/conversas.ts"), "utf8");
const selectDaLista = dados.match(/\.from\("v_conversa"\)[\s\S]{0,300}?\.select\("([^"]+)"\)/);
if (!selectDaLista) nok("(6) não achei o select de v_conversa — o portão não sabe mais o que olhar");
else if (selectDaLista[1].split(",").includes("atualizado_em"))
  ok("(6) atualizado_em preservado no select da lista (o tempo real usa como gatilho)");
else
  nok(`(6) atualizado_em sumiu do select da lista — select="${selectDaLista[1]}"`);

// ── 11 · veredito ───────────────────────────────────────────────────────────────────────────
console.log(linhas.join("\n"));
console.log("");
if (falhas.length) {
  console.log(`PORTÃO F21 · VERMELHO — ${falhas.length} asserção(ões) falharam.`);
  await encerrar(1);
}
console.log("PORTÃO F21 · VERDE — vacuidade + medida (3) + controle negativo + prova estática.");
await encerrar(0);
