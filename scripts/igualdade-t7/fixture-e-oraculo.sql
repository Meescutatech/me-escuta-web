-- IGUALDADE tela x oraculo (RF-9/RF-10). Tudo em transacao, ROLLBACK no fim:
-- a bancada nao guarda uma linha desta conferencia.
begin;

-- Fixture desenhada para acender TODOS os baldes de uma vez. Se os dois lados
-- concordarem com estes numeros, concordam com os casos que importam.
insert into core.captacao
  (id, evento_id, lead_id, fonte, plataforma, campanha_id, campanha_nome,
   anuncio_id, anuncio_nome, utm, clids, hierarquia_estado, capturado_em, criado_em, ultima_posicao)
values
  -- casados com custo (meta/C1): 3 toques, 2 leads distintos
  (gen_random_uuid(), gen_random_uuid(), '11111111-1111-1111-1111-111111111111','meta_leadads','meta','C1','Camp 1','a1','Ad 1','{"cidade":"Sao Paulo"}','{"ctwa_clid":"x1"}','resolvida','2026-08-05T12:00:00Z','2026-08-05T12:00:05Z',1),
  (gen_random_uuid(), gen_random_uuid(), '11111111-1111-1111-1111-111111111111','whatsapp_ctwa','meta','C1','Camp 1','a1','Ad 1','{"cidade":"Sao Paulo"}','{"ctwa_clid":"x2"}','resolvida','2026-08-06T12:00:00Z','2026-08-06T12:00:05Z',2),
  (gen_random_uuid(), gen_random_uuid(), '22222222-2222-2222-2222-222222222222','meta_leadads','meta','C1','Camp 1','a2','Ad 2',null,null,'resolvida','2026-08-07T12:00:00Z','2026-08-07T12:00:05Z',3),
  -- leads SEM custo (google/C7 nao tem linha de custo): 4 toques
  (gen_random_uuid(), gen_random_uuid(), '33333333-3333-3333-3333-333333333333','google_ads','google','C7','Camp 7',null,null,null,'{"gclid":"g1"}','resolvida','2026-08-08T12:00:00Z','2026-08-08T12:00:05Z',4),
  (gen_random_uuid(), gen_random_uuid(), '44444444-4444-4444-4444-444444444444','google_ads','google','C7','Camp 7',null,null,null,null,'resolvida','2026-08-09T12:00:00Z','2026-08-09T12:00:05Z',5),
  (gen_random_uuid(), gen_random_uuid(), '55555555-5555-5555-5555-555555555555','google_ads','google','C7','Camp 7',null,null,null,null,'resolvida','2026-08-10T12:00:00Z','2026-08-10T12:00:05Z',6),
  (gen_random_uuid(), gen_random_uuid(), '66666666-6666-6666-6666-666666666666','google_ads','google','C7','Camp 7',null,null,null,null,'resolvida','2026-08-11T12:00:00Z','2026-08-11T12:00:05Z',7),
  -- CRUZADO: campanha 'C1' do GOOGLE, id igual ao do Meta. NAO pode casar.
  (gen_random_uuid(), gen_random_uuid(), '77777777-7777-7777-7777-777777777777','google_ads','google','C1','Camp 1 do Google',null,null,null,null,'resolvida','2026-08-12T12:00:00Z','2026-08-12T12:00:05Z',8),
  -- sem campanha por FALHA (2) e sem campanha CORRETO (3)
  (gen_random_uuid(), gen_random_uuid(), '88888888-8888-8888-8888-888888888888','whatsapp_ctwa','meta',null,null,null,null,null,'{"ctwa_clid":"orfao1"}','falhou','2026-08-13T12:00:00Z','2026-08-13T12:00:05Z',9),
  (gen_random_uuid(), gen_random_uuid(), '99999999-9999-9999-9999-999999999999','whatsapp_ctwa','meta',null,null,null,null,null,'{"ctwa_clid":"orfao2"}','falhou','2026-08-14T12:00:00Z','2026-08-14T12:00:05Z',10),
  (gen_random_uuid(), gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','indicacao',null,null,null,null,null,null,null,'nao_aplicavel','2026-08-15T12:00:00Z','2026-08-15T12:00:05Z',11),
  (gen_random_uuid(), gen_random_uuid(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','indicacao',null,null,null,null,null,null,null,'nao_aplicavel','2026-08-16T12:00:00Z','2026-08-16T12:00:05Z',12),
  (gen_random_uuid(), gen_random_uuid(), 'cccccccc-cccc-cccc-cccc-cccccccccccc','indicacao',null,null,null,null,null,null,null,'nao_aplicavel','2026-08-17T12:00:00Z','2026-08-17T12:00:05Z',13),
  -- COM campanha e SEM plataforma: metade da chave faltando, nunca casa
  (gen_random_uuid(), gen_random_uuid(), 'dddddddd-dddd-dddd-dddd-dddddddddddd','landing',null,'LP1','Landing',null,null,'{"cidade":"Campinas"}',null,'resolvida','2026-08-18T12:00:00Z','2026-08-18T12:00:05Z',14),
  -- SEM DATA: fora de todo periodo (C-1d)
  (gen_random_uuid(), gen_random_uuid(), 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','meta_leadads','meta','C1','Camp 1',null,null,null,null,'resolvida',null,'2026-08-19T12:00:05Z',15),
  -- FORA DO RECORTE (setembro): nao pode entrar em nenhum balde do periodo
  (gen_random_uuid(), gen_random_uuid(), 'ffffffff-ffff-ffff-ffff-ffffffffffff','meta_leadads','meta','C1','Camp 1',null,null,null,null,'resolvida','2026-09-15T12:00:00Z','2026-09-15T12:00:05Z',16);

-- custo: C1/meta em 3 dias com valores distintos (se multiplicar pelos dias, aparece);
-- C9/meta com gasto e ZERO lead casado.
insert into core.custo_midia (dia, plataforma, campanha_id, campanha_nome, impressoes, cliques, custo, versao_api)
values
  ('2026-08-05','meta','C1','Camp 1',1000,10,100.00,'ensaio_t7'),
  ('2026-08-06','meta','C1','Camp 1',1000,10, 50.00,'ensaio_t7'),
  ('2026-08-07','meta','C1','Camp 1',1000,10, 25.00,'ensaio_t7'),
  ('2026-08-08','meta','C9','Camp 9 (sem lead)',4000,12,500.00,'ensaio_t7'),
  ('2026-09-20','meta','C1','Camp 1',1000,10,999.00,'ensaio_t7');  -- fora do recorte

\echo '=== ORACULO (core.casamento_midia) ==='
select row_to_json(t) from core.casamento_midia('2026-08-01','2026-09-01') t;

\echo '=== LINHAS CRUAS QUE A TELA LERIA ==='
select json_build_object(
  'toques', (select coalesce(json_agg(row_to_json(c)),'[]'::json) from (
      select lead_id, fonte, plataforma, campanha_id, campanha_nome, anuncio_id, anuncio_nome,
             utm, clids, hierarquia_estado, capturado_em, criado_em
        from core.captacao
       where capturado_em >= '2026-08-01' and capturado_em < '2026-09-01') c),
  'custos', (select coalesce(json_agg(row_to_json(m)),'[]'::json) from (
      select dia::text, plataforma, campanha_id, campanha_nome, custo, impressoes, cliques, ingerido_em
        from core.custo_midia
       where dia >= '2026-08-01' and dia < '2026-09-01') m),
  'semData', (select count(*) from core.captacao where capturado_em is null)
);

rollback;
