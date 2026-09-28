-- supabase/tests/051_reenvio_smoke.sql
--
-- Teste de fumaça de aplicar_reenvio_planilha. Rodar SÓ no dev, no SQL
-- Editor. Cria dados de teste, roda asserts e desfaz tudo (rollback).
-- Sucesso = aparece a mensagem "051 OK" e nenhum erro.
begin;

do $$
declare
  v_pl uuid := gen_random_uuid();
  v_pl2 uuid := gen_random_uuid();
  c_chave uuid := gen_random_uuid();
  c_b uuid := gen_random_uuid();
  v_linha1 uuid := gen_random_uuid();
  v_linha_pl2 uuid := gen_random_uuid();
  v_novo_id uuid;
  v_dados jsonb;
  v_ok boolean;
  v_total_log int;
begin
  insert into planilhas (id, setor, nome, coluna_chave) values (v_pl, 'fiscal', 'smoke 051', c_chave);
  insert into planilha_colunas (id, planilha_id, nome, tipo, ordem, opcoes) values
    (c_chave, v_pl, 'Chave', 'texto', 0, null),
    (c_b, v_pl, 'Coluna B', 'texto', 1, null);

  insert into planilha_linhas (id, planilha_id, ordem, dados) values
    (v_linha1, v_pl, 0, jsonb_build_object(c_chave::text, 'ABC', c_b::text, 'valor antigo'));

  insert into planilhas (id, setor, nome) values (v_pl2, 'fiscal', 'smoke 051 (planilha 2)');
  insert into planilha_linhas (id, planilha_id, ordem, dados) values
    (v_linha_pl2, v_pl2, 0, jsonb_build_object(c_chave::text, 'não deveria mudar'));

  -- 1) linha nova inserida
  select aplicar_reenvio_planilha(
    v_pl,
    jsonb_build_array(jsonb_build_object('dados', jsonb_build_object(c_chave::text, 'XYZ', c_b::text, 'novo'), 'clienteId', null)),
    '[]'::jsonb,
    null, 'Teste', '{}'::jsonb
  ) into v_ok;
  assert v_ok, 'aplicar reenvio (linha nova) deveria devolver true';
  perform 1 from planilha_linhas where planilha_id = v_pl and dados ->> c_chave::text = 'XYZ';
  assert found, 'linha nova não foi inserida';

  -- 2) atualização de célula existente (guardada por de/para)
  select aplicar_reenvio_planilha(
    v_pl, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('linha', v_linha1, 'coluna', c_b, 'de', 'valor antigo', 'para', 'valor novo')),
    null, 'Teste', '{}'::jsonb
  ) into v_ok;
  assert v_ok, 'aplicar reenvio (atualização) deveria devolver true';
  select dados into v_dados from planilha_linhas where id = v_linha1;
  assert v_dados ->> c_b::text = 'valor novo', 'célula não foi atualizada: ' || v_dados::text;

  -- 3) escrita bloqueada quando "de" não bate mais (edição concorrente):
  -- tenta escrever de novo com o MESMO "de" antigo ('valor antigo'), que já
  -- não é mais o valor atual ('valor novo') — não deve mudar nada
  select aplicar_reenvio_planilha(
    v_pl, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('linha', v_linha1, 'coluna', c_b, 'de', 'valor antigo', 'para', 'sobrescrito?')),
    null, 'Teste', '{}'::jsonb
  ) into v_ok;
  select dados into v_dados from planilha_linhas where id = v_linha1;
  assert v_dados ->> c_b::text = 'valor novo', 'edição concorrente foi sobrescrita indevidamente: ' || v_dados::text;

  -- 4) escrita cruzada entre tabelas bloqueada: id de linha da planilha 2,
  -- passado como se fosse da planilha 1
  select aplicar_reenvio_planilha(
    v_pl, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('linha', v_linha_pl2, 'coluna', c_chave, 'de', 'não deveria mudar', 'para', 'mudou!')),
    null, 'Teste', '{}'::jsonb
  ) into v_ok;
  select dados into v_dados from planilha_linhas where id = v_linha_pl2;
  assert v_dados ->> c_chave::text = 'não deveria mudar', 'escrita cruzada entre tabelas não deveria ter efeito: ' || v_dados::text;

  -- 5) log gravado com o resumo
  select aplicar_reenvio_planilha(
    v_pl, '[]'::jsonb, '[]'::jsonb, null, 'Teste do resumo',
    jsonb_build_object('novas', 1, 'semConflito', 0)
  ) into v_ok;
  select count(*) into v_total_log from planilha_reenvio_log where planilha_id = v_pl and usuario_nome = 'Teste do resumo';
  assert v_total_log = 1, 'log do reenvio não foi gravado';

  -- 6) chave da célula nunca existiu em "dados" (linha nova sem a coluna B
  -- nunca setada) — guarda de/para precisa tratar chave ausente como igual
  -- a SQL NULL, não só o "null" literal já presente em outra linha
  v_novo_id := gen_random_uuid();
  insert into planilha_linhas (id, planilha_id, ordem, dados) values
    (v_novo_id, v_pl, 1, jsonb_build_object(c_chave::text, 'SEM_COLUNA_B'));
  select aplicar_reenvio_planilha(
    v_pl, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('linha', v_novo_id, 'coluna', c_b, 'de', null, 'para', 'preenchido')),
    null, 'Teste', '{}'::jsonb
  ) into v_ok;
  select dados into v_dados from planilha_linhas where id = v_novo_id;
  assert v_dados ->> c_b::text = 'preenchido', 'célula com chave ausente em "dados" não foi atualizada: ' || v_dados::text;

  raise notice '051 OK';
end $$;

rollback;
select '051 OK (dados de teste desfeitos com rollback)' as resultado;
