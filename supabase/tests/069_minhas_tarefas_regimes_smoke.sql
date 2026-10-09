-- supabase/tests/069_minhas_tarefas_regimes_smoke.sql
--
-- Teste de fumaça da migration 069 (rodar no dev e, depois, em produção;
-- não altera nada, termina em rollback). Confere a tabela, as policies e que
-- só o admin grava (usuário comum só lê). Sucesso = "069 OK".
begin;

do $$
declare
  v_comum uuid;
  v_outro uuid;
  v_qtd int;
begin
  perform 1 from pg_tables where schemaname = 'public' and tablename = 'minhas_tarefas_regimes';
  assert found, 'falta a tabela minhas_tarefas_regimes';
  select count(*) into v_qtd from pg_policies where tablename = 'minhas_tarefas_regimes';
  assert v_qtd = 2, format('esperadas 2 policies em minhas_tarefas_regimes, achei %s', v_qtd);
  perform 1 from pg_class where relname = 'minhas_tarefas_regimes' and relrowsecurity;
  assert found, 'RLS desligada em minhas_tarefas_regimes';

  select id into v_comum from profiles where role <> 'admin' order by id limit 1;
  select id into v_outro from profiles where role <> 'admin' and id <> v_comum order by id limit 1;

  if v_comum is null or v_outro is null then
    raise notice 'menos de dois perfis não-admin: pulei o teste de escrita';
  else
    -- Linha de outra pessoa, criada como postgres. O setor de teste não
    -- colide com linha real de nenhum usuário.
    insert into minhas_tarefas_regimes (user_id, setor, regimes) values (v_outro, '__teste_069__', array['MEI']);

    perform set_config('request.jwt.claims', json_build_object('sub', v_comum, 'role', 'authenticated')::text, true);
    set local role authenticated;

    -- Lê a linha dos outros (as telas do Fiscal precisam).
    assert (select count(*) from minhas_tarefas_regimes where setor = '__teste_069__') = 1,
      'autenticado não consegue ler os regimes dos outros';

    -- Não cria linha, nem a própria.
    begin
      insert into minhas_tarefas_regimes (user_id, setor, regimes) values (v_comum, '__teste_069__', array['Lucro Real']);
      assert false, 'usuário comum criou a própria linha';
    exception when insufficient_privilege then
      null;
    end;

    begin
      insert into minhas_tarefas_regimes (user_id, setor, regimes) values (v_outro, '__teste_069_b__', array['X']);
      assert false, 'usuário comum criou linha em nome de outra pessoa';
    exception when insufficient_privilege then
      null;
    end;

    -- Não altera linha nenhuma (0 linhas afetadas).
    update minhas_tarefas_regimes set regimes = array['X'] where user_id = v_outro and setor = '__teste_069__';
    get diagnostics v_qtd = row_count;
    assert v_qtd = 0, 'usuário comum alterou os regimes de outra pessoa';

    reset role;
  end if;

  raise notice '069 OK';
end $$;

rollback;
