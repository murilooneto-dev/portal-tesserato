-- supabase/tests/049_consultar_planilha_smoke.sql
--
-- Teste de fumaça de consultar_planilha_linhas. Rodar SÓ no dev, no SQL Editor.
-- Cria uma tabela de teste, roda asserts e desfaz tudo (rollback).
-- Sucesso = aparece a mensagem "049 OK" e nenhum erro.
begin;

do $$
declare
  v_pl uuid := gen_random_uuid();
  c_nome uuid := gen_random_uuid();
  c_num  uuid := gen_random_uuid();
  c_data uuid := gen_random_uuid();
  c_st   uuid := gen_random_uuid();
  r text[];
  n bigint;
begin
  insert into planilhas (id, setor, nome) values (v_pl, 'fiscal', 'smoke 049');
  insert into planilha_colunas (id, planilha_id, nome, tipo, ordem, opcoes) values
    (c_nome, v_pl, 'Nome',   'texto',  0, null),
    (c_num,  v_pl, 'Valor',  'numero', 1, null),
    (c_data, v_pl, 'Data',   'data',   2, null),
    (c_st,   v_pl, 'Status', 'opcoes', 3, '[{"valor":"Feito","cor":"#10b981"},{"valor":"Pendente","cor":"#f59e0b"}]'::jsonb);

  insert into planilha_linhas (planilha_id, ordem, dados) values
    (v_pl, 0, jsonb_build_object(c_nome::text, 'Padaria São José',   c_num::text, 10,    c_data::text, '2026-03-15', c_st::text, 'Feito')),
    (v_pl, 1, jsonb_build_object(c_nome::text, 'Mercado 100% Bom',   c_num::text, 9,     c_data::text, '2026-04-01', c_st::text, 'Pendente')),
    (v_pl, 2, jsonb_build_object(c_nome::text, 'Oficina_do João',    c_num::text, 100,   c_data::text, '2025-12-31', c_st::text, 'Feito')),
    (v_pl, 3, jsonb_build_object(c_nome::text, 'sem numero',         c_num::text, 'abc', c_data::text, 'ontem')),
    (v_pl, 4, '{}'::jsonb);

  -- 1) sem filtros: total 5
  select total into n from consultar_planilha_linhas(v_pl, null, '[]'::jsonb, false, null, null, false, 0, 100) limit 1;
  assert n = 5, 'total sem filtros deveria ser 5, veio ' || coalesce(n::text, 'null');

  -- 2) busca por valor
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, 'padaria', '[]'::jsonb, false, null, null, false, 0, 100) l) into r;
  assert r = array['Padaria São José'], 'busca padaria: ' || r::text;

  -- 3) busca NÃO casa chaves (uuid): os 8 primeiros caracteres do id da coluna só existem nas chaves
  select array(select l.id::text from consultar_planilha_linhas(v_pl, left(c_nome::text, 8), '[]'::jsonb, false, null, null, false, 0, 100) l) into r;
  assert coalesce(array_length(r, 1), 0) = 0, 'busca casou chave do JSON: ' || r::text;

  -- 4) % e _ são literais
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, '100%', '[]'::jsonb, false, null, null, false, 0, 100) l) into r;
  assert r = array['Mercado 100% Bom'], 'busca 100%: ' || r::text;
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, '_do', '[]'::jsonb, false, null, null, false, 0, 100) l) into r;
  assert r = array['Oficina_do João'], 'busca _do: ' || r::text;

  -- 5) filtro numérico: min 10 -> 10 e 100 (o 'abc' legado e o vazio ficam de fora, sem erro)
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null,
      jsonb_build_array(jsonb_build_object('coluna', c_num, 'tipo', 'numero', 'min', 10)), false, null, null, false, 0, 100) l order by 1) into r;
  assert r = array['Oficina_do João', 'Padaria São José'], 'numero min 10: ' || r::text;
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null,
      jsonb_build_array(jsonb_build_object('coluna', c_num, 'tipo', 'numero', 'max', 9)), false, null, null, false, 0, 100) l) into r;
  assert r = array['Mercado 100% Bom'], 'numero max 9: ' || r::text;

  -- 6) filtro de data (o 'ontem' legado fica de fora, sem erro)
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null,
      jsonb_build_array(jsonb_build_object('coluna', c_data, 'tipo', 'data', 'de', '2026-01-01', 'ate', '2026-03-31')), false, null, null, false, 0, 100) l) into r;
  assert r = array['Padaria São José'], 'data: ' || r::text;

  -- 7) filtro de opções e de texto
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null,
      jsonb_build_array(jsonb_build_object('coluna', c_st, 'tipo', 'opcoes', 'v', 'Feito')), false, null, null, false, 0, 100) l order by 1) into r;
  assert r = array['Oficina_do João', 'Padaria São José'], 'opcoes: ' || r::text;
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null,
      jsonb_build_array(jsonb_build_object('coluna', c_nome, 'tipo', 'texto', 'v', 'JOS')), false, null, null, false, 0, 100) l) into r;
  assert r = array['Padaria São José'], 'texto jos: ' || r::text;

  -- 8) ordenação numérica asc/desc: não numéricos (abc, vazio) sempre no fim, na ordem original
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null, '[]'::jsonb, false, c_num, 'numero', false, 0, 100) l) into r;
  assert r = array['Mercado 100% Bom', 'Padaria São José', 'Oficina_do João', 'sem numero', null], 'ordem numero asc: ' || r::text;
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null, '[]'::jsonb, false, c_num, 'numero', true, 0, 100) l) into r;
  assert r = array['Oficina_do João', 'Padaria São José', 'Mercado 100% Bom', 'sem numero', null], 'ordem numero desc: ' || r::text;

  -- 9) ordenação de texto (sem distinguir maiúsculas), vazios no fim
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null, '[]'::jsonb, false, c_nome, 'texto', false, 0, 100) l) into r;
  assert r = array['Mercado 100% Bom', 'Oficina_do João', 'Padaria São José', 'sem numero', null], 'ordem texto asc: ' || r::text;

  -- 10) paginação: total continua 5
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, null, '[]'::jsonb, false, null, null, false, 2, 2) l) into r;
  assert r = array['Oficina_do João', 'sem numero'], 'pagina 2: ' || r::text;
  select total into n from consultar_planilha_linhas(v_pl, null, '[]'::jsonb, false, null, null, false, 2, 2) limit 1;
  assert n = 5, 'total na pagina 2 deveria ser 5, veio ' || coalesce(n::text, 'null');

  -- 11) nenhuma linha casa: total ausente (0 linhas), sem erro
  select array(select l.id::text from consultar_planilha_linhas(v_pl, 'zzzz-nao-existe', '[]'::jsonb, false, null, null, false, 0, 100) l) into r;
  assert coalesce(array_length(r, 1), 0) = 0, 'busca sem resultado deveria vir vazia';

  -- 12) busca acha data no formato exibido (dd/mm), não só o ISO armazenado
  select array(select l.dados ->> c_nome::text from consultar_planilha_linhas(v_pl, '15/03', '[]'::jsonb, false, null, null, false, 0, 100) l) into r;
  assert r = array['Padaria São José'], 'busca 15/03 (data formatada): ' || r::text;

  raise notice '049 OK';
end $$;

rollback;
select '049 OK (dados de teste desfeitos com rollback)' as resultado;
