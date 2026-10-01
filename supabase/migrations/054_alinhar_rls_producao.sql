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
-- criou as policies setor-scoped que as substituem, ela ABORTA (checagens
-- abaixo, antes de qualquer drop) em vez de deixar essas tabelas sem policy.
--
-- PRÉ-REQUISITOS FORA DO BANCO (ver docs da auditoria):
--  * SUPABASE_SERVICE_ROLE_KEY definida no ambiente Production da Vercel:
--    sem ela getAuthenticatedAdmin() cai para o JWT do usuário e as Server
--    Actions que escrevem em clientes/client_files/tarefas passam a falhar.
--  * Correção dos selos de vínculo entre setores (lib/vinculos.ts) publicada:
--    eles leem tarefas do setor de origem com o client de sessão e, com as
--    policies abertas removidas, passariam a mostrar "Aguardando" sempre.
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
--    é trocada por "Fiscal gerencia parcelamentos" (admin ou membro do
--    Fiscal). NÃO basta dropar: app/fiscal/parcelamentos/page.tsx é um
--    componente cliente que insere/edita/apaga direto do navegador (RLS vale).
--  * observacoes_clientes: "Autenticados leem observacoes" (nome real em
--    produção; a 052 tenta dropar "Autenticados leem observacoes_clientes",
--    que só existe no dev).
--
-- Transacional (tudo ou nada) e com lock_timeout: se uma consulta longa
-- segurar uma tabela, a migration falha limpa e pode ser repetida.

begin;
set local lock_timeout = '5s';

do $$
declare
  t text;
begin
  -- RLS precisa estar ligada nas tabelas alvo (senão policies são inúteis)
  foreach t in array array['tarefas','clientes','client_files','parcelamentos','parcelamento_secoes','observacoes_clientes','profiles'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname = t and c.relrowsecurity) then
      raise exception '054 abortada: RLS desligada em %', t;
    end if;
  end loop;

  if not exists (select 1 from pg_proc where proname = 'is_admin') then
    raise exception '054 abortada: função is_admin() não existe';
  end if;

  -- substitutas criadas pela 052
  if not exists (select 1 from pg_policies where tablename = 'tarefas' and policyname = 'Setor gerencia tarefas') then
    raise exception '054 abortada: rode a 052 antes (falta "Setor gerencia tarefas")';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'observacoes_clientes' and policyname = 'Setores leitores leem observacoes_clientes') then
    raise exception '054 abortada: rode a 052 antes (falta a leitura por setor em observacoes_clientes)';
  end if;

  -- policies que precisam CONTINUAR existindo (a app depende delas)
  if not exists (select 1 from pg_policies where tablename = 'tarefas' and policyname = 'Setor le suas tarefas') then
    raise exception '054 abortada: falta "Setor le suas tarefas"';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'clientes' and policyname = 'Admin gerencia clientes') then
    raise exception '054 abortada: falta "Admin gerencia clientes"';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'clientes' and policyname = 'Autenticados leem clientes') then
    raise exception '054 abortada: falta "Autenticados leem clientes"';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'parcelamentos' and policyname = 'Admin gerencia parcelamentos') then
    raise exception '054 abortada: falta "Admin gerencia parcelamentos"';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'parcelamentos' and policyname = 'Autenticados leem parcelamentos') then
    raise exception '054 abortada: falta "Autenticados leem parcelamentos" (Pessoal/Contábil leem parcelamentos)';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'parcelamento_secoes' and policyname = 'Autenticados leem parcelamento_secoes') then
    raise exception '054 abortada: falta "Autenticados leem parcelamento_secoes"';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'Usuário lê próprio perfil') then
    raise exception '054 abortada: falta a leitura do próprio perfil em profiles (todas as policies por setor dependem dela)';
  end if;
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

drop policy if exists "Operador gerencia parcelamentos" on parcelamentos;
drop policy if exists "Fiscal gerencia parcelamentos" on parcelamentos;
create policy "Fiscal gerencia parcelamentos" on parcelamentos for all
  using (is_admin() or exists (select 1 from profiles p where p.id = auth.uid() and 'fiscal'::user_setor = any(p.setores)))
  with check (is_admin() or exists (select 1 from profiles p where p.id = auth.uid() and 'fiscal'::user_setor = any(p.setores)));

drop policy if exists "Autenticados leem observacoes" on observacoes_clientes;

commit;
