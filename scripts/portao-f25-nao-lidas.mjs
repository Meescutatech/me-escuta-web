// portao-f25-nao-lidas.mjs — PORTÃO do F25 (Rodada 16, Agent 1 / Web-A).
//
// Julga: o contador de não-lidas da barra lateral custa uma consulta ESTREITA em vez da leitura
// inteira do inbox — e continua dando EXATAMENTE o mesmo número da lista.
//
// O defeito: `lerContadoresSidebar` fazia `lerConversas().filter(c => c.nao_lida).length`, ou seja
// 50 conversas + join de leads em v_lead_card + 800 mensagens de prévia + config do funil, para
// produzir UM número. E a barra lateral vive no layout: /funil, /tarefas e /configuracoes pagavam
// a leitura do inbox sem mostrar o inbox, de novo a cada router.refresh().
//
// Duas medições, duas técnicas, porque as afirmações são de naturezas diferentes:
//   · CLIENTE FALSO QUE CONTA — prova o que o código PEDE ao banco (tabelas, colunas, payload).
//     Nenhum resultado provaria isso: duas implementações devolvem o mesmo número lendo 70 KiB ou 2.
//   · BANCO REAL, autenticado — prova que o número não mudou, contra a lista de verdade.
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
//   VACUIDADE     — se não houver conversa não-lida E lida no cenário, REPROVA: um contador que
//                   devolve 0 num banco vazio bate com qualquer implementação, inclusive errada.
//   CONTROLE NEG. — a implementação ANTIGA (ler o inbox inteiro e filtrar) é reencenada no mesmo
//                   cliente falso: ela TEM de ler v_lead_card e `corpo` e trafegar muito mais.
//                   Se a antiga e a nova medirem igual, a medida não mede.
//   MEDIDA        — o par antes/depois em requisições e bytes, e a igualdade dos dois números
//                   contra o banco real.
//
// Uso:  cd me-escuta-web && npm run portao:f25
//       npm run portao:f25 -- --negativo

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
  console.error(`\nPORTÃO F25 · RECUSADO — ${msg}`);
  process.exit(2);
}
const SO_NEGATIVO = process.argv.includes("--negativo");

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
console.log("PORTÃO F25 · contador de não-lidas por consulta estreita");
console.log(`  ALVO local · url=${URL}`);
console.log(`  cluster sid=${alvo.sid} · migrations=${alvo.migrations}`);
console.log("");

const canal = (await sql.query("select phone_number_id from core.canal_whatsapp where ativo limit 1")).rows[0];
if (!canal) reprovar("nenhum canal_whatsapp ativo — sem ele v_conversa.visivel_inbox é sempre falso.");
const PNID = canal.phone_number_id;

// ── 1 · cenário com AS DUAS classes (não-lida e lida) ───────────────────────────────────────
const PREFIXO = "+5511923";
const NAO_LIDAS = 7; // última mensagem é de ENTRADA
const LIDAS = 5; // última mensagem é de SAÍDA

async function purgar() {
  await sql.query(
    `delete from core.mensagem where conversa_id in
       (select id from core.conversa where telefone like $1)`,
    [`${PREFIXO}%`],
  );
  await sql.query("delete from core.conversa where telefone like $1", [`${PREFIXO}%`]);
}

async function inserirMensagem(convId, direcao, quandoIso, corpo) {
  const evento = (
    await sql.query(
      `insert into core.evento (tipo, ator, origem, id_externo, versao_payload, payload)
       values ($1,'sistema','portao-f25',$2,1,'{}'::jsonb) returning id`,
      [direcao === "entrada" ? "mensagem_recebida" : "mensagem_enviada", `f25-${randomUUID()}`],
    )
  ).rows[0].id;
  await sql.query(
    `insert into core.mensagem (id, conversa_id, evento_id, direcao, tipo_conteudo, corpo,
                                criado_em, timestamp_origem)
     values ($1,$2,$3,$4,'texto',$5, now(), $6)`,
    [randomUUID(), convId, evento, direcao, corpo, quandoIso],
  );
}

async function semear() {
  const total = NAO_LIDAS + LIDAS;
  for (let i = 0; i < total; i++) {
    const telefone = `${PREFIXO}${String(i).padStart(6, "0")}`;
    await sql.query("select porta.recebe_evento_externo($1::jsonb)", [
      JSON.stringify({
        tipo: "mensagem_recebida",
        ator: "sistema",
        origem: "portao-f25",
        id_externo: `f25-${randomUUID()}`,
        versao_payload: 1,
        payload: {
          conversa: { telefone, phone_number_id: PNID },
          tipo_conteudo: "texto",
          corpo: "nascimento f25",
        },
      }),
    ]);
    const id = (await sql.query("select id::text from core.conversa where telefone = $1", [telefone]))
      .rows[0]?.id;
    if (!id) reprovar(`a porta não criou a conversa #${i}`);
    await sql.query("delete from core.mensagem where conversa_id = $1", [id]);

    const base = Date.now() - (i + 1) * 3600_000;
    // corpo LONGO de propósito: é ele que faz a leitura antiga pesar, e o que a estreita não lê
    const recheio = "x".repeat(400);
    await inserirMensagem(id, "entrada", new Date(base).toISOString(), `entrada ${i} ${recheio}`);
    if (i >= NAO_LIDAS) {
      // última é SAÍDA → lida
      await inserirMensagem(id, "saida", new Date(base + 60_000).toISOString(), `saida ${i} ${recheio}`);
    }
    await sql.query(
      "update core.conversa set ultima_entrada_em = $2, atualizado_em = now() where id = $1",
      [id, new Date(base).toISOString()],
    );
  }
}

// ── 2 · usuário autenticado ─────────────────────────────────────────────────────────────────
let admin, supabase, UID;
try {
  ({ admin, supabase, UID } = await criarUsuarioDoPortao({ URL, ANON, SERVICE, prefixo: "portao-f25" }));
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

const { lerConversas, contarNaoLidas } = await import("../lib/dados/conversas.ts");

// ── 3 · MEDIÇÃO com cliente falso: antes × depois ───────────────────────────────────────────
// O falso responde com dados realistas do cenário, para que o payload medido seja comparável.
const conversasFalsas = Array.from({ length: NAO_LIDAS + LIDAS }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  telefone: `${PREFIXO}${String(i).padStart(6, "0")}`,
  lead_id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  mode: "IA",
  dono_atual: null,
  status: "aberta",
  atualizado_em: new Date().toISOString(),
  ultima_entrada_em: new Date(Date.now() - i * 3600_000).toISOString(),
}));
const recheio = "x".repeat(400);
const mensagensFalsas = conversasFalsas.flatMap((c, i) => {
  const linhas = [
    {
      conversa_id: c.id,
      direcao: "entrada",
      corpo: `entrada ${i} ${recheio}`,
      criado_em: new Date().toISOString(),
      timestamp_origem: new Date(Date.now() - i * 3600_000).toISOString(),
    },
  ];
  if (i >= NAO_LIDAS)
    linhas.unshift({
      conversa_id: c.id,
      direcao: "saida",
      corpo: `saida ${i} ${recheio}`,
      criado_em: new Date().toISOString(),
      timestamp_origem: new Date(Date.now() - i * 3600_000 + 60_000).toISOString(),
    });
  return linhas;
});
const cardsFalsos = conversasFalsas.map((c, i) => ({
  lead_id: c.lead_id,
  nome: `Lead ${i}`,
  etapa: "novo",
  valor: null,
  origem: "whatsapp",
  entrou_etapa_em: null,
  tags: [],
  kommo_lead_id: null,
}));

function responder(q) {
  if (q.tabela === "v_conversa") {
    if (q.head) return { data: null, count: conversasFalsas.length };
    const cols = (q.colunas ?? "").split(",");
    return { data: conversasFalsas.map((c) => Object.fromEntries(cols.map((k) => [k, c[k]]))) };
  }
  if (q.tabela === "mensagem") {
    const cols = (q.colunas ?? "").split(",");
    return { data: mensagensFalsas.map((m) => Object.fromEntries(cols.map((k) => [k, m[k]]))) };
  }
  if (q.tabela === "v_lead_card") return { data: cardsFalsos };
  if (q.tabela === "v_config_vigente") return { data: { payload: { etapas: [] } } };
  return { data: [] };
}

const falsoDepois = criarClienteFalso(responder);
const nDepois = await contarNaoLidas(falsoDepois);

// CONTROLE NEGATIVO: a implementação ANTIGA, no mesmo cliente falso e no mesmo cenário.
const falsoAntes = criarClienteFalso(responder);
const { conversas: listaAntiga } = await lerConversas({ cliente: falsoAntes });
const nAntes = listaAntiga.filter((c) => c.nao_lida).length;

const tocouLead = falsoDepois.tocou("v_lead_card");
const leuCorpo = falsoDepois.leu("corpo");
const tocouConfig = falsoDepois.tocou("v_config_vigente");

if (SO_NEGATIVO) {
  console.log("CONTROLE NEGATIVO (isolado) — implementação ANTIGA no mesmo cliente falso:");
  console.log(`  antiga:  ${falsoAntes.total} requisições · ${falsoAntes.bytes} bytes · ${falsoAntes.resumo().join(" | ")}`);
  console.log(`  estreita:${falsoDepois.total} requisições · ${falsoDepois.bytes} bytes · ${falsoDepois.resumo().join(" | ")}`);
  const acusou = falsoAntes.tocou("v_lead_card") && falsoAntes.leu("corpo") && falsoAntes.bytes > falsoDepois.bytes;
  console.log(acusou ? "P1 OK — a leitura antiga é ACUSADA (lê lead, lê corpo, pesa mais)." : "P1 FALHOU.");
  await encerrar(acusou ? 0 : 1);
}

// ── 4 · VACUIDADE ───────────────────────────────────────────────────────────────────────────
const totalReais = Number(
  (await sql.query("select count(*)::int as n from core.v_conversa where visivel_inbox")).rows[0].n,
);
const naoLidasReais = await contarNaoLidas(supabase);
const { conversas: listaReal } = await lerConversas({ cliente: supabase });
const naoLidasPelaLista = listaReal.filter((c) => c.nao_lida).length;

if (totalReais === 0) nok("(0) vacuidade: nenhuma conversa visível — qualquer contador acerta");
else if (naoLidasReais === 0 || naoLidasReais === totalReais)
  nok(
    `(0) vacuidade: o cenário não tem as DUAS classes (não-lidas=${naoLidasReais} de ${totalReais}) — ` +
      "um contador sempre-0 ou sempre-tudo passaria",
  );
else ok(`(0) vacuidade: ${naoLidasReais} não-lidas e ${totalReais - naoLidasReais} lidas, num total de ${totalReais}`);

// ── 5 · MEDIDA ──────────────────────────────────────────────────────────────────────────────
if (naoLidasReais === naoLidasPelaLista)
  ok(`(1) contador estreito == contagem da lista, no mesmo banco: ${naoLidasReais}`);
else
  nok(
    `(1) DIVERGÊNCIA — estreito diz ${naoLidasReais}, a lista diz ${naoLidasPelaLista}. ` +
      "Dois números diferentes é pior que o custo que o item corta.",
  );

if (!tocouLead) ok("(2) o contador NÃO faz join com v_lead_card");
else nok("(2) o contador ainda lê v_lead_card — é o join que o item existe pra tirar");

if (!leuCorpo) ok("(3) o contador NÃO lê `corpo` de mensagem (é o que pesa)");
else nok("(3) o contador ainda lê `corpo` — o payload continua o de antes");

if (!tocouConfig) ok("(4) o contador NÃO lê a config do funil (não precisa dela pra contar)");
else nok("(4) o contador ainda lê v_config_vigente");

{
  // Os números do headline viram ASSERÇÃO, com PISO e TETO (achado do Portão no R16-23). Só teto
  // não basta: ele conseguiu verde com um contador de constante fixa, cuja saída celebrava
  // "0 requisições, 0 B" — zero passa em qualquer teto. Piso é o que separa "barato" de "não leu".
  const PISO_REQ = 2; // ids das conversas visíveis + direção da última mensagem. Menos que isso é invenção.
  const TETO_REQ = 3; // folga de uma; a quarta seria o join/config que o item existe pra tirar.
  const TETO_BYTES = 4000; // o cenário tem 12 conversas com corpo de 400 chars cada
  const req = falsoDepois.total;
  const bytes = falsoDepois.bytes;
  // fonte MEDIDA NÃO-VAZIA: se o cliente falso não devolveu linha nenhuma, "poucos bytes" é
  // consequência de não ter lido nada, não de ter lido barato
  const linhasLidas = falsoDepois.chamadas.reduce(
    (s, c) => s + (Array.isArray(c.bytes) ? 0 : c.head ? 0 : 1),
    0,
  );
  const fonteNaoVazia = bytes > 0 && linhasLidas > 0;

  if (req < PISO_REQ)
    nok(
      `(5) o contador fez ${req} requisição(ões), abaixo do piso ${PISO_REQ} — contador que não ` +
        "lê o banco não está contando, está inventando",
    );
  else if (req > TETO_REQ) nok(`(5) o contador fez ${req} requisições, acima do teto ${TETO_REQ}`);
  else if (!fonteNaoVazia)
    nok(`(5) a fonte medida está VAZIA (${bytes} B em ${linhasLidas} leituras com payload) — teto cumprido por não ter lido nada`);
  else if (bytes > TETO_BYTES) nok(`(5) payload do contador ${bytes} B passou do teto ${TETO_BYTES} B`);
  else
    ok(
      `(5) ${req} requisições dentro de [${PISO_REQ},${TETO_REQ}] e ${bytes} B em (0,${TETO_BYTES}] ` +
        `sobre fonte não-vazia (antes: ${falsoAntes.total} req · ${falsoAntes.bytes} B)`,
    );
}

{
  // MATA O CONTADOR DE CONSTANTE FIXA. O Portão passou com `return 7` porque o cenário do banco
  // tinha 7 não-lidas — a igualdade batia por coincidência. Aqui o MESMO código roda sobre um
  // segundo cenário, montado para dar OUTRO número: se o resultado não mudar, o contador não está
  // olhando para o dado.
  const outrasConversas = conversasFalsas.slice(0, 5);
  const todasLidas = outrasConversas.map((c) => ({
    conversa_id: c.id,
    direcao: "saida", // última mensagem é NOSSA em todas → zero não-lidas
    corpo: "resposta",
    criado_em: new Date().toISOString(),
    timestamp_origem: new Date().toISOString(),
  }));
  const falsoOutro = criarClienteFalso((q) => {
    if (q.tabela === "v_conversa" && !q.head) {
      const cols = (q.colunas ?? "").split(",");
      return { data: outrasConversas.map((c) => Object.fromEntries(cols.map((k) => [k, c[k]]))) };
    }
    if (q.tabela === "mensagem") return { data: todasLidas };
    return responder(q);
  });
  const nOutro = await contarNaoLidas(falsoOutro);
  if (nOutro === 0 && nDepois !== 0)
    ok(`(5-bis) o contador RESPONDE ao cenário: ${nDepois} num, 0 no outro — não é constante`);
  else
    nok(
      `(5-bis) o contador devolveu ${nOutro} num cenário sem nenhuma não-lida (e ${nDepois} no outro) — ` +
        "número que não muda com o dado é constante disfarçada de contagem",
    );
}

if (nDepois === nAntes)
  ok(`(6) no MESMO cenário do cliente falso, estreito e antigo dão o mesmo número: ${nDepois}`);
else nok(`(6) no cliente falso, estreito=${nDepois} e antigo=${nAntes} — a técnica mudou o número`);

// ── 6 · CONTROLE NEGATIVO ───────────────────────────────────────────────────────────────────
if (falsoAntes.tocou("v_lead_card") && falsoAntes.leu("corpo") && falsoAntes.bytes > falsoDepois.bytes)
  ok(
    `(7) controle negativo: a leitura ANTIGA lê v_lead_card, lê corpo e trafega ${falsoAntes.bytes} B ` +
      `contra ${falsoDepois.bytes} B da estreita (${(falsoAntes.bytes / Math.max(falsoDepois.bytes, 1)).toFixed(1)}×) ` +
      `— as asserções (2)(3)(5) disparam contra ela`,
  );
else
  nok(
    `(7) controle negativo não acusou — lead=${falsoAntes.tocou("v_lead_card")} ` +
      `corpo=${falsoAntes.leu("corpo")} bytes ${falsoAntes.bytes} vs ${falsoDepois.bytes}`,
  );

// ── 7 · PROVA ESTÁTICA: a barra lateral não chama mais a leitura inteira ────────────────────
// Sem os comentários: o arquivo EXPLICA no cabeçalho o que era feito antes, e um grep cru acharia
// "lerConversas" na explicação. Prova estática que confunde comentário com código é a que reprova
// (ou aprova) pelo motivo errado.
const fonteSidebar = readFileSync(resolve(raiz, "lib/dados/sidebar.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
if (/contarNaoLidas\(\)/.test(fonteSidebar) && !/lerConversas/.test(fonteSidebar))
  ok("(8) lerContadoresSidebar usa contarNaoLidas e não chama mais lerConversas (fora de comentário)");
else nok("(8) a barra lateral ainda passa por lerConversas");

// ── 8 · veredito ────────────────────────────────────────────────────────────────────────────
console.log(`  MEDIDA antes×depois (cliente falso, mesmo cenário):`);
console.log(`    antiga  : ${falsoAntes.total} req · ${falsoAntes.bytes} B · ${falsoAntes.resumo().join(" | ")}`);
console.log(`    estreita: ${falsoDepois.total} req · ${falsoDepois.bytes} B · ${falsoDepois.resumo().join(" | ")}`);
console.log("");
console.log(linhas.join("\n"));
console.log("");
if (falhas.length) {
  console.log(`PORTÃO F25 · VERMELHO — ${falhas.length} asserção(ões) falharam.`);
  await encerrar(1);
}
console.log("PORTÃO F25 · VERDE — vacuidade + medida (6) + controle negativo + prova estática.");
await encerrar(0);
