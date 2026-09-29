-- supabase/migrations/054_alinhar_rls_producao.sql
--
-- Alinha as policies de PRODUÇÃO às do dev nas tabelas onde a produção ficou
-- com policies abertas herdadas do schema antigo (auditoria de 2026-09-29,
-- comparando pg_policies dos dois ambientes). Idempotente: no dev é no-op
-- (as policies abertas nunca existiram lá, salvo se recriadas de propósito
-- pelo script de ensaio supabase/tests/054_recriar_desvio_producao_DEV_ONLY.sql).
--
-- ORDEM OBRIGATÓRIA em produção: 052 -> 053 -> 054. Esta migration derruba
-- as policies abertas de tarefas e observacoes_clientes; se a 052 ainda não
-- criou as policies setor-scoped que as substituem, ela ABORTA (asserts
-- abaixo) em vez de deixar essas tabelas sem policy de escrita/leitura.
--
-- O que remove (todas confirmadas em pg_policies de produção):
--  * tarefas: autenticados_acesso_total, allow_authenticated_all
--    (ALL, using true / with check true, roles {authenticated})
--  * clientes: autenticados_acesso_total (ALL true). Ficam "Admin gerencia
--    clientes", "Autenticados leem clientes" e "Responsavel atualiza seu
--    cliente", iguais ao dev.
--  * client_files: autenticados_acesso_total e "Autenticados gerenciam
--    arquivos". Cria "Admin gerencia client_files" (igual ao dev): sem ela
--    a tabela ficaria sem policy de escrita; as escritas da app usam service
--    role. A leitura "Autenticados leem client_files" não existe em produção
--    (só existiam as duas policies ALL abertas), então é criada aqui, como no
--    dev, para não bloquear a leitura que a app faz hoje.
--  * parcelamentos: "Operador gerencia parcelamentos" (ALL, qualquer logado)
--    é trocada por "Fiscal gerencia parcelamentos" (só membros do Fiscal).
--  * observacoes_clientes: "Autenticados leem observacoes" (nome real em
--    produção; a 052 tenta dropar "Autenticados leem observacoes_clientes",
--    que só existe no dev).

do $$
begin
  assert exists (select 1 from pg_policies where tablename = 'tarefas' and policyname = 'Setor gerencia tarefas'),
    '054 abortada: rode a migration 052 antes (falta "Setor gerencia tarefas" em tarefas)';
  assert exists (select 1 from pg_policies where tablename = 'observacoes_clientes' and policyname = 'Setores leitores leem observacoes_clientes'),
    '054 abortada: rode a migration 052 antes (falta a policy de leitura por setor em observacoes_clientes)';
  assert exists (select 1 from pg_proc where proname = 'is_admin'),
    '054 abortada: função is_admin() não existe';
end $$;

drop policy if exists "autenticados_acesso_total" on tarefas;
drop policy if exists "allow_authenticated_all" on tarefas;

drop policy if exists "autenticados_acesso_total" on clientes;

drop policy if exists "autenticados_acesso_total" on client_files;
drop policy if exists "Autenticados gerenciam arquivos" on client_files;
drop policy if exists "Admin gerencia client_files" on client_files;
create policy "Admin gerencia client_files" on client_files for all using (is_admin());
drop policy if exists "Autenticados leem client_files" on client_files;
create policy "Autenticados leem client_files" on client_files for select using (auth.uid() is not null);

-- parcelamentos: NÃO basta dropar. app/fiscal/parcelamentos/page.tsx é um
-- componente cliente que insere/edita/apaga direto do navegador (RLS vale),
-- e hoje só "Operador gerencia" (qualquer logado) permite isso a não-admins.
-- Troca por uma policy restrita ao setor Fiscal (+ admin, que já tem a sua).
drop policy if exists "Operador gerencia parcelamentos" on parcelamentos;
drop policy if exists "Fiscal gerencia parcelamentos" on parcelamentos;
create policy "Fiscal gerencia parcelamentos" on parcelamentos for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and 'fiscal'::user_setor = any(p.setores)))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and 'fiscal'::user_setor = any(p.setores)));

drop policy if exists "Autenticados leem observacoes" on observacoes_clientes;
