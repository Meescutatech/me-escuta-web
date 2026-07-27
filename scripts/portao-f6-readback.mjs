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
// MESA: estes portões escrevem no cluster LOCAL e criam usuário no GoTrue local. Rodam bem em
// sequência, mas exigem MESA ISOLADA — nada de dois portões no mesmo stack ao mesmo tempo, e nada
// de rodar contra um stack que outro agente está usando. Sob concorrência o GoTrue devolve
// 504/AuthRetryableFetchError; a criação de usuário retenta com espera crescente e, se ainda assim
// não passar, o portão RECUSA (rc=2) dizendo que o problema é de mesa — nunca reprova o produto
// por ambiente apertado.
//
// As três partes exigidas pela ARB-07:
//   VACUIDADE     — se o portão não exercitou ação nenhuma, ou não encontrou linha nenhuma, REPROVA.
//   CONTROLE NEG. — um evento que ENTRA no ledger e NÃO projeta tem de devolver ok:false com o
//                   MOTIVO_NAO_PROJETADO. É o defeito da R15 reproduzido ao vivo, não simulado.
//   MEDIDA        — cada ação mapeada grava de verdade e a linha é conferida por um SEGUNDO
//                   caminho de leitura (SQL direto), não pelo mesmo que o código usa.
//
// Uso:  cd ~/Developer/me-escuta/me-escuta-web && npm run portao:f6

import "./portao-resolver.mjs";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { erroLegivel } from "./erro-legivel.mjs";
import { criarUsuarioDoPortao } from "./usuario-portao.mjs";
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
let admin, supabase, UID, EMAIL;
try {
  ({ admin, supabase, UID, EMAIL } = await criarUsuarioDoPortao({
    URL,
    ANON,
    SERVICE,
    prefixo: "portao-f6",
  }));
} catch (e) {
  reprovar(`${e.message} — os portões precisam de mesa isolada; ver o cabeçalho`);
}
await sql.query("select porta.semear_usuario($1::jsonb)", [
  JSON.stringify({ usuario_id: UID, email: EMAIL, nome: "Portão F6", papel: "owner" }),
]);

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

  // ── 5-bis · O DUPLICADO PELO ARTEFATO REAL, não pela réplica (A-3, achado do Portão) ───────
  //
  // Tudo acima passa por `escreverComoAUI`, uma RÉPLICA — ela existe porque a action de verdade
  // chama `revalidatePath`, que estoura fora do Next. E réplica prova réplica: o Portão moveu o
  // `return { ok: true }` para ANTES do revalidatePath no arquivo REAL, a string que a prova
  // estática procurava continuou lá, e o portão passou verde sobre um artefato quebrado.
  //
  // Aqui o `registrarEventoUI` REAL é importado e executado. O que destravou isso não foi mudar o
  // produto: foi o resolvedor do portão trocar `next/cache` (revalidatePath vira no-op) e
  // `@/lib/supabase/server` (devolve o cliente autenticado que o portão já criou). Nada do produto
  // muda — em produção os dois módulos continuam sendo os de verdade.
  {
    globalThis.__PORTAO_CLIENTE__ = supabase;
    const { ligarStubsDeServidor } = await import("./portao-resolver.mjs");
    ligarStubsDeServidor();
    const { registrarEventoUI } = await import("../app/(app)/funil/actions.ts");

    const chave = randomUUID();
    const primeira = await registrarEventoUI(
      "anotacao_adicionada",
      { texto: "real primeira", tipo: "interna" },
      LEAD,
      chave,
    );
    const repetida = await registrarEventoUI(
      "anotacao_adicionada",
      { texto: "real SEGUNDA" },
      LEAD,
      chave,
    );

    if (primeira?.ok === true && primeira.duplicado !== true)
      ok("(2-bis) artefato REAL: a 1ª escrita é sucesso comum");
    else nok(`(2-bis) artefato REAL: 1ª escrita veio ${JSON.stringify(primeira)}`);

    if (repetida?.ok === true && repetida.duplicado === true)
      ok("(2-bis) artefato REAL: repetir a id_externo devolve {ok:true, duplicado:true} — é o registrarEventoUI de produção que respondeu, não uma cópia");
    else
      nok(
        `(2-bis) o registrarEventoUI REAL não propagou o duplicado: veio ${JSON.stringify(repetida)}. ` +
          "É exatamente o defeito que a prova estática por grep NÃO pega (a string pode continuar viva " +
          "com um `return` colocado antes dela).",
      );
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
    // O UNIVERSO É DERIVADO, NÃO LISTADO À MÃO (achado do Portão no R16-23). A lista fixa de 5
    // arquivos afirmava um choke point que não existe: varrendo app/ e components/ há OITO sítios
    // chamando `api.registrar_evento`. Lista escrita à mão envelhece calada — quem acrescenta o 9º
    // não é obrigado a lembrar de vir aqui. Derivar faz o portão reprovar sozinho.
    const varrer = (dir) =>
      execSync(
        `find ${dir} -type f \\( -name '*.ts' -o -name '*.tsx' \\) -not -path '*/node_modules/*'`,
        { cwd: raiz, encoding: "utf8" },
      )
        .trim()
        .split("\n")
        .filter(Boolean);
    const todosArquivos = [...varrer("app"), ...varrer("components")].sort();
    const fonte = Object.fromEntries(
      todosArquivos.map((f) => [f, readFileSync(resolve(raiz, f), "utf8")]),
    );
    const chamamAPorta = todosArquivos.filter((f) =>
      /rpc\(\s*\n?\s*["']registrar_evento["']/.test(fonte[f]),
    );

    /**
     * Cada sítio que fala com a porta tem de estar DECLARADO aqui, com o motivo. Um sítio novo que
     * ninguém declarou reprova — que é o comportamento que a lista à mão não tinha.
     *
     * `telemetria` = melhor esforço, fire-and-forget, NUNCA declara sucesso ao operador. É o que
     * dispensa readback: não há tela dizendo "salvo" para o readback desmentir. Conferido um a um
     * no código, não presumido pelo nome do arquivo.
     */
    const DECLARADOS = {
      "app/(app)/funil/actions.ts": { classe: "choke", motivo: "é o registrarEventoUI — o ponto único que confere a projeção" },
      "app/auth/signout/route.ts": { classe: "telemetria", motivo: "sessao_encerrada, .then(()=>undefined) duplo: nunca bloqueia o logout nem reporta sucesso" },
      "app/login/actions.ts": { classe: "telemetria", motivo: "sessao_iniciada, melhor esforço: falha da métrica não pode barrar o login" },
      "components/presenca-batimento.tsx": { classe: "telemetria", motivo: "batimento de presença em `void` — nenhuma tela espera resposta" },
      "components/conversas/inbox.tsx": { classe: "telemetria", motivo: "conversa_aberta em `void` + .then duplo — métrica não atrapalha a operação" },
      "app/(app)/configuracoes/clara/actions.ts": { classe: "outra-trilha", motivo: "Web-B (Agent 2): readback próprio, modo `filtros` enxertado pelo ARB-28-bis" },
      "app/(app)/configuracoes/membros/actions.ts": { classe: "outra-trilha", motivo: "Web-B (Agent 2): idem" },
      "app/(app)/configuracoes/templates/actions.ts": { classe: "outra-trilha", motivo: "Web-B (Agent 2): idem" },
    };

    const naoDeclarados = chamamAPorta.filter((f) => !DECLARADOS[f]);
    const declaradosSumidos = Object.keys(DECLARADOS).filter((f) => !chamamAPorta.includes(f));
    if (chamamAPorta.length === 0)
      nok("(5) a varredura não achou NENHUM sítio chamando api.registrar_evento — o grep quebrou");
    else if (naoDeclarados.length)
      nok(
        `(5) ${naoDeclarados.length} sítio(s) chamam api.registrar_evento sem declaração: ` +
          `${naoDeclarados.join(", ")} — cada um precisa de choke, telemetria ou outra-trilha, com motivo`,
      );
    else if (declaradosSumidos.length)
      nok(`(5) declarações órfãs (o arquivo não chama mais a porta): ${declaradosSumidos.join(", ")}`);
    else {
      const porClasse = Object.values(DECLARADOS).reduce((m, d) => {
        m[d.classe] = (m[d.classe] ?? 0) + 1;
        return m;
      }, {});
      ok(
        `(5) os ${chamamAPorta.length} sítios que falam com api.registrar_evento estão DECLARADOS ` +
          `(derivados por varredura de app/ e components/): ${porClasse.choke} choke, ` +
          `${porClasse.telemetria} telemetria fire-and-forget, ${porClasse["outra-trilha"]} de outra trilha`,
      );
    }

    // Os arquivos DESTA trilha, para as provas que só valem aqui.
    const meus = [
      "app/(app)/funil/actions.ts",
      "app/(app)/lead/actions.ts",
      "app/(app)/conversas/actions.ts",
      "app/(app)/notificacoes/actions.ts",
      "components/funil/drawer-card.tsx",
    ];
    const foraDeMim = meus.filter((f) => !fonte[f]);
    if (foraDeMim.length) nok(`(5) arquivos desta trilha sumiram da varredura: ${foraDeMim.join(", ")}`);

    const corpo = fonte["app/(app)/funil/actions.ts"];
    if (/const conferido = await confirmarProjecao\(/.test(corpo) && /if \(!conferido\.ok\) return conferido;/.test(corpo))
      ok("(5) registrarEventoUI confere a projeção ANTES de devolver sucesso");
    else nok("(5) registrarEventoUI não passa por confirmarProjecao antes do sucesso");

    // A-3 (achado do Aferidor na bateria cheia do F6): a asserção do DUPLICADO (§5) roda contra a
    // réplica `escreverComoAUI` deste portão, não contra o artefato real — a réplica não tem
    // `revalidatePath`, então ela não podia ser a de produção. Consequência medida pelo Aferidor:
    // tirar a propagação do `duplicado` do retorno de `registrarEventoUI` deixava o portão VERDE
    // (MUT-F6-4 sobrevivia). O que a réplica não alcança, a prova estática alcança: o retorno real
    // tem de continuar propagando `duplicado`, senão a UI perde a distinção entre "salvou agora" e
    // "já estava salvo" — que é a informação que impede o operador de repetir a escrita.
    if (/return \{ ok: true, \.\.\.\(resposta\?\.duplicado \? \{ duplicado: true \} : \{\}\) \};/.test(corpo))
      ok("(5) o retorno REAL de registrarEventoUI propaga `duplicado` (A-3: a réplica não prova isto)");
    else
      nok("(5) o retorno de registrarEventoUI NÃO propaga `duplicado` — a UI perde o sucesso idempotente");

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

    // Toda ação declarada como exceção tem o motivo escrito TAMBÉM no código que a usa.
    // Depois do enxerto (ARB-28-bis) a tabela tem exceção de outra trilha — e exigir declaração
    // no ponto de chamada quando NÃO EXISTE ponto de chamada nesta branch é cobrar o impossível.
    // A dispensa é conferida, não presumida: só vale para a exceção que nenhum arquivo desta
    // branch emite. No dia em que alguém a emitir aqui, o `emitida` vira true e a regra volta.
    const excecoesNoCodigo = /EXCEÇÃO DECLARADA|exceção declarada/i;
    const semDeclaracao = [];
    const naoEmitidasAqui = [];
    for (const a of Object.keys(EXCECOES)) {
      const emitida = meus.some((f) => new RegExp(`["']${a}["']`).test(fonte[f]));
      if (!emitida) {
        naoEmitidasAqui.push(a);
        continue;
      }
      if (!meus.some((f) => fonte[f].includes(a) && excecoesNoCodigo.test(fonte[f])))
        semDeclaracao.push(a);
    }
    if (semDeclaracao.length === 0)
      ok(
        `(5) exceções com motivo TAMBÉM no ponto de chamada` +
          (naoEmitidasAqui.length
            ? ` · ${naoEmitidasAqui.join(", ")} dispensada(s) COM PROVA: nenhum arquivo desta branch emite`
            : ""),
      );
    else nok(`(5) exceção sem declaração no código que a usa: ${semDeclaracao.join(", ")}`);
  }

  // ── 7-bis · FAIL-CLOSED: ação não declarada REPROVA (achado do Agent 2) ───────────────────
  {
    // Um tipo que ninguém declarou, escrito pela porta de verdade. Antes isto devolvia ok:true —
    // o defeito do F6 entrando pela porta dos fundos, e justamente nos tipos que estreiam.
    // FIXTURE PÓS-0073 (pendência do Aferidor, resolvida aqui). O caso ANTES entrava pela porta,
    // e a 0073 passou a recusar tipo não registrado com PMEE1 — a partir dela o cenário deixaria de
    // ser encenado e a asserção viraria vácuo (ou pior: verde por "não deu para testar").
    //
    // Rota escolhida das duas que o Portão ofereceu: INSERT DIRETO em core.evento +
    // porta.aplicar_projetores, o mesmo caminho dos venenos históricos do pgTAP. Escolhida porque
    // não depende de nenhuma migration — funciona antes e depois da 0073, e neste cluster (54
    // migrations) e no de união. A outra rota (registrar com sem_projetor=true) exigiria
    // porta.projetor_registro, que não existe aqui: o portão passaria a depender do ambiente.
    //
    // O que se encena é exatamente o estado perigoso: evento REAL no ledger, sem projeção e sem
    // linha em CONFERENCIA. É o que a UI vê quando um tipo estreia sem ninguém declarar.
    const inventada = "acao_inventada_do_portao_f6";
    const eventoId = (
      await sql.query(
        `insert into core.evento (tipo, ator, origem, id_externo, versao_payload, payload)
         values ($1, 'sistema', 'portao-f6', $2, 1, $3::jsonb) returning id::text`,
        [inventada, `f6-fail-open-${randomUUID()}`, JSON.stringify({ lead_id: LEAD })],
      )
    ).rows[0].id;
    await sql.query("select porta.aplicar_projetores($1::uuid)", [eventoId]);
    const noLedger =
      (await sql.query("select 1 from core.evento where id = $1", [eventoId])).rowCount > 0;
    // e o dispatcher REALMENTE não conhece o tipo — senão não é o caso que queremos encenar
    const semRamo = !(
      await sql.query("select pg_get_functiondef('porta.aplicar_projetores'::regproc) as src")
    ).rows[0].src.includes(inventada);

    const resultado = await confirmarProjecao(
      supabase,
      inventada,
      { lead_id: LEAD },
      { evento_id: eventoId, posicao_global: null, duplicado: false },
    );

    if (!noLedger)
      nok("(7) a ação inventada nem entrou no ledger — o caso de fail-open não foi encenado");
    else if (!semRamo)
      nok(`(7) o dispatcher CONHECE "${inventada}" — o cenário de tipo não declarado não foi encenado`);
    else if (resultado.ok === false && (resultado.motivo ?? "").includes(inventada))
      ok(
        `(7) evento REAL no ledger, sem projeção e fora de CONFERENCIA → reprova nomeando a ação ` +
          `(fixture por insert direto + aplicar_projetores, imune à recusa PMEE1 da 0073): "${resultado.motivo}"`,
      );
    else
      nok(`(7) ação não declarada devolveu ${JSON.stringify(resultado)} — fail-open: qualquer tipo novo declara sucesso sem conferir`);
  }

  // ── 8-bis · COBERTURA: nenhuma linha do mapa fica sem escrita real ───────────────────────
  //
  // Depois do enxerto do ARB-28-bis a tabela tem ações de DUAS trilhas, e as projeções da Web-B
  // (0067–0075) não existem neste cluster — a escrita real delas é o roteiro próprio da web-b
  // (`supabase/verificacao/web-b-escrita-real.sql`, verde no db-r16-c: 4 vacuidades / 10 recusas /
  // 18 medidas). Exercitá-las aqui é impossível, não indesejável.
  //
  // Mas "impossível" não pode virar bilhete de isenção: a dispensa é CONFERIDA no catálogo do
  // cluster. Só é dispensada a ação cuja tabela-alvo comprovadamente NÃO EXISTE aqui. Se alguém
  // acrescentar uma ação DESTA trilha e "esquecer" a escrita real, a tabela existe, a dispensa não
  // se aplica, e a asserção reprova — que é o comportamento que a (6) sempre teve.
  {
    // A prova é o DISPATCHER VIVO deste cluster: se `porta.aplicar_projetores` não tem o ramo do
    // tipo, a projeção não pode nascer aqui de jeito nenhum — não é escolha de quem escreveu o
    // portão. É fato do banco, lido por pg_get_functiondef, não declaração de intenção.
    const corpoDispatcher = (
      await sql.query("select pg_get_functiondef('porta.aplicar_projetores'::regproc) as src")
    ).rows[0].src;
    const naoExercitadas = Object.keys(CONFERENCIA).filter(
      (a) => !linhas.some((l) => l.includes(`${a} → core.`)),
    );
    const semProjecaoAqui = naoExercitadas.filter((a) => !corpoDispatcher.includes(a));
    const faltando = naoExercitadas.filter((a) => corpoDispatcher.includes(a));
    const exercitaveis = Object.keys(CONFERENCIA).length - semProjecaoAqui.length;

    if (faltando.length === 0)
      ok(
        `(6) as ${exercitaveis} ações exercitáveis neste cluster foram escritas de verdade` +
          (semProjecaoAqui.length
            ? ` · ${semProjecaoAqui.length} dispensadas COM PROVA (o dispatcher deste cluster não ` +
              `tem o ramo delas): ${semProjecaoAqui.join(", ")} — a escrita real dessas é o ` +
              `roteiro da web-b, verde no db-r16-c`
            : ""),
      );
    else nok(`(6) ações mapeadas SEM escrita real no portão: ${faltando.join(", ")}`);

    // ── 9 · VACUIDADE ───────────────────────────────────────────────────────────────────────
    if (acoesExercitadas >= exercitaveis && linhasEncontradas > 0)
      ok(`(vacuidade) ${acoesExercitadas} escritas reais, ${linhasEncontradas} projeções conferidas — não passou vazio`);
    else
      nok(`(vacuidade) só ${acoesExercitadas} escritas e ${linhasEncontradas} projeções; verde aqui seria falso`);
  }
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
