-- supabase/tests/054_alinhar_rls_producao_smoke.sql
--
-- Teste de fumaça da migration 054 (rodar no dev e, depois, em produção,
-- no SQL Editor; não altera nada, termina em rollback).
-- Confere que nenhuma policy aberta sobrou nas tabelas alvo e que as
-- substitutas existem. Sucesso = "054 OK" e nenhum erro.
begin;

do $$
declare
  r record;
begin
  -- 1) nenhuma policy de ESCRITA com using/with check "true" ou só auth.uid() is not null
  --    nas tabelas sensíveis (SELECT aberto para autenticados é intencional em algumas).
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('tarefas','clientes','client_files','parcelamentos','parcelamento_secoes',
                        'procedimentos_societario','procedimento_arquivos','observacoes_clientes')
      and cmd in ('ALL','INSERT','UPDATE','DELETE')
      and (coalesce(qual,'') in ('true','(auth.uid() IS NOT NULL)')
        or coalesce(with_check,'') in ('true','(auth.uid() IS NOT NULL)'))
  loop
    raise exception 'policy de escrita aberta ainda existe: %.% (%)', r.tablename, r.policyname, 'escrita aberta';
  end loop;

  -- 2) nomes específicos que precisam ter sumido
  perform 1 from pg_policies where tablename = 'tarefas' and policyname in ('autenticados_acesso_total','allow_authenticated_all','Usuário gerencia próprias tarefas');
  assert not found, 'sobrou policy aberta/antiga em tarefas';
  perform 1 from pg_policies where tablename = 'clientes' and policyname = 'autenticados_acesso_total';
  assert not found, 'sobrou autenticados_acesso_total em clientes';
  perform 1 from pg_policies where tablename = 'client_files' and policyname in ('autenticados_acesso_total','Autenticados gerenciam arquivos');
  assert not found, 'sobrou policy aberta em client_files';
  perform 1 from pg_policies where tablename = 'parcelamentos' and policyname = 'Operador gerencia parcelamentos';
  assert not found, 'sobrou Operador gerencia parcelamentos';
  perform 1 from pg_policies where tablename = 'observacoes_clientes' and policyname in ('Autenticados leem observacoes','Autenticados leem observacoes_clientes');
  assert not found, 'sobrou leitura aberta em observacoes_clientes';

  perform 1 from pg_policies where tablename = 'parcelamentos' and policyname = 'Fiscal gerencia parcelamentos' and qual like '%fiscal%';
  assert found, 'falta "Fiscal gerencia parcelamentos" restrita ao setor fiscal';

  -- 3) substitutas presentes
  perform 1 from pg_policies where tablename = 'tarefas' and policyname = 'Setor gerencia tarefas';
  assert found, 'falta "Setor gerencia tarefas"';
  perform 1 from pg_policies where tablename = 'client_files' and policyname = 'Admin gerencia client_files';
  assert found, 'falta "Admin gerencia client_files"';
  perform 1 from pg_policies where tablename = 'client_files' and policyname = 'Autenticados leem client_files' and cmd = 'SELECT';
  assert found, 'falta leitura de client_files';
  perform 1 from pg_policies where tablename = 'clientes' and policyname = 'Admin gerencia clientes';
  assert found, 'falta "Admin gerencia clientes"';
  perform 1 from pg_policies where tablename = 'clientes' and policyname = 'Autenticados leem clientes';
  assert found, 'falta leitura de clientes';
  perform 1 from pg_policies where tablename = 'observacoes_clientes' and policyname = 'Setores leitores leem observacoes_clientes';
  assert found, 'falta leitura por setor em observacoes_clientes';

  -- 3b) RLS ligada nas tabelas alvo (senão todas as policies são inúteis)
  for r in
    select t.n from unnest(array['tarefas','clientes','client_files','parcelamentos','parcelamento_secoes',
                                 'observacoes_clientes','procedimentos_societario','procedimento_arquivos','profiles']) as t(n)
    where not exists (select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
                      where ns.nspname = 'public' and c.relname = t.n and c.relrowsecurity)
  loop
    raise exception 'RLS desligada em %', r.n;
  end loop;

  -- 3c) policies que precisam CONTINUAR (a app depende delas)
  for r in
    select x.t, x.p from (values
      ('tarefas','Setor le suas tarefas'),
      ('clientes','Admin gerencia clientes'),
      ('clientes','Autenticados leem clientes'),
      ('parcelamentos','Admin gerencia parcelamentos'),
      ('parcelamentos','Autenticados leem parcelamentos'),
      ('parcelamento_secoes','Autenticados leem parcelamento_secoes'),
      ('profiles','Usuário lê próprio perfil')
    ) as x(t, p)
    where not exists (select 1 from pg_policies where tablename = x.t and policyname = x.p)
  loop
    raise exception 'policy que deveria continuar sumiu: %.%', r.t, r.p;
  end loop;

  -- 4) tarefas: só UMA policy de escrita (ALL), a por setor
  assert (select count(*) from pg_policies where tablename = 'tarefas' and cmd = 'ALL') = 1,
    'tarefas deve ter exatamente 1 policy ALL';

  raise notice '054 OK';
end $$;

rollback;
