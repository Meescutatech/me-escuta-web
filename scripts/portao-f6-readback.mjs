// portao-f6-readback.mjs — PORTÃO do F6 (Rodada 16, Agent 1 / Web-A).
//
// Julga a confirmação de escrita: nenhuma tela declara "salvo" sem ter conferido que a projeção
// correspondente existe. Exercita UMA ESCRITA REAL DE CADA AÇÃO MAPEADA, pela mesma porta que a UI
// usa (`api.registrar_evento` com o JWT de um usuário autenticado) e com a MESMA função de
// conferência que as actions chamam (`confirmarProjecao`, importada de lib/) — não com uma cópia.
//
// LOCAL, NUNCA PRODUÇÃO (ARB-09): a URL vem do .env.local e é recusada se não for 127.0.0.1.
// O alvo é impresso com system_identifier antes de qualquer asserção (guarda G1 do wrapper `db`).
//
// As três partes exigidas pela ARB-07:
//   VACUIDADE     — se o portão não exercitou ação nenhuma, ou não encontrou linha nenhuma, REPROVA.
//   CONTROLE NEG. — um evento que ENTRA no ledger e NÃO projeta tem de devolver ok:false com o
//                   MOTIVO_NAO_PROJETADO. É o defeito da R15 reproduzido ao vivo, não simulado.
//   MEDIDA        — cada ação mapeada grava de verdade e a linha é conferida por um SEGUNDO
//                   caminho de leitura (SQL direto), não pelo mesmo que o código usa.
//
// Uso:  cd ~/Developer/me-escuta/me-escuta-web && npm run portao:f6

import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONFERENCIA,
  EXCECOES,
  MOTIVO_NAO_PROJETADO,
  confirmarProjecao,
} from "../lib/eventos/confirmar-projecao.ts";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "..");

const falhas = [];
const linhas = [];
let acoesExercitadas = 0;
let linhasEncontradas = 0;

const ok = (m) => linhas.push(`  VERDE   · ${m}`);
const nok = (m) => {
  linhas.push(`  VERMELHO· ${m}`);
  falhas.push(m);
};
function reprovar(msg) {
  console.error(`\nPORTÃO F6 · RECUSADO — ${msg}`);
  process.exit(2);
}

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
console.log("PORTÃO F6 · confirmação de escrita nos caminhos da UI");
console.log(`  ALVO local · url=${URL}`);
console.log(`  cluster sid=${alvo.sid} · migrations=${alvo.migrations}`);
console.log("");

// ── 1 · usuário real, autenticado, membro ativo do workspace ────────────────────────────────
const EMAIL = `portao-f6-${randomUUID().slice(0, 8)}@meescuta.local`;
const SENHA = "portao-f6-senha-forte-local";
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: SENHA,
  email_confirm: true,
});
if (erroCriar) reprovar(`não criei o usuário local: ${erroCriar.message}`);
const UID = criado.user.id;
await sql.query("select porta.semear_usuario($1::jsonb)", [
  JSON.stringify({ usuario_id: UID, email: EMAIL, nome: "Portão F6", papel: "owner" }),
]);

const supabase = createClient(URL, ANON, { auth: { persistSession: false } });
const { error: erroLogin } = await supabase.auth.signInWithPassword({
  email: EMAIL,
  password: SENHA,
});
if (erroLogin) reprovar(`login local falhou: ${erroLogin.message}`);

// ── 2 · o mesmo caminho de escrita da UI, sem cópia da lógica ───────────────────────────────
/** Réplica exata de registrarEventoUI, menos o revalidatePath (que só existe dentro do Next). */
async function escreverComoAUI(tipo, payload, leadId, idExterno) {
  const envelope = {
    tipo,
    id_externo: idExterno ?? randomUUID(),
    versao_payload: 1,
    payload,
  };
  if (leadId) envelope.lead_id = leadId;
  const { data, error } = await supabase.schema("api").rpc("registrar_evento", { p: envelope });
  if (error) return { resultado: { ok: false, motivo: error.message }, resposta: null };
  const resposta = data ?? null;
  const resultado = await confirmarProjecao(supabase, tipo, payload, resposta);
  if (!resultado.ok) return { resultado, resposta };
  return {
    resultado: { ok: true, ...(resposta?.duplicado ? { duplicado: true } : {}) },
    resposta,
  };
}

/** Segunda leitura, por SQL direto: se as duas concordam, não é o mesmo erro visto duas vezes. */
async function linhaExistePorSQL(acao, resposta, payload) {
  const regra = CONFERENCIA[acao];
  if (!regra) return null;
  if (regra.por === "posicao") {
    const r = await sql.query(
      `select 1 from core.${regra.tabela} where ${regra.coluna} = $1 limit 1`,
      [resposta.posicao_global],
    );
    return r.rowCount > 0;
  }
  if (regra.por === "evento") {
    const r = await sql.query(`select 1 from core.${regra.tabela} where ${regra.coluna} = $1 limit 1`, [
      resposta.evento_id,
    ]);
    return r.rowCount > 0;
  }
  const r = await sql.query(
    `select 1 from core.${regra.tabela} where ${regra.chave} = $1 and ${regra.naoNulo} is not null limit 1`,
    [payload[regra.campoPayload]],
  );
  return r.rowCount > 0;
}

/** (1) escrita normal → ok:true E a linha existe (conferida pelos DOIS caminhos). */
async function medir(acao, payload, leadId, idExterno) {
  acoesExercitadas += 1;
  const { resultado, resposta } = await escreverComoAUI(acao, payload, leadId, idExterno);
  if (!resultado.ok) {
    nok(`(1) ${acao}: a UI reportaria FALHA numa escrita que devia passar — "${resultado.motivo}"`);
    return null;
  }
  const existeSQL = await linhaExistePorSQL(acao, resposta, payload);
  if (existeSQL !== true) {
    nok(`(1) ${acao}: a UI disse ok, mas o SQL direto NÃO acha a linha — mapa errado ou falso positivo`);
    return null;
  }
  linhasEncontradas += 1;
  const regra = CONFERENCIA[acao];
  const chave =
    regra.por === "posicao"
      ? `${regra.coluna}=${resposta.posicao_global}`
      : regra.por === "evento"
        ? `${regra.coluna}=evento_id`
        : `${regra.naoNulo} not null`;
  ok(`(1) ${acao} → core.${regra.tabela} (${chave}) confirmada pelos dois caminhos`);
  return resposta;
}

// ── 3 · semear o mundo mínimo (infra, por SQL — as ASSERÇÕES é que vão pela porta da UI) ─────
const LEAD = randomUUID();
await sql.query("select porta.recebe_evento_externo($1::jsonb)", [
  JSON.stringify({
    tipo: "lead_criado",
    ator: "sistema",
    origem: "portao-f6",
    id_externo: "f6-lead-" + LEAD,
    versao_payload: 1,
    lead_id: LEAD,
    payload: { nome: "Lead do portão F6", telefone: "+5511960000001", etapa: "novo" },
  }),
]);
const TELEFONE_CONV = "+5511960000002";
await sql.query("select porta.recebe_evento_externo($1::jsonb)", [
  JSON.stringify({
    tipo: "mensagem_recebida",
    ator: "sistema",
    origem: "portao-f6",
    id_externo: "f6-msg-" + randomUUID(),
    versao_payload: 1,
    payload: {
      conversa: { telefone: TELEFONE_CONV, phone_number_id: "PORTAO_F6" },
      tipo_conteudo: "texto",
      corpo: "conversa do portão F6",
    },
  }),
]);
const CONVERSA = (await sql.query("select id::text from core.conversa where telefone = $1", [TELEFONE_CONV]))
  .rows[0]?.id;
const ETAPA_ALVO = (
  await sql.query(
    `select et ->> 'chave' as chave
       from core.v_config_vigente c
       cross join lateral jsonb_array_elements(c.payload -> 'etapas') et
      where c.nome = 'funil_vendas' and et ->> 'chave' <> 'novo'
      limit 1`,
  )
).rows[0]?.chave;
if (!CONVERSA || !ETAPA_ALVO) reprovar("não consegui semear conversa/etapa para o portão.");

try {
  // ── 4 · MEDIDA: uma escrita real de CADA ação mapeada ─────────────────────────────────────
  await medir("etapa_alterada", { lead_id: LEAD, etapa_de: "novo", etapa_para: ETAPA_ALVO }, LEAD);
  await medir("dono_atribuido", { lead_id: LEAD, dono_id: UID }, LEAD);
  await medir("lead_atualizado", { campos: { observacao: "portão F6" } }, LEAD);

  const notaId = randomUUID();
  await medir("anotacao_adicionada", { texto: "nota do portão F6", tipo: "interna" }, LEAD, notaId);

  const tarefaA = await medir("tarefa_criada", { titulo: "tarefa A do portão F6" }, LEAD);
  const tidA = tarefaA?.evento_id;
  if (tidA) {
    const amanha = new Date(Date.now() + 86_400_000).toISOString();
    await medir("tarefa_prazo_repactuado", { tarefa_id: tidA, prazo: amanha, motivo: "portão" }, LEAD);
    await medir("tarefa_reatribuida", { tarefa_id: tidA, responsavel_id: UID, motivo: "portão" }, LEAD);
    await medir("tarefa_assumida", { tarefa_id: tidA, por: UID }, LEAD);
    await medir("tarefa_concluida", { tarefa_id: tidA, resultado: "concluída pelo portão" }, LEAD);
  } else nok("(1) tarefa_criada não devolveu evento_id — o ciclo de vida da tarefa não foi exercitado");

  const tarefaB = await medir("tarefa_criada", { titulo: "tarefa B do portão F6" }, LEAD);
  if (tarefaB?.evento_id)
    await medir("tarefa_arquivada", { tarefa_id: tarefaB.evento_id, motivo: "portão" }, LEAD);

  const men1 = await medir(
    "mencao_criada",
    { mencionado_id: UID, origem_tipo: "nota", origem_id: notaId, trecho: "olha isto" },
    LEAD,
  );
  if (men1?.evento_id) {
    await medir("mencao_lida", { mencao_id: men1.evento_id }, LEAD);
    // IDEMPOTÊNCIA — a asserção que distingue as duas regras possíveis para mencao_lida.
    // O projetor tem `and m.lida_em is null`: remarcar uma menção JÁ lida é um no-op correto que
    // NÃO carimba posição nova. Se a conferência fosse por posição (como a spec previa), este
    // caminho reprovaria uma ação bem-sucedida. Sem esta asserção o portão passa verde com a
    // regra errada — foi assim que ele passou na primeira versão, e é por isso que ela existe.
    const antesPos = (
      await sql.query("select ultima_posicao::int as p from core.mencao where id = $1", [
        men1.evento_id,
      ])
    ).rows[0].p;
    const releitura = await escreverComoAUI("mencao_lida", { mencao_id: men1.evento_id }, LEAD);
    const depoisPos = (
      await sql.query("select ultima_posicao::int as p from core.mencao where id = $1", [
        men1.evento_id,
      ])
    ).rows[0].p;
    if (depoisPos !== antesPos)
      nok(`(1) a premissa mudou: remarcar como lida carimbou posição nova (${antesPos} → ${depoisPos})`);
    else if (releitura.resultado.ok)
      ok(`(1) mencao_lida repetida: no-op do projetor (posição fica em ${antesPos}) e a UI ainda diz ok — sem falso negativo`);
    else
      nok(`(1) mencao_lida repetida virou FALSO NEGATIVO: "${releitura.resultado.motivo}" (a conferência está por posição, e o projetor não carimba)`);
  }

  const men2 = await medir(
    "mencao_criada",
    { mencionado_id: UID, origem_tipo: "nota", origem_id: notaId, trecho: "e isto também" },
    LEAD,
  );
  if (men2?.evento_id && tarefaB?.evento_id)
    await medir(
      "mencao_promovida_tarefa",
      { mencao_id: men2.evento_id, tarefa_id: tarefaB.evento_id },
      LEAD,
    );

  await medir("conversa_assumida", { conversa_id: CONVERSA });
  await medir("conversa_devolvida", { conversa_id: CONVERSA });


  // ── 5 · DUPLICADO: sucesso IDEMPOTENTE e nenhuma linha nova ───────────────────────────────
  {
    const chave = randomUUID();
    const antes = (await sql.query("select count(*)::int as n from core.anotacao")).rows[0].n;
    const um = await escreverComoAUI("anotacao_adicionada", { texto: "primeira", tipo: "interna" }, LEAD, chave);
    const dois = await escreverComoAUI("anotacao_adicionada", { texto: "SEGUNDA, diferente" }, LEAD, chave);
    const depois = (await sql.query("select count(*)::int as n from core.anotacao")).rows[0].n;

    if (um.resultado.ok && um.resultado.duplicado !== true) ok("(2) a 1ª escrita é sucesso comum");
    else nok(`(2) a 1ª escrita devia ser sucesso comum, veio ${JSON.stringify(um.resultado)}`);

    if (dois.resultado.ok === true && dois.resultado.duplicado === true)
      ok("(2) repetir a mesma id_externo → {ok:true, duplicado:true} — sucesso DISTINGUÍVEL, não falha");
    else nok(`(2) a repetição devia ser {ok:true,duplicado:true}, veio ${JSON.stringify(dois.resultado)}`);

    if (depois === antes + 1) ok(`(2) nenhuma linha nova: core.anotacao ${antes} → ${depois}`);
    else nok(`(2) a repetição criou linha: core.anotacao ${antes} → ${depois}`);

    const texto = (
      await sql.query("select texto from core.anotacao where id = $1", [um.resposta.evento_id])
    ).rows[0]?.texto;
    if (texto === "primeira")
      ok("(2) a projeção vigente é a do evento ORIGINAL — o texto novo não sobrescreveu nada");
    else nok(`(2) o texto projetado é "${texto}", esperava "primeira"`);
  }

  // ── 6 · CONTROLE NEGATIVO: entrou no ledger, não projetou → a UI TEM de negar sucesso ──────
  {
    // `lead_atualizado` sem a chave `campos`: a porta ACEITA e o evento entra no ledger, mas
    // `proj_lead_campo` retorna antes de escrever (guarda de retrocompatibilidade). É a colisão
    // de dispatcher da R15 reproduzida com um evento real, não com um mock.
    const { resultado, resposta } = await escreverComoAUI("lead_atualizado", {}, LEAD);
    const noLedger =
      resposta?.evento_id &&
      (await sql.query("select 1 from core.evento where id = $1", [resposta.evento_id])).rowCount > 0;

    if (noLedger) ok("(3) o evento sem projeção ENTROU no ledger (senão o controle não vale nada)");
    else nok("(3) o evento do controle negativo nem entrou no ledger — o caso não foi encenado");

    if (resultado.ok === false && resultado.motivo === MOTIVO_NAO_PROJETADO)
      ok("(3) evento no ledger sem projeção → {ok:false, MOTIVO_NAO_PROJETADO}; a tela NÃO diz salvo");
    else nok(`(3) devia negar sucesso com MOTIVO_NAO_PROJETADO, veio ${JSON.stringify(resultado)}`);
  }

  // ── 7 · EXCEÇÕES: ausência de conferência declarada, e ainda assim conferindo o ledger ─────
  {
    // A spec declarava esta escrita como exceção permanente. Não é: a linha nasce na mesma
    // transação, em `na_fila`. O portão mede isso em vez de repetir a afirmação.
    const envio = await escreverComoAUI("enviar_mensagem_humana", {
      conversa_id: CONVERSA,
      corpo: "mensagem do portão F6",
    });
    acoesExercitadas += 1;
    const bolha = (
      await sql.query(
        "select status_entrega, direcao from core.mensagem where id = $1",
        [envio.resposta?.evento_id ?? null],
      )
    ).rows[0];
    if (envio.resultado.ok && bolha) {
      linhasEncontradas += 1;
      ok(`(4) enviar_mensagem_humana → core.mensagem (id=evento_id) confirmada · direcao=${bolha.direcao} status=${bolha.status_entrega}`);
    } else if (!envio.resultado.ok)
      nok(`(4) enviar_mensagem_humana virou falso negativo: "${envio.resultado.motivo}"`);
    else nok("(4) a UI disse ok mas não há bolha em core.mensagem — a premissa mudou, releia CONFERENCIA");

    if (bolha && bolha.status_entrega !== "enviado")
      ok(`(4) a bolha nasce em "${bolha.status_entrega}", não em "enviado" — sair de fato continua sendo do sender`);
    else if (bolha) nok(`(4) a bolha nasceu como "enviado" sem o sender ter confirmado — a UI estaria mentindo`);

    const naFila =
      (await sql.query("select count(*)::int as n from pgmq.q_fila_saida")).rows[0].n > 0;
    if (naFila) ok("(4) o envio também foi para fila_saida — o sender é quem confirma a saída real");
    else nok("(4) nada em fila_saida: a mensagem não vai sair de lugar nenhum");

    const levindo = await escreverComoAUI("levindo_acionado", { lead_id: LEAD, motivo: "portão" }, LEAD);
    if (levindo.resultado.ok) ok("(4) levindo_acionado: ok:true — tipo sem projetor, exceção declarada");
    else nok(`(4) levindo_acionado virou falso negativo: "${levindo.resultado.motivo}"`);
  }

  // ── 8 · nenhuma escrita da UI escapa da conferência (a prova estática) ────────────────────
  {
    const meus = [
      "app/(app)/funil/actions.ts",
      "app/(app)/lead/actions.ts",
      "app/(app)/conversas/actions.ts",
      "app/(app)/notificacoes/actions.ts",
      "components/funil/drawer-card.tsx",
    ];
    const fonte = Object.fromEntries(
      meus.map((f) => [f, readFileSync(resolve(raiz, f), "utf8")]),
    );

    const rpcDireto = meus.filter((f) => /rpc\(\s*["']registrar_evento["']/.test(fonte[f]));
    if (rpcDireto.length === 1 && rpcDireto[0] === "app/(app)/funil/actions.ts")
      ok("(5) só registrarEventoUI fala com api.registrar_evento — um choke point, não vinte");
    else nok(`(5) api.registrar_evento é chamada direto em: ${rpcDireto.join(", ") || "(nenhum)"} — esperava só funil/actions.ts`);

    const corpo = fonte["app/(app)/funil/actions.ts"];
    if (/const conferido = await confirmarProjecao\(/.test(corpo) && /if \(!conferido\.ok\) return conferido;/.test(corpo))
      ok("(5) registrarEventoUI confere a projeção ANTES de devolver sucesso");
    else nok("(5) registrarEventoUI não passa por confirmarProjecao antes do sucesso");

    const declaradas = new Set([...Object.keys(CONFERENCIA), ...Object.keys(EXCECOES)]);
    const naoDeclaradas = new Set();
    let tiposVistos = 0;
    for (const f of meus) {
      for (const m of fonte[f].matchAll(/registrarEventoUI\(\s*\n?\s*["']([a-z_]+)["']/g)) {
        tiposVistos += 1;
        if (!declaradas.has(m[1])) naoDeclaradas.add(`${m[1]} (${f})`);
      }
    }
    if (tiposVistos === 0) nok("(5) o grep não achou chamada nenhuma — a prova estática estaria vazia");
    else if (naoDeclaradas.size === 0)
      ok(`(5) os ${tiposVistos} tipos literais passados a registrarEventoUI estão TODOS declarados`);
    else nok(`(5) tipos escritos sem declaração (nem conferência, nem exceção): ${[...naoDeclaradas].join(", ")}`);

    // toda ação declarada como exceção tem o motivo escrito TAMBÉM no código que a usa
    const excecoesNoCodigo = /EXCEÇÃO DECLARADA|exceção declarada/i;
    const semDeclaracao = Object.keys(EXCECOES).filter(
      (a) => !meus.some((f) => fonte[f].includes(a) && excecoesNoCodigo.test(fonte[f])),
    );
    if (semDeclaracao.length === 0)
      ok(`(5) ${Object.keys(EXCECOES).length} exceção(ões) declarada(s), e o motivo está TAMBÉM no ponto de chamada`);
    else nok(`(5) exceção sem declaração no código que a usa: ${semDeclaracao.join(", ")}`);
  }

  // ── 8-bis · COBERTURA: nenhuma linha do mapa fica sem escrita real ───────────────────────
  {
    const naoExercitadas = Object.keys(CONFERENCIA).filter(
      (a) => !linhas.some((l) => l.includes(`${a} → core.`)),
    );
    if (naoExercitadas.length === 0)
      ok(`(6) as ${Object.keys(CONFERENCIA).length} ações mapeadas foram exercitadas com escrita real`);
    else nok(`(6) ações mapeadas SEM escrita real no portão: ${naoExercitadas.join(", ")}`);
  }

  // ── 9 · VACUIDADE ─────────────────────────────────────────────────────────────────────────
  if (acoesExercitadas >= Object.keys(CONFERENCIA).length && linhasEncontradas > 0)
    ok(`(vacuidade) ${acoesExercitadas} escritas reais, ${linhasEncontradas} projeções conferidas — não passou vazio`);
  else
    nok(`(vacuidade) só ${acoesExercitadas} escritas e ${linhasEncontradas} projeções; verde aqui seria falso`);
} finally {
  await sql.end();
  await admin.auth.admin.deleteUser(UID).catch(() => {});
}

console.log("");
for (const l of linhas) console.log(l);
console.log("");
if (falhas.length > 0) {
  console.log(`PORTÃO F6 · VERMELHO — ${falhas.length} asserção(ões) falharam.`);
  process.exit(1);
}
console.log("PORTÃO F6 · VERDE — medida + duplicado + controle negativo + exceções + prova estática + vacuidade.");
process.exit(0);
