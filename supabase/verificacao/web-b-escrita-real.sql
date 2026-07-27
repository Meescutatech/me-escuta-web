-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- PORTÃO DE ESCRITA REAL DA WEB-B (R16-20 · Agent 2 · Trilha E)
--
-- O QUE ESTE ARQUIVO PROVA, e por que ele existe: as 10 regras `ação → conferência` da Web-B
-- (`components/configuracoes/regras/porta.ts`) dizem, para cada tipo de evento, ONDE reler e COM
-- QUAL FILTRO para saber que a escrita virou dado. Elas foram escritas contra o contrato, e até
-- agora só foram testadas PURAS. Uma regra com a fonte, a coluna ou o filtro errado reprovaria
-- toda escrita bem-sucedida — que é pior que o defeito original, porque o operador para de
-- confiar na tela e a escrita DE VERDADE aconteceu.
--
-- Regra do Orquestrador (E-020): a linha só migra para a tabela `CONFERENCIA` do F6 junto de um
-- caso que a exercite com ESCRITA REAL. Este é o caso.
--
-- COMO RODAR (worktree do Agent 3, stack `db-r16-c` com 0067–0082 aplicadas):
--
--     db roteiro supabase/verificacao/web-b-escrita-real.sql
--
--   · VERDE  = rc 0 e o último `NOTICE` é `PORTAO WEB-B: VERDE`.
--   · VERMELHO = qualquer `raise exception`; `db roteiro` aborta com rc≠0 e nada fica gravado.
--
-- NADA PERSISTE. O arquivo abre `begin` e termina em `rollback`. Consequência DECLARADA, porque
-- ela muda o que dá para asserir: o rollback desfaz também `pgmq.send` e `ops.registrar_descarte`.
-- Por isso TODA asserção de contador é feita DENTRO da transação — não existe aqui nenhuma
-- afirmação sobre estado pós-rollback, e não deve existir.
--
-- LIMITE CONHECIDO, dito antes que alguém leia o verde como mais do que ele é: `db roteiro`
-- conecta como dono do banco, então RLS não é exercida aqui. Este portão prova a PROJEÇÃO e as
-- GUARDAS da porta — que é o que a regra de conferência lê. Quem prova RLS é o pgTAP 39-43, que
-- roda com `set local role authenticated`.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

begin;

set local search_path = public, extensions;

-- ── ator: um owner semeado só para este roteiro. `api.registrar_evento` força `ator` e `origem`
--    a partir do JWT, então sem estas duas linhas nada abaixo tem papel e todas as guardas de
--    gestão recusariam — o portão ficaria vermelho por motivo errado.
--
--    E NÃO há `set local role authenticated` de propósito, ao contrário do pgTAP: o bloco 5 lê
--    `ops.descarte_borda`, e `authenticated` não tem USAGE em `ops` (nem deve ter). Trocar o papel
--    aqui deixaria o portão vermelho por permissão, medindo a coisa errada. É por isso também que
--    este arquivo NÃO afirma nada sobre RLS — está dito no cabeçalho.
select porta.semear_usuario('{"usuario_id":"00000000-0000-4000-8000-0000000000b2",
                              "email":"portao-web-b@meescuta.com","papel":"owner","nome":"Portao Web-B"}'::jsonb);
select set_config('request.jwt.claims',
                  '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1 · VACUIDADE — os objetos que as regras leem EXISTEM, e a base não está vazia onde importa.
--     Sem esta parte, um `where` que não acha nada e um objeto que não existe são o mesmo verde.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare v_faltando text;
begin
  select string_agg(o, ', ') into v_faltando
    from unnest(array['core.v_canal_whatsapp','core.v_suporte_ticket','core.v_config_vigente',
                      'core.v_config_historico','core.v_sessao_canal','core.v_descarte_borda']) as o
   where to_regclass(o) is null;
  if v_faltando is not null then
    raise exception 'VACUIDADE: as views que a Web-B lê não existem neste banco: %', v_faltando;
  end if;

  if (select count(*) from core.config) = 0 then
    raise exception 'VACUIDADE: core.config vazia — a prova de config_publicada não mediria nada';
  end if;
  if to_regprocedure('ops.registrar_descarte(text,text,int)') is null then
    raise exception 'VACUIDADE: ops.registrar_descarte não existe (0081 não aplicada?)';
  end if;
  raise notice 'OK vacuidade: as 6 views, core.config e ops.registrar_descarte existem';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2 · CONTROLE NEGATIVO A — a releitura NÃO é vacuamente verdadeira.
--     Mesmo formato de consulta das regras, com o filtro ERRADO de propósito: tem de achar zero.
--     Se esta parte passasse, todo o resto seria verde sem medir.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
do $$
begin
  if exists (select 1 from core.v_canal_whatsapp where canal_id = 'lite:nao-existe-b2') then
    raise exception 'CONTROLE NEGATIVO: a releitura achou um canal que nunca foi escrito';
  end if;
  if exists (select 1 from core.v_suporte_ticket
              where id = '00000000-0000-4000-8000-00000000dead'::uuid) then
    raise exception 'CONTROLE NEGATIVO: a releitura achou um ticket que nunca foi escrito';
  end if;
  raise notice 'OK controle negativo A: filtro sem escrita correspondente devolve zero';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3 · CONTROLE NEGATIVO B — as guardas que a UI espelha RECUSAM de verdade.
--     Cada uma destas é uma regra da tela (`regras/canais.ts`, `regras/config.ts`,
--     `regras/suporte.ts`). Se o banco parasse de recusar, a tela viraria a única guarda — que é
--     exatamente o que a Constituição não permite.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare v_ok int := 0;
begin
  -- (a) canal não oficial com id fora de `lite:<slug>`
  begin
    perform api.registrar_evento(jsonb_build_object(
      'tipo','canal_registrado','id_externo','b2-neg-1','versao_payload',1,
      'payload', jsonb_build_object('canal_id','jade','nome','Jade','provedor','nao_oficial')));
    raise exception 'FALHOU: a porta ACEITOU canal nao_oficial sem o prefixo lite:';
  exception when invalid_parameter_value then v_ok := v_ok + 1;
  end;

  -- (b) provedor fora do domínio
  begin
    perform api.registrar_evento(jsonb_build_object(
      'tipo','canal_registrado','id_externo','b2-neg-2','versao_payload',1,
      'payload', jsonb_build_object('canal_id','pnid-b2','nome','X','provedor','meta')));
    raise exception 'FALHOU: a porta ACEITOU provedor fora do dominio';
  exception when invalid_parameter_value then v_ok := v_ok + 1;
  end;

  -- (c) payload de canal com cara de segredo (a guarda antissegredo que a tela espelha)
  begin
    perform api.registrar_evento(jsonb_build_object(
      'tipo','canal_registrado','id_externo','b2-neg-3','versao_payload',1,
      'payload', jsonb_build_object('canal_id','pnid-b2','nome','X','provedor','waba',
                                    'access_token','EAAxxxxxxxxxxxxxxxxxxxxxx')));
    raise exception 'FALHOU: a porta ACEITOU segredo no payload de canal';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- (d) ticket com anexo fora do prefixo <uid>/ — a RLS do bucket DEPENDE desse prefixo
  begin
    perform api.registrar_evento(jsonb_build_object(
      'tipo','suporte_ticket_aberto','id_externo','b2-neg-4','versao_payload',1,
      'payload', jsonb_build_object('tipo','bug','titulo','t','descricao','d',
        'anexos', jsonb_build_array(jsonb_build_object('caminho','outro-uid/x/print.png')))));
    raise exception 'FALHOU: a porta ACEITOU anexo fora do prefixo do autor';
  exception when invalid_parameter_value then v_ok := v_ok + 1;
  end;

  -- (e) config com versao_base velha  →  serialization_failure (40001), a trava otimista do F14
  begin
    perform api.registrar_evento(jsonb_build_object(
      'tipo','config_publicada','id_externo','b2-neg-5','versao_payload',1,
      'payload', jsonb_build_object('nome','convite','versao_base',0,
                                    'conteudo', jsonb_build_object('dias_validade',7))));
    raise exception 'FALHOU: a porta ACEITOU publicacao sobre versao_base velha';
  exception when serialization_failure then v_ok := v_ok + 1;
  end;

  -- (f) flag.* não se publica pela tela (ARB-18.3)
  begin
    perform api.registrar_evento(jsonb_build_object(
      'tipo','config_publicada','id_externo','b2-neg-6','versao_payload',1,
      'payload', jsonb_build_object('nome','flag.walking_skeleton','versao_base',1,
                                    'conteudo', jsonb_build_object('ativa',false))));
    raise exception 'FALHOU: a porta ACEITOU publicacao de flag.*';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  if v_ok <> 6 then
    raise exception 'CONTROLE NEGATIVO B: esperava 6 recusas, contei %', v_ok;
  end if;
  raise notice 'OK controle negativo B: as 6 guardas que a tela espelha recusaram';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4 · A MEDIDA — escrita REAL de cada tipo, e a releitura EXATA da regra correspondente.
--     Cada bloco cita a regra que está sendo provada. Mudar a regra no código sem mudar aqui
--     (ou o contrário) deixa este arquivo vermelho.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_r         jsonb;
  v_evt       uuid;
  v_canal     text := 'lite:portao-b2';
  -- uuid fixo (não `gen_random_uuid()`): o `ticket_id` que a tela manda é o que torna a releitura
  -- determinística, e um id fixo deixa a linha do erro apontar para o mesmo lugar em toda execução.
  v_ticket    uuid := '00000000-0000-4000-8000-0000000000c1';
  v_cfg_vig   int;
begin
  -- ── canal_registrado ──────────────────────────────────────────────────────────────────────
  -- regra: v_canal_whatsapp · canal_id = payload.canal_id
  --        (registrar nasce ativo=false, então `ativo` não serve de prova aqui)
  perform api.registrar_evento(jsonb_build_object(
    'tipo','canal_registrado','id_externo','b2-1','versao_payload',1,
    'payload', jsonb_build_object('canal_id', v_canal, 'nome','Portao B2',
                                  'provedor','nao_oficial','area','comercial')));
  if not exists (select 1 from core.v_canal_whatsapp where canal_id = v_canal) then
    raise exception 'MEDIDA canal_registrado: a regra releu v_canal_whatsapp por canal_id e nao achou';
  end if;
  if (select ativo from core.v_canal_whatsapp where canal_id = v_canal) is not false then
    raise exception 'MEDIDA canal_registrado: canal nasceu LIGADO — cadastrar nao e ligar';
  end if;

  -- ── canal_atualizado ──────────────────────────────────────────────────────────────────────
  -- regra: v_canal_whatsapp · canal_id = payload.canal_id AND nome = payload.nome
  --        (só existir a linha não provaria nada: ela já existia antes)
  perform api.registrar_evento(jsonb_build_object(
    'tipo','canal_atualizado','id_externo','b2-2','versao_payload',1,
    'payload', jsonb_build_object('canal_id', v_canal, 'nome','Portao B2 renomeado')));
  if not exists (select 1 from core.v_canal_whatsapp
                  where canal_id = v_canal and nome = 'Portao B2 renomeado') then
    raise exception 'MEDIDA canal_atualizado: a regra conferiu nome e nao achou';
  end if;

  -- ── canal_consentimento_registrado ────────────────────────────────────────────────────────
  -- regra: v_canal_whatsapp · canal_id = ... AND consentimento_em IS NOT NULL
  --        (é o portão da sessão: "registrado" sem a coluna preenchida liberaria o pareamento)
  perform api.registrar_evento(jsonb_build_object(
    'tipo','canal_consentimento_registrado','id_externo','b2-3','versao_payload',1,
    'payload', jsonb_build_object('canal_id', v_canal,'titular_nome','Fono do Portao',
                                  'texto_versao','v1','meio','whatsapp','aceito_em', now())));
  if not exists (select 1 from core.v_canal_whatsapp
                  where canal_id = v_canal and consentimento_em is not null) then
    raise exception 'MEDIDA canal_consentimento_registrado: consentimento_em continua nulo apos o evento';
  end if;

  -- ── canal_ativado ─────────────────────────────────────────────────────────────────────────
  -- regra: v_canal_whatsapp · canal_id = ... AND ativo = true
  --        (o efeito É o estado; ligar e a linha continuar false é o que o readback pega)
  -- e a guarda do inbox_desde: sem corte, RECUSA — é o que a tela exige antes de deixar clicar.
  begin
    perform api.registrar_evento(jsonb_build_object(
      'tipo','canal_ativado','id_externo','b2-4a','versao_payload',1,
      'payload', jsonb_build_object('canal_id', v_canal)));
    raise exception 'FALHOU: a porta ACEITOU ativar canal sem corte de inbox';
  exception when invalid_parameter_value then
    raise notice 'OK: ativar sem inbox_desde recusado (a tela exige o corte antes)';
  end;
  perform api.registrar_evento(jsonb_build_object(
    'tipo','canal_ativado','id_externo','b2-4b','versao_payload',1,
    'payload', jsonb_build_object('canal_id', v_canal, 'inbox_desde', now())));
  if not exists (select 1 from core.v_canal_whatsapp where canal_id = v_canal and ativo = true) then
    raise exception 'MEDIDA canal_ativado: a regra conferiu ativo=true e nao achou';
  end if;
  if (select inbox_desde from core.v_canal_whatsapp where canal_id = v_canal) is null then
    raise exception 'MEDIDA canal_ativado: inbox_desde nao chegou na view (A-1 do adendo)';
  end if;

  -- ── canal_desativado ──────────────────────────────────────────────────────────────────────
  -- regra: v_canal_whatsapp · canal_id = ... AND ativo = false
  perform api.registrar_evento(jsonb_build_object(
    'tipo','canal_desativado','id_externo','b2-5','versao_payload',1,
    'payload', jsonb_build_object('canal_id', v_canal, 'motivo','portao')));
  if not exists (select 1 from core.v_canal_whatsapp where canal_id = v_canal and ativo = false) then
    raise exception 'MEDIDA canal_desativado: a regra conferiu ativo=false e nao achou';
  end if;

  -- ── config_publicada ──────────────────────────────────────────────────────────────────────
  -- regra: v_config_vigente · nome = payload.nome AND versao = payload.versao_base + 1
  --        (conferir só o nome passaria com a versão VELHA — é a diferença que importa)
  select max(versao) into v_cfg_vig from core.config where nome = 'convite';
  -- vacuidade local: sem a chave, `versao_base` iria nula e a porta recusaria com "obrigatorio" —
  -- vermelho verdadeiro, mensagem enganosa. Melhor dizer que faltou a semente.
  if v_cfg_vig is null then
    raise exception 'VACUIDADE: a config "convite" nao existe neste banco (a 0035 semeia) — '
                    'sem ela a prova de config_publicada mediria a mensagem errada';
  end if;
  perform api.registrar_evento(jsonb_build_object(
    'tipo','config_publicada','id_externo','b2-6','versao_payload',1,
    'payload', jsonb_build_object('nome','convite','versao_base', v_cfg_vig,
      'conteudo', jsonb_build_object('dias_validade', 9, 'envio_email_ativo', false),
      'motivo','portao da Web-B')));
  if not exists (select 1 from core.v_config_vigente
                  where nome = 'convite' and versao = v_cfg_vig + 1) then
    raise exception 'MEDIDA config_publicada: a regra conferiu versao_base+1 e nao achou';
  end if;
  -- e o histórico passa a mostrar QUEM publicou — a coluna evento_id, NULL em 100% das linhas
  -- desde a 0001, finalmente preenchida pela porta nova (era o N-23 do contrato).
  if (select evento_id from core.v_config_historico
       where nome = 'convite' and versao = v_cfg_vig + 1) is null then
    raise exception 'MEDIDA config_publicada: evento_id continua nulo — o historico nao teria autor';
  end if;

  -- ── suporte_ticket_aberto ─────────────────────────────────────────────────────────────────
  -- regra: v_suporte_ticket · id = payload.ticket_id
  --        (mandamos o ticket_id de propósito: é o que torna a releitura determinística)
  perform api.registrar_evento(jsonb_build_object(
    'tipo','suporte_ticket_aberto','id_externo','b2-7','versao_payload',1,
    'payload', jsonb_build_object('ticket_id', v_ticket,'tipo','bug',
      'titulo','O portao da Web-B abriu este','descricao','escrita real, dentro de transacao',
      'onde','/configuracoes/canais',
      'anexos', jsonb_build_array(jsonb_build_object(
        'caminho','00000000-0000-4000-8000-0000000000b2/' || v_ticket::text || '/print.png',
        'mime','image/png','nome','print.png','bytes',1024)))));
  if not exists (select 1 from core.v_suporte_ticket where id = v_ticket) then
    raise exception 'MEDIDA suporte_ticket_aberto: a regra releu v_suporte_ticket por id e nao achou';
  end if;
  if (select numero from core.v_suporte_ticket where id = v_ticket) is null then
    raise exception 'MEDIDA suporte_ticket_aberto: `numero` nulo — o codigo citavel S-### sai dele';
  end if;

  -- ── suporte_ticket_comentado ──────────────────────────────────────────────────────────────
  -- regra: suporte_ticket_comentario · id = evento_id
  --        (a tabela não tem coluna de posição; o comentário nasce com id = evento.id)
  v_r := api.registrar_evento(jsonb_build_object(
    'tipo','suporte_ticket_comentado','id_externo','b2-8','versao_payload',1,
    'payload', jsonb_build_object('ticket_id', v_ticket,'texto','comentario do portao')));
  v_evt := (v_r ->> 'evento_id')::uuid;
  if v_evt is null then
    raise exception 'MEDIDA suporte_ticket_comentado: a porta nao devolveu evento_id — sem ele nao ha releitura';
  end if;
  if not exists (select 1 from core.suporte_ticket_comentario where id = v_evt) then
    raise exception 'MEDIDA suporte_ticket_comentado: a regra releu por evento_id e nao achou';
  end if;

  -- ── suporte_ticket_resolvido ──────────────────────────────────────────────────────────────
  -- regra: v_suporte_ticket · id = payload.ticket_id AND status = 'resolvido'
  perform api.registrar_evento(jsonb_build_object(
    'tipo','suporte_ticket_resolvido','id_externo','b2-9','versao_payload',1,
    'payload', jsonb_build_object('ticket_id', v_ticket,'resolucao','fechado pelo portao')));
  if not exists (select 1 from core.v_suporte_ticket where id = v_ticket and status = 'resolvido') then
    raise exception 'MEDIDA suporte_ticket_resolvido: a regra conferiu status e nao achou';
  end if;

  -- ── aceite_contato_registrado ─────────────────────────────────────────────────────────────
  -- EXCEÇÃO declarada: ledger-only por desenho (CONTRATO-C §5.5). A conferência é a existência
  -- do evento — e a prova de que a exceção é legítima é `sem_projetor` no registro da 0073.
  v_r := api.registrar_evento(jsonb_build_object(
    'tipo','aceite_contato_registrado','id_externo','b2-10','versao_payload',1,
    'payload', jsonb_build_object('telefone','5599000000091','meio','presencial')));
  v_evt := (v_r ->> 'evento_id')::uuid;
  if not exists (select 1 from core.evento where id = v_evt) then
    raise exception 'MEDIDA aceite_contato_registrado: o evento nao esta no ledger';
  end if;
  if not exists (select 1 from porta.projetor_registro
                  where tipo = 'aceite_contato_registrado' and sem_projetor) then
    raise exception 'MEDIDA aceite_contato_registrado: a excecao da Web-B diz ledger-only, mas o '
                    'registro do banco declara projetor — os dois lados divergiram';
  end if;
  -- e o aceite passa a valer para o oráculo do filtro (é para isso que ele existe)
  if not core.contraparte_conhecida('5599000000091', now() + interval '1 second') then
    raise exception 'MEDIDA aceite_contato_registrado: o aceite nao tornou a contraparte conhecida';
  end if;

  raise notice 'OK medida: os 9 tipos com projecao releram pela regra da Web-B, e a excecao esta declarada nos dois lados';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 5 · O CONTADOR CEGO — asserido DENTRO da transação, de propósito.
--     `ops.registrar_descarte` é `insert ... on conflict do update`, e o rollback o desfaz junto
--     com tudo. Qualquer asserção sobre o contador depois do rollback mediria o mundo, não este
--     roteiro. Aqui se prova (a) que ele soma e (b) que a tabela não tem onde guardar PII.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare v_qtd bigint; v_antes bigint;
begin
  select coalesce(quantidade, 0) into v_antes from ops.descarte_borda
   where canal_id = 'lite:portao-b2' and motivo = 'contraparte_desconhecida'
     and dia = (now() at time zone 'America/Sao_Paulo')::date;
  v_antes := coalesce(v_antes, 0);

  perform ops.registrar_descarte('lite:portao-b2','contraparte_desconhecida');
  perform ops.registrar_descarte('lite:portao-b2','contraparte_desconhecida');

  select quantidade into v_qtd from ops.descarte_borda
   where canal_id = 'lite:portao-b2' and motivo = 'contraparte_desconhecida'
     and dia = (now() at time zone 'America/Sao_Paulo')::date;
  if coalesce(v_qtd, 0) - v_antes <> 2 then
    raise exception 'CONTADOR: duas chamadas somaram % (esperado 2)', coalesce(v_qtd,0) - v_antes;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'ops' and table_name = 'descarte_borda'
                and column_name ~* 'telefone|corpo|conteudo|payload|id_externo|wamid') then
    raise exception 'CONTADOR: a tabela do contador tem coluna que pode guardar PII';
  end if;

  -- a view que a tela lê traz SÓ o que a allowlist do componente aceita
  if exists (select 1 from information_schema.columns
              where table_schema = 'core' and table_name = 'v_descarte_borda'
                and column_name not in ('canal_id','canal_nome','provedor','dia','motivo',
                                        'quantidade','primeiro_em','ultimo_em')) then
    raise exception 'CONTADOR: v_descarte_borda ganhou coluna fora da allowlist da tela';
  end if;
  raise notice 'OK contador: soma dentro da transacao, sem coluna de PII, view dentro da allowlist';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 6 · O QUE O READBACK AINDA PEGA que o registro da 0073 NÃO pega.
--     A 0073 matou o "tipo sem ramo passa calado": tipo sem linha em `porta.projetor_registro`
--     agora é EXCEÇÃO na porta. Isso é ótimo — e não substitui o readback, porque cobre o tipo
--     ESQUECIDO, não o projetor que RODA e não escreve a linha esperada. Este bloco prova as
--     duas coisas: que o banco recusa o tipo desconhecido, e que a releitura por estado seria a
--     única a perceber um projetor que grava a coisa errada.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare v_aceitou boolean := false; v_estado text;
begin
  -- ARMADILHA EVITADA, e ela vale para qualquer portão escrito assim: o `raise exception 'FALHOU'`
  -- de dentro de um bloco com `exception when ...` é levantado com o sqlstate P0001. Um handler
  -- que capture P0001 (ou `when others`) engole a PRÓPRIA acusação de falha e devolve verde. Por
  -- isso aqui nada é levantado dentro do `begin` interno: o desfecho vira dado, e o julgamento
  -- acontece depois, fora do alcance de qualquer handler.
  begin
    perform api.registrar_evento(jsonb_build_object(
      'tipo','canal_despareado_inventado','id_externo','b2-11','versao_payload',1,
      'payload', jsonb_build_object('canal_id','lite:portao-b2')));
    v_aceitou := true;
  exception
    when others then v_estado := sqlstate;
  end;

  if v_aceitou then
    raise exception 'FALHOU: a porta ACEITOU tipo sem linha em porta.projetor_registro';
  end if;
  if v_estado is distinct from 'PMEE1' then
    raise exception 'FALHOU: tipo desconhecido foi recusado com sqlstate % — esperado PMEE1, o da '
                    '0073. A recusa existe, mas nao e a que este portao afirma medir', v_estado;
  end if;
  raise notice 'OK: tipo sem registro e recusado com PMEE1 (a 0073 matou o fall-through silencioso)';

  -- o que o registro NÃO cobre: projetor presente que não produz o estado esperado. A releitura
  -- por ESTADO (ativo=true, status='resolvido', versao_base+1) é a única que percebe — é por isso
  -- que as regras da Web-B conferem efeito, e não a existência da linha.
  if exists (select 1 from core.v_canal_whatsapp where canal_id = 'lite:portao-b2' and ativo = true) then
    raise exception 'CONSISTENCIA: o canal deveria estar desligado neste ponto do roteiro';
  end if;
  raise notice 'OK: a releitura por estado distingue "linha existe" de "estado esperado"';
end $$;

do $$ begin raise notice 'PORTAO WEB-B: VERDE'; end $$;

rollback;
