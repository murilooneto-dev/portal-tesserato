-- supabase/tests/066_tarefa_grupos_setor_smoke.sql
--
-- Teste de fumaça da migration 066 (rodar no dev e, depois, em produção;
-- não altera nada, termina em rollback). Confere a tabela, as policies, a
-- unicidade (setor, nome) e que só admin escreve. Sucesso = "066 OK".
begin;

do $$
declare
  v_admin uuid;
  v_comum uuid;
  v_qtd int;
begin
  perform 1 from pg_tables where tablename = 'tarefa_grupos_setor';
  assert found, 'falta a tabela tarefa_grupos_setor';
  select count(*) into v_qtd from pg_policies where tablename = 'tarefa_grupos_setor';
  assert v_qtd = 2, format('esperadas 2 policies em tarefa_grupos_setor, achei %s', v_qtd);
  perform 1 from pg_class where relname = 'tarefa_grupos_setor' and relrowsecurity;
  assert found, 'RLS desligada em tarefa_grupos_setor';

  -- Unicidade (setor, nome), rodando como postgres.
  insert into tarefa_grupos_setor (setor, nome, tarefas) values ('financeiro', '__teste_066__', array['A']);
  begin
    insert into tarefa_grupos_setor (setor, nome, tarefas) values ('financeiro', '__teste_066__', array['B']);
    assert false, 'a unicidade (setor, nome) não barrou o duplicado';
  exception when unique_violation then
    null;
  end;
  -- Mesmo nome em outro setor é permitido.
  insert into tarefa_grupos_setor (setor, nome, tarefas) values ('fiscal', '__teste_066__', array['A']);

  select id into v_admin from profiles where role = 'admin' limit 1;
  select id into v_comum from profiles where role <> 'admin' limit 1;

  if v_comum is null then
    raise notice 'sem perfil não-admin: pulei o teste de escrita bloqueada';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_comum, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert (select count(*) from tarefa_grupos_setor where nome = '__teste_066__') = 2, 'não-admin não consegue ler os grupos';
    begin
      insert into tarefa_grupos_setor (setor, nome, tarefas) values ('financeiro', '__teste_066_comum__', array['A']);
      assert false, 'não-admin conseguiu inserir em tarefa_grupos_setor';
    exception when insufficient_privilege then
      null;
    end;
    reset role;
  end if;

  if v_admin is null then
    raise notice 'sem perfil admin: pulei o teste de escrita do admin';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into tarefa_grupos_setor (setor, nome, tarefas) values ('financeiro', '__teste_066_admin__', array['A']);
    reset role;
  end if;

  raise notice '066 OK';
end $$;

rollback;
