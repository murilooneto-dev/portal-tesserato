-- supabase/tests/050_estrutura_smoke.sql
--
-- Teste de fumaça das funções de estrutura (migration 050). Rodar SÓ no dev,
-- no SQL Editor. Cria uma tabela de teste, roda asserts e desfaz tudo
-- (rollback). Sucesso = aparece a mensagem "050 OK" e nenhum erro.
begin;

do $$
declare
  v_pl uuid := gen_random_uuid();
  v_pl2 uuid := gen_random_uuid();
  c_a uuid := gen_random_uuid();
  c_b uuid := gen_random_uuid();
  c_c uuid := gen_random_uuid();
  c_cliente uuid := gen_random_uuid();
  v_cliente_teste uuid := gen_random_uuid();
  v_linha_pl2 uuid := gen_random_uuid();
  v_nova uuid;
  v_ok boolean;
  v_tipo text;
  v_ordem_a int;
  v_ordem_b int;
  v_total bigint;
  v_preenchidas bigint;
  v_dados jsonb;
  v_erro_capturado boolean := false;
  v_linha_c uuid;
  v_coluna_chave uuid;
begin
  insert into clientes (id, nome) values (v_cliente_teste, 'Cliente smoke 050');

  insert into planilhas (id, setor, nome) values (v_pl, 'fiscal', 'smoke 050');
  insert into planilha_colunas (id, planilha_id, nome, tipo, ordem, opcoes) values
    (c_a, v_pl, 'Coluna A', 'texto', 0, null),
    (c_b, v_pl, 'Coluna B', 'texto', 1, null),
    (c_c, v_pl, 'Coluna C', 'texto', 2, null),
    (c_cliente, v_pl, 'Cliente', 'cliente', 3, null);

  insert into planilha_linhas (planilha_id, ordem, dados) values
    (v_pl, 0, jsonb_build_object(c_a::text, '10', c_b::text, 'abc')),
    (v_pl, 1, jsonb_build_object(c_a::text, '20'));

  -- linha com valor null explícito na chave (importação/edição sempre
  -- escrevem a chave, até com null) — não deve contar como preenchida
  insert into planilha_linhas (planilha_id, ordem, dados) values
    (v_pl, 2, jsonb_build_object(c_b::text, null));

  -- segunda planilha, usada no teste de proteção contra escrita cruzada
  insert into planilhas (id, setor, nome) values (v_pl2, 'fiscal', 'smoke 050 (planilha 2)');
  insert into planilha_linhas (id, planilha_id, ordem, dados) values
    (v_linha_pl2, v_pl2, 0, jsonb_build_object(c_a::text, 'não deveria mudar'));

  -- 1) adicionar coluna: entra no fim (ordem 4)
  select adicionar_coluna_planilha(v_pl, 'Coluna Nova', 'numero', null) into v_nova;
  assert v_nova is not null, 'adicionar coluna deveria devolver um id';
  perform 1 from planilha_colunas where id = v_nova and ordem = 4;
  assert found, 'coluna nova deveria ter ordem 4';

  -- 2) renomear coluna: não mexe em dados
  select renomear_coluna_planilha(c_a, 'Coluna A renomeada') into v_ok;
  assert v_ok, 'renomear deveria devolver true';
  select dados into v_dados from planilha_linhas where planilha_id = v_pl and ordem = 0;
  assert v_dados ->> c_a::text = '10', 'renomear coluna não deveria mexer em dados: ' || v_dados::text;

  -- 3) mover coluna: c_b sobe (troca ordem com c_a)
  select ordem into v_ordem_a from planilha_colunas where id = c_a;
  select ordem into v_ordem_b from planilha_colunas where id = c_b;
  select mover_coluna_planilha(c_b, 'cima') into v_ok;
  assert v_ok, 'mover cima deveria devolver true';
  perform 1 from planilha_colunas where id = c_b and ordem = v_ordem_a;
  assert found, 'c_b deveria ter assumido a ordem de c_a';
  perform 1 from planilha_colunas where id = c_a and ordem = v_ordem_b;
  assert found, 'c_a deveria ter assumido a ordem de c_b';

  -- 4) mover na ponta: primeira coluna pedindo "cima" devolve false, sem erro
  select mover_coluna_planilha(c_b, 'cima') into v_ok;
  assert v_ok = false, 'mover a primeira coluna pra cima deveria devolver false';

  -- 5) contar células da coluna A: 3 linhas no total (a terceira não tem a
  -- chave de A), 2 preenchidas
  select total, preenchidas into v_total, v_preenchidas from contar_celulas_coluna(c_a);
  assert v_total = 3 and v_preenchidas = 2, 'contagem coluna A: total=' || v_total || ' preenchidas=' || v_preenchidas;

  -- 6) contar células da coluna B: 3 linhas no total; a chave presente com
  -- valor null explícito NÃO conta como preenchida (achado I2) — só 1
  -- preenchida (a linha 'abc')
  select total, preenchidas into v_total, v_preenchidas from contar_celulas_coluna(c_b);
  assert v_total = 3 and v_preenchidas = 1, 'contagem coluna B: total=' || v_total || ' preenchidas=' || v_preenchidas;

  -- 7) trocar tipo da coluna C (texto -> numero) com o novo formato
  -- {id, de, para}: uma linha converte de verdade, outra (fora da lista,
  -- porque não mudou) permanece intocada
  v_linha_c := gen_random_uuid();
  insert into planilha_linhas (id, planilha_id, ordem, dados) values
    (v_linha_c, v_pl, 3, jsonb_build_object(c_c::text, '10'));
  insert into planilha_linhas (planilha_id, ordem, dados) values
    (v_pl, 4, jsonb_build_object(c_c::text, 'permanece'));

  select trocar_tipo_coluna_planilha(
    c_c, 'numero', null,
    jsonb_build_array(jsonb_build_object('id', v_linha_c, 'de', '10', 'para', 20))
  ) into v_ok;
  assert v_ok, 'trocar tipo deveria devolver true';
  select tipo into v_tipo from planilha_colunas where id = c_c;
  assert v_tipo = 'numero', 'coluna C deveria estar com tipo numero, veio ' || v_tipo;
  select dados into v_dados from planilha_linhas where id = v_linha_c;
  assert v_dados ->> c_c::text = '20', 'linha convertida deveria ter valor novo (20): ' || v_dados::text;
  select dados into v_dados from planilha_linhas where planilha_id = v_pl and ordem = 4;
  assert v_dados ->> c_c::text = 'permanece', 'linha fora de p_valores não deveria mudar: ' || v_dados::text;

  -- 7b) proteção contra escrita cruzada entre tabelas (achado I1a): id de
  -- linha da SEGUNDA planilha, coluna da PRIMEIRA — o UPDATE filtra por
  -- planilha_id = v_planilha (derivado da própria coluna), então a linha
  -- da outra planilha não pode ser alterada mesmo que o id seja passado
  select trocar_tipo_coluna_planilha(
    c_a, 'texto', null,
    jsonb_build_array(jsonb_build_object('id', v_linha_pl2, 'de', 'não deveria mudar', 'para', 'mudou!'))
  ) into v_ok;
  select dados into v_dados from planilha_linhas where id = v_linha_pl2;
  assert v_dados ->> c_a::text = 'não deveria mudar', 'escrita cruzada entre tabelas não deveria ter efeito: ' || v_dados::text;

  -- 8) trocar tipo recusa coluna cliente (origem)
  begin
    perform trocar_tipo_coluna_planilha(c_cliente, 'texto', null, '[]'::jsonb);
    v_erro_capturado := false;
  exception when others then
    v_erro_capturado := true;
  end;
  assert v_erro_capturado, 'trocar tipo da coluna cliente deveria levantar erro';

  -- 9) trocar tipo recusa tipo cliente como destino
  begin
    perform trocar_tipo_coluna_planilha(c_a, 'cliente', null, '[]'::jsonb);
    v_erro_capturado := false;
  exception when others then
    v_erro_capturado := true;
  end;
  assert v_erro_capturado, 'trocar tipo para cliente deveria levantar erro';

  -- 10) excluir coluna A: some de TODAS as linhas, não só de uma
  select excluir_coluna_planilha(c_a) into v_ok;
  assert v_ok, 'excluir coluna deveria devolver true';
  perform 1 from planilha_linhas where planilha_id = v_pl and dados ? c_a::text;
  assert not found, 'coluna A ainda aparece em alguma linha depois de excluída';
  perform 1 from planilha_colunas where id = c_a;
  assert not found, 'coluna A ainda existe em planilha_colunas depois de excluída';

  -- 10b) excluir a coluna_chave da planilha limpa planilhas.coluna_chave
  -- (achado I4)
  update planilhas set coluna_chave = c_b where id = v_pl;
  select excluir_coluna_planilha(c_b) into v_ok;
  assert v_ok, 'excluir coluna B deveria devolver true';
  select coluna_chave into v_coluna_chave from planilhas where id = v_pl;
  assert v_coluna_chave is null, 'coluna_chave deveria ter sido limpa ao excluir a coluna que ela apontava';

  -- 10c) excluir a coluna tipo cliente limpa cliente_id de todas as linhas
  -- (achado I4). A FK de cliente_id exige um cliente real existente — o
  -- cliente de teste inserido no início (v_cliente_teste) cobre isso, e
  -- tudo é desfeito no rollback do fim do arquivo.
  update planilha_linhas set cliente_id = v_cliente_teste where planilha_id = v_pl and ordem = 0;
  select excluir_coluna_planilha(c_cliente) into v_ok;
  assert v_ok, 'excluir coluna cliente deveria devolver true';
  perform 1 from planilha_linhas where planilha_id = v_pl and cliente_id is not null;
  assert not found, 'cliente_id deveria ter sido limpo em todas as linhas ao excluir a coluna cliente';

  -- 11) renomear planilha
  select renomear_planilha(v_pl, 'smoke 050 renomeada') into v_ok;
  assert v_ok, 'renomear planilha deveria devolver true';
  perform 1 from planilhas where id = v_pl and nome = 'smoke 050 renomeada';
  assert found, 'nome da planilha não foi atualizado';

  raise notice '050 OK';
end $$;

rollback;
select '050 OK (dados de teste desfeitos com rollback)' as resultado;
