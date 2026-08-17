/*
 * VERIFICAÇÃO do PORTAO-1-CRITERIOS.md (escrito pelo Aferidor, 17/08/2026).
 *
 * O Aferidor DERIVOU os critérios e declarou o limite do próprio trabalho: escreveu os comandos SQL
 * e não os executou todos contra o esquema real. Este script EXECUTA cada comando, exatamente como
 * ele está escrito no arquivo, e reporta três coisas por critério:
 *   EXECUTA  — o comando roda contra o schema de hoje
 *   QUEBRA   — coluna/função/tipo que não existe (e a mensagem literal do Postgres)
 *   VALOR    — o que voltou hoje
 *
 * SÓ SELECT. Nunca escreve. Uso: node scripts/verificar-portao-1.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const aqui = dirname(fileURLToPath(import.meta.url));
try {
  for (const l of readFileSync(resolve(aqui, "..", ".env.local"), "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const resultados = [];
async function criterio(id, descricao, sql, ler) {
  try {
    const r = await c.query(sql);
    const valor = ler ? ler(r.rows) : `${r.rowCount} linha(s)`;
    resultados.push({ id, estado: "EXECUTA", valor });
    console.log(`\n[${id}] ${descricao}\n   EXECUTA · ${valor}`);
    return r.rows;
  } catch (e) {
    resultados.push({ id, estado: "QUEBRA", valor: `${e.code} ${e.message}` });
    console.log(`\n[${id}] ${descricao}\n   QUEBRA  · ${e.code} — ${e.message}`);
    return null;
  }
}

console.log("=".repeat(78));
console.log("VERIFICAÇÃO DO PORTÃO 1 — execução dos SQL do Aferidor contra me_escuta_crm");
console.log("=".repeat(78));

// ── A1 ──
await criterio("A1", "pessoa real ativa, com conta auth, que não é semente",
  `select u.nome, u.email, u.papel, u.funcao, u.ativo,
          (a.id is not null) as tem_conta_auth
     from core.usuario u
     left join auth.users a on a.id = u.id
    where u.ativo
      and u.email not in ('admin@meescuta.com','admin.r11@meescuta.com',
                          'membro.r11@meescuta.com','owner.r11@meescuta.com')`,
  (r) => (r.length === 0 ? "0 linhas → VERMELHO (nenhuma pessoa real ativa)" : JSON.stringify(r)));

// ── A2 ──
await criterio("A2", "lotação em departamento folha com entrada",
  `select ud.usuario_id, u.nome, ud.departamento, ud.removido_em,
          d.entrada, d.ativo,
          not exists (select 1 from core.v_departamento f where f.pai = d.chave) as e_folha
     from core.usuario_departamento ud
     join core.usuario u on u.id = ud.usuario_id
     join core.v_departamento d on d.chave = ud.departamento
    where ud.removido_em is null and u.ativo`,
  (r) => (r.length === 0 ? "0 linhas → VERMELHO (nenhuma lotação)" : JSON.stringify(r)));

await criterio("A2b", "evento usuario_departamento_atribuido no ledger",
  `select id, ator, criado_em, payload from core.evento
    where tipo = 'usuario_departamento_atribuido' order by criado_em desc limit 5`,
  (r) => `${r.length} evento(s)`);

// ── A3 ──
await criterio("A3", "sementes conhecidas ainda ativas?",
  `select nome, email, papel, ativo from core.usuario
    where email in ('admin@meescuta.com','admin.r11@meescuta.com',
                    'membro.r11@meescuta.com','owner.r11@meescuta.com')
    order by nome`,
  (r) => {
    const ativas = r.filter((x) => x.ativo);
    return `${r.length} sementes; ATIVAS: ${ativas.map((x) => `${x.nome} <${x.email}>`).join(", ") || "nenhuma"}`;
  });

// ── A4 ──
await criterio("A4a", "eventos tarefa_criada no ledger",
  `select e.id, e.tipo, e.ator, e.criado_em,
          e.payload ->> 'responsavel_id' as responsavel_id,
          e.payload ->> 'tipo'           as tipo_tarefa,
          e.origem
     from core.evento e
    where e.tipo = 'tarefa_criada'
    order by e.criado_em desc limit 5`,
  (r) => (r.length === 0 ? "0 eventos tarefa_criada → VERMELHO" : JSON.stringify(r)));

await criterio("A4b", "projeção core.tarefa",
  `select t.id, t.status, t.responsavel_id, u.nome as responsavel, t.criado_em
     from core.tarefa t left join core.usuario u on u.id = t.responsavel_id
    order by t.criado_em desc limit 5`,
  (r) => (r.length === 0 ? "core.tarefa = 0 linhas → VERMELHO" : JSON.stringify(r)));

// ── A5 (sem SQL na fonte: são 3 escritas) ──
console.log("\n[A5] a guarda RECUSA (3 tentativas de escrita)\n   SEM SQL DE LEITURA · a prova exige ESCREVER (responsável inativo/inexistente/tipo inválido).");
console.log("        Fora do meu limite (leitura pura). Permanece NÃO MEDIDO — como o Aferidor declarou.");
resultados.push({ id: "A5", estado: "N/A", valor: "prova exige escrita — não executável em leitura pura" });

// ── A6 ──
await criterio("A6", "vocabulário de tipo_tarefa vigente",
  `select jsonb_array_elements(payload -> 'tipos') ->> 'chave' as chave,
          jsonb_array_elements(payload -> 'tipos') ->> 'rotulo' as rotulo
     from core.config
    where nome = 'tipo_tarefa' and versao = (select max(versao) from core.config where nome='tipo_tarefa')`,
  (r) => `${r.length} tipos: ${r.map((x) => x.chave).join(", ")}`);

// ── B3 ──
await criterio("B3a", "mensagem_recebida na última hora",
  `select e.id, e.criado_em, e.origem, e.id_externo, e.lead_id,
          e.payload #>> '{conversa,telefone}'        as telefone,
          e.payload #>> '{conversa,phone_number_id}' as pnid
     from core.evento e
    where e.tipo = 'mensagem_recebida' and e.criado_em > now() - interval '1 hour'
    order by e.criado_em desc`,
  (r) => `${r.length} na última hora`);

await criterio("B3b", "vínculo mensagem→conversa→lead",
  `select m.id, m.conversa_id, c.telefone, c.lead_id, l.telefone as tel_lead
     from core.mensagem m
     join core.conversa c on c.id = m.conversa_id
     left join core.lead l on l.lead_id = c.lead_id
    order by m.criado_em desc limit 5`,
  (r) => `${r.length} linhas; sem lead_id: ${r.filter((x) => !x.lead_id).length}`);

// ── B4 ──
await criterio("B4", "idempotência: (origem, id_externo) duplicado na última hora",
  `select origem, id_externo, count(*) as linhas
     from core.evento
    where tipo = 'mensagem_recebida' and criado_em > now() - interval '1 hour'
    group by origem, id_externo having count(*) > 1`,
  (r) => (r.length === 0 ? "0 duplicatas (mas janela vazia — ver B3a)" : JSON.stringify(r)));

// ── B5 ──
await criterio("B5a", "zero-width preservado na última hora",
  `select e.id, e.criado_em,
          (e.payload::text ~ '[​‌‍⁠]') as tem_zero_width,
          length(e.payload #>> '{mensagem,texto}') as tam_texto
     from core.evento e
    where e.tipo = 'mensagem_recebida' and e.criado_em > now() - interval '1 hour'
    order by e.criado_em desc limit 3`,
  (r) => `${r.length} linhas na janela`);

await criterio("B5b", "core.captacao", "select count(*) as linhas_captacao from core.captacao",
  (r) => `${r[0].linhas_captacao} linhas`);

// ── C1 ──
await criterio("C1", "RLS e policies das 5 tabelas",
  `select c.relnamespace::regnamespace::text||'.'||c.relname as tabela,
          c.relrowsecurity as rls_ligado,
          (select count(*) from pg_policies p
            where p.schemaname = c.relnamespace::regnamespace::text
              and p.tablename = c.relname) as policies
     from pg_class c
    where c.relkind = 'r'
      and c.relname in ('usuario_departamento','capacidade_detector',
                        'captacao_morta','regua_morta','recusa_capacidade')`,
  (r) => r.map((x) => `${x.tabela} rls=${x.rls_ligado} policies=${x.policies}`).join(" | "));

// ── B5 extra: zero-width sobre TODO o histórico (a janela de 1h está vazia) ──
await criterio("B5c", "zero-width em QUALQUER mensagem_recebida já recebida (janela ampliada)",
  `select count(*) filter (where e.payload::text ~ '[​‌‍⁠]') as com_zero_width,
          count(*) as total
     from core.evento e where e.tipo = 'mensagem_recebida'`,
  (r) => `${r[0].com_zero_width} de ${r[0].total} mensagens com zero-width`);

// ── divergência (a): area dos canais ──
// `area` NÃO é coluna de core.canal_whatsapp — mora dentro de `config_jsonb`. Minha primeira
// tentativa (select … , area from core.canal_whatsapp) quebrou com 42703, e a correção é esta.
await criterio("DIV-a", "area dos canais WhatsApp (comentário da porta diz 'comercial')",
  `select numero_e164, phone_number_id, apelido, provedor, ativo,
          config_jsonb ->> 'area' as area
     from core.canal_whatsapp order by apelido`,
  (r) => r.map((x) => `${x.apelido} (${x.numero_e164}): area=${x.area} provedor=${x.provedor} ativo=${x.ativo}`).join(" | "));

// ── divergência (b): nome do evento da régua ──
await criterio("DIV-b", "regua_disparo vs regua_disparada no registro de projetores",
  `select tipo from porta.projetor_registro where tipo like 'regua%' order by 1`,
  (r) => `projetores: ${r.map((x) => x.tipo).join(", ") || "nenhum"}`);

await criterio("DIV-b2", "o tipo é aceito pela taxonomia? (busca nos dois nomes)",
  `select 'projetor_registro' as onde, tipo from porta.projetor_registro where tipo in ('regua_disparo','regua_disparada')
   union all
   select 'evento', tipo from core.evento where tipo in ('regua_disparo','regua_disparada') limit 5`,
  (r) => (r.length === 0 ? "nenhum dos dois nomes encontrado" : JSON.stringify(r)));

// ── resumo ──
console.log("\n" + "=".repeat(78));
console.log("RESUMO — executa / quebra");
console.log("=".repeat(78));
for (const r of resultados) console.log(`  ${r.estado.padEnd(8)} ${r.id.padEnd(6)} ${r.valor}`);
const quebrou = resultados.filter((r) => r.estado === "QUEBRA");
console.log(`\n${resultados.length} comandos · ${quebrou.length} quebraram${quebrou.length ? ": " + quebrou.map((q) => q.id).join(", ") : ""}`);

await c.end();
