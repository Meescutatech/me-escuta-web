/*
 * SEED SINTÉTICO no Supabase LOCAL — volumes espelhando produção de 22/07 (680 leads, 86 conversas,
 * ~420 mensagens, ~5.5k eventos, 437 sugestões) pra medição E2E de TTFB por rota.
 *
 * ESTE script é o do incidente das 21:59 (E-009): ele tinha a conexão FIXA no código, apontando
 * para `127.0.0.1:54422`, e escreveu no banco de outro agente. A guarda que existia —
 * `if (!DB.includes("127.0.0.1")) throw` — protegia contra PRODUÇÃO e não fazia nada contra o
 * VIZINHO: o 54422 do outro passava sempre.
 *
 * Agora: a conexão vem do ambiente, sem default, e a checagem acontece ANTES de qualquer conexão.
 * As duas guardas coexistem — a de host (produção) continua, e a de ausência (vizinho) é nova.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

/** Exige a variável e aborta ANTES de abrir conexão. Sem default: default é o que causou o incidente. */
function exigir(nome, dica) {
  const valor = process.env[nome];
  if (!valor) {
    console.error(`ABORTADO: ${nome} não está definida.`);
    console.error(`  ${dica}`);
    console.error("  este script ESCREVE no banco: sem alvo declarado ele não roda, para não");
    console.error("  escrever no ambiente de outro agente (E-009).");
    process.exit(2);
  }
  return valor;
}

const DB = exigir("DATABASE_URL", "ex.: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:<SUA_ME_DB_PORT>/postgres");
const AUTH = exigir("AUTH_URL", "ex.: AUTH_URL=http://127.0.0.1:<SUA_ME_API_PORT>/auth/v1");
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"; // service_role DEMO do supabase local — público
const EMAIL = "perf@meescuta.local";
const SENHA = "perf-local-123";

// Guarda de PRODUÇÃO (a que já existia). Não substitui a de cima: esta impede o banco remoto,
// aquela impede o banco do vizinho.
if (!DB.includes("127.0.0.1")) {
  console.error("ABORTADO: seed só roda local — DATABASE_URL não aponta para 127.0.0.1.");
  process.exit(2);
}
const CONFIGS = exigir("CONFIGS_JSON", "caminho do json com payloads funil_vendas/ficha_lead");
const configs = JSON.parse(readFileSync(CONFIGS, "utf8"));

const c = new pg.Client({ connectionString: DB });
await c.connect();

// usuário de teste local (idempotente)
const resp = await fetch(`${AUTH}/admin/users`, {
  method: "POST",
  headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: SENHA, email_confirm: true }),
});
const corpo = await resp.json().catch(() => ({}));
if (!resp.ok && !String(corpo?.msg ?? corpo?.message ?? "").match(/already|registered/i)) {
  throw new Error("criar usuário falhou: " + JSON.stringify(corpo));
}
console.log("usuário local ok");

// limpa dados sintéticos anteriores. O ledger é append-only ATÉ NO LOCAL (trigger proíbe
// DELETE em evento/acao_log) — este fixture descartável trunca com os triggers desligados
// (session_replication_role=replica). LOCAL-ONLY: o guard de host no topo impede produção.
await c.query("set session_replication_role = replica");
for (const t of [
  "acao_log", "mensagem", "sugestao_ia", "paciente", "tarefa", "anotacao", "lead_campo",
  "estado_lead", "conversa", "lead", "evento", "config", "canal_whatsapp",
]) {
  await c.query(`truncate core.${t} cascade`).catch(() => {});
}
await c.query("set session_replication_role = default");

const agora = Date.now();
const dia = 86400_000;
const iso = (ms) => new Date(ms).toISOString();

// canal ativo sem inbox_desde → conversas visíveis no inbox
await c.query(
  `insert into core.canal_whatsapp (phone_number_id, waba_id, numero_e164, apelido, ativo, config_jsonb)
   values ('perf-canal-1', 'waba-1', '+5511990000000', 'Perf', true, '{}'::jsonb)`,
);

// configs reais (payload copiado da vigente de produção — leitura autorizada)
for (const [nome, payload] of Object.entries(configs)) {
  await c.query(
    "insert into core.config (nome, versao, payload) values ($1, 1, $2::jsonb)",
    [nome, JSON.stringify(payload)],
  );
}

const etapas = configs.funil_vendas.etapas.map((e) => e.chave);

// 5.5k eventos (o /timeline lê os 50 últimos; volume dá realismo ao order by)
console.log("eventos…");
const eventoIds = [];
for (let lote = 0; lote < 11; lote++) {
  const valores = [];
  const params = [];
  for (let i = 0; i < 500; i++) {
    const n = lote * 500 + i;
    const b = params.length;
    valores.push(`($${b + 1},$${b + 2},$${b + 3}::jsonb,$${b + 4},$${b + 5},$${b + 6},$${b + 7})`);
    params.push(
      n % 3 === 0 ? "lead_criado" : n % 3 === 1 ? "etapa_alterada" : "mensagem_recebida",
      "sistema",
      JSON.stringify({ corpo: `evento sintético ${n} com um payload de tamanho razoável pra simular o ledger real`, seq: n }),
      "perf",
      `perf-ev-${n}`,
      1,
      iso(agora - 30 * dia + n * ((30 * dia) / 5500)),
    );
  }
  const { rows } = await c.query(
    `insert into core.evento (tipo, ator, payload, origem, id_externo, versao_payload, criado_em)
     values ${valores.join(",")} returning id`,
    params,
  );
  eventoIds.push(...rows.map((r) => r.id));
}

// 680 leads + estado_lead (+ paciente em 1/4)
console.log("leads…");
const leadIds = [];
for (let i = 0; i < 680; i++) {
  const { rows } = await c.query(
    `insert into core.lead (lead_id, nome, telefone, origem, dono, tags, kommo_lead_id, valor, criado_em, atualizado_em, ultima_posicao)
     values (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, $6, $7, $8, $8, $9) returning lead_id`,
    [
      `Lead Sintético ${i}`,
      `+55119${String(90000000 + i)}`,
      ["whatsapp", "instagram", "meta", "indicacao"][i % 4],
      i % 5 === 0 ? "Clara" : i % 5 === 1 ? "Sara" : null,
      JSON.stringify(i % 3 === 0 ? ["quente", "retorno"] : []),
      String(40000 + i),
      i % 6 === 0 ? 3500 + (i % 10) * 250 : null,
      iso(agora - (i % 60) * dia),
      i + 1,
    ],
  );
  const leadId = rows[0].lead_id;
  leadIds.push(leadId);
  await c.query(
    `insert into core.estado_lead (lead_id, etapa, entrou_etapa_em, atualizado_em, ultima_posicao)
     values ($1, $2, $3, $3, $4)`,
    [leadId, etapas[i % etapas.length], iso(agora - (i % 45) * dia), i + 1],
  );
  if (i % 4 === 0) {
    await c.query(
      `insert into core.paciente (paciente_id, lead_id, nome, nascimento, criado_em, ultima_posicao)
       values (gen_random_uuid(), $1, $2, $3, now(), 0)`,
      [leadId, `Paciente ${i}`, `19${50 + (i % 40)}-05-10`],
    );
  }
}

// 86 conversas visíveis + mensagens (1ª conversa com 60 msgs pro histórico pesado; 5 de áudio)
console.log("conversas + mensagens…");
let totalMsgs = 0;
for (let i = 0; i < 86; i++) {
  const { rows } = await c.query(
    `insert into core.conversa (id, lead_id, telefone, phone_number_id, criado_em, atualizado_em,
       primeira_posicao, ultima_posicao, mode, dono_atual, status, posse_posicao, ultima_entrada_em)
     values (gen_random_uuid(), $1, $2, 'perf-canal-1', $3, $4, $5, $6, $7, $8, 'em_atendimento', 0, $4)
     returning id`,
    [
      leadIds[i],
      `+55119${String(90000000 + i)}`,
      iso(agora - (i + 1) * dia),
      iso(agora - i * 3600_000),
      i * 10 + 1,
      i * 10 + 9,
      i % 3 === 0 ? "HUMANO" : "IA",
      i % 3 === 0 ? "Sara" : null,
    ],
  );
  const convId = rows[0].id;
  const qtd = i === 0 ? 60 : i < 20 ? 8 : 2;
  for (let m = 0; m < qtd; m++) {
    const ehAudio = i === 0 && m % 12 === 0;
    await c.query(
      `insert into core.mensagem (id, conversa_id, evento_id, direcao, tipo_conteudo, corpo, criado_em, timestamp_origem, status_entrega, autor, midia_caminho, midia_mime)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10)`,
      [
        convId,
        eventoIds[(i * 60 + m) % eventoIds.length],
        m % 2 === 0 ? "entrada" : "saida",
        ehAudio ? "audio" : "text",
        ehAudio ? null : `Mensagem sintética ${m} da conversa ${i} — texto com tamanho típico de WhatsApp.`,
        iso(agora - (qtd - m) * 3600_000 - i * dia),
        m % 2 === 1 ? ["enviado", "entregue", "lido"][m % 3] : null,
        m % 2 === 1 ? (m % 4 === 1 ? "clara" : "sara") : null,
        ehAudio ? `perf-audio-${i}-${m}.ogg` : null,
        ehAudio ? "audio/ogg" : null,
      ],
    );
    totalMsgs++;
  }
}

// 437 sugestões (50 pendentes tipo enviar_mensagem — /fila e badge do inbox)
console.log("sugestões…");
for (let i = 0; i < 437; i++) {
  await c.query(
    `insert into core.sugestao_ia (agente, tipo, conversa_id, payload_proposto, status, criado_em)
     values ('clara', 'enviar_mensagem', $1, $2::jsonb, $3, $4)`,
    [
      i % 10 === 0 ? null : (await c.query("select id from core.conversa order by atualizado_em desc limit 1")).rows[0].id,
      JSON.stringify({ corpo: `Proposta sintética ${i} da Clara com texto de resposta típico pro lead.` }),
      i < 50 ? "pendente" : "aprovada",
      iso(agora - i * 3600_000),
    ],
  );
}

const contas = {};
for (const t of ["lead", "conversa", "mensagem", "evento", "sugestao_ia"]) {
  contas[t] = (await c.query(`select count(*)::int n from core.${t}`)).rows[0].n;
}
console.log("seed ok:", JSON.stringify(contas), `msgs=${totalMsgs}`);
await c.end();
