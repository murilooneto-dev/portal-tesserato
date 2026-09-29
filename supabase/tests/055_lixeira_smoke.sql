-- supabase/tests/055_lixeira_smoke.sql
-- Smoke estrutural da 055 (dev e, no futuro, producao). Nao altera nada.
begin;

do $$
declare
  t text;
  v_faltando text := '';
begin
  assert to_regclass('public.lixeira') is not null, 'tabela lixeira nao existe';
  assert (select relrowsecurity from pg_class where oid = 'public.lixeira'::regclass), 'RLS desligada em lixeira';
  assert (select count(*) from pg_policies where tablename = 'lixeira') = 1, 'lixeira deve ter exatamente 1 policy';
  assert (select qual from pg_policies where tablename = 'lixeira') like '%is_admin%', 'a policy da lixeira nao e de admin';
  assert (select cmd from pg_policies where tablename = 'lixeira') = 'SELECT', 'a policy da lixeira deve ser so de leitura';
  assert not has_table_privilege('authenticated', 'public.lixeira', 'insert'), 'authenticated insere na lixeira';
  assert not has_table_privilege('authenticated', 'public.lixeira', 'update'), 'authenticated altera a lixeira';
  assert not has_table_privilege('authenticated', 'public.lixeira', 'delete'), 'authenticated apaga da lixeira';
  assert not has_table_privilege('anon', 'public.lixeira', 'insert'), 'anon insere na lixeira';
  assert not has_table_privilege('anon', 'public.lixeira', 'update'), 'anon altera a lixeira';
  assert not has_table_privilege('anon', 'public.lixeira', 'delete'), 'anon apaga da lixeira';
  assert (select column_default from information_schema.columns
           where table_schema = 'public' and table_name = 'lixeira' and column_name = 'expira_em') like '%60 days%',
         'retencao padrao nao e 60 dias';

  foreach t in array array[
    'clientes', 'clientes_fiscal', 'clientes_contabil', 'clientes_pessoal',
    'cliente_responsavel_historico', 'tarefas', 'tarefa_etapas', 'tarefa_arquivos',
    'tarefas_avulsas', 'evento_arquivos', 'client_files', 'cliente_notas',
    'observacoes_clientes', 'tarefa_grupos', 'parcelamentos', 'financeiro_movimentos',
    'procedimentos_societario', 'procedimento_arquivos'
  ] loop
    if not exists (select 1 from pg_trigger tg
                    where tg.tgrelid = ('public.' || t)::regclass and tg.tgname = 'lixeira_capturar' and not tg.tgisinternal) then
      v_faltando := v_faltando || ' ' || t;
    end if;
  end loop;
  assert v_faltando = '', 'sem trigger de captura em:' || v_faltando;

  assert (select bool_and(p.prosecdef) from pg_proc p
           where p.proname in ('lixeira_capturar', 'lixeira_restaurar', 'lixeira_listar', 'lixeira_limpar')
             and p.pronamespace = 'public'::regnamespace) , 'funcao da lixeira nao e SECURITY DEFINER';
  assert (select count(*) from pg_proc p
           where p.proname in ('lixeira_capturar', 'lixeira_restaurar', 'lixeira_listar', 'lixeira_limpar')
             and p.pronamespace = 'public'::regnamespace
             and p.proconfig::text like '%search_path=public, pg_temp%') = 4, 'search_path nao fixado em todas as funcoes';

  assert not has_function_privilege('anon', 'public.lixeira_restaurar(bigint,uuid)', 'execute'), 'anon executa restaurar';
  assert not has_function_privilege('authenticated', 'public.lixeira_restaurar(bigint,uuid)', 'execute'), 'authenticated executa restaurar';
  assert has_function_privilege('service_role', 'public.lixeira_restaurar(bigint,uuid)', 'execute'), 'service_role nao executa restaurar';

  raise notice '055 OK';
end $$;

rollback;
select '055 OK' as resultado;
