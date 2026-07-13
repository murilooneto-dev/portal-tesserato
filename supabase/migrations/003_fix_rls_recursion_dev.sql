-- ============================================================
-- Corrige recursão infinita nas políticas de RLS que consultam
-- `profiles` de dentro de uma policy da própria `profiles` (e de
-- `clientes`/`tarefas`, que fazem o mesmo padrão pra checar admin).
-- Isso é uma falha estrutural pré-existente em 001_initial.sql —
-- aplicada aqui só no banco de DEV, não em produção.
--
-- Padrão de correção recomendado pelo próprio Supabase: função
-- security definer que lê profiles ignorando RLS, quebrando o ciclo.
-- ============================================================

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- profiles
drop policy if exists "Admin lê todos os perfis" on profiles;
create policy "Admin lê todos os perfis" on profiles for select using (is_admin());

drop policy if exists "Admin atualiza perfis" on profiles;
create policy "Admin atualiza perfis" on profiles for update using (is_admin());

-- clientes
drop policy if exists "Admin gerencia clientes" on clientes;
create policy "Admin gerencia clientes" on clientes for all using (is_admin());

-- tarefas
drop policy if exists "Usuário gerencia próprias tarefas" on tarefas;
create policy "Usuário gerencia próprias tarefas" on tarefas for all using (
  usuario_id = auth.uid() or is_admin()
);

-- links_rapidos
drop policy if exists "Admin gerencia links" on links_rapidos;
create policy "Admin gerencia links" on links_rapidos for all using (is_admin());

-- bots_config
drop policy if exists "Usuário gerencia própria config de bot" on bots_config;
create policy "Usuário gerencia própria config de bot" on bots_config for all using (
  usuario_id = auth.uid() or is_admin()
);

-- tabelas novas criadas em 002 (mesmo padrão recursivo)
drop policy if exists "Usuario gerencia propria agenda" on agenda;
create policy "Usuario gerencia propria agenda" on agenda for all using (
  usuario_id = auth.uid() or is_admin()
);

drop policy if exists "Admin gerencia client_files" on client_files;
create policy "Admin gerencia client_files" on client_files for all using (is_admin());

drop policy if exists "Admin gerencia deletion_log" on deletion_log;
create policy "Admin gerencia deletion_log" on deletion_log for all using (is_admin());

drop policy if exists "Admin gerencia task_unlock_log" on task_unlock_log;
create policy "Admin gerencia task_unlock_log" on task_unlock_log for all using (is_admin());

drop policy if exists "Admin gerencia atividade_templates" on atividade_templates;
create policy "Admin gerencia atividade_templates" on atividade_templates for all using (is_admin());

drop policy if exists "Admin gerencia grupo_templates" on grupo_templates;
create policy "Admin gerencia grupo_templates" on grupo_templates for all using (is_admin());

drop policy if exists "Admin gerencia parcelamentos" on parcelamentos;
create policy "Admin gerencia parcelamentos" on parcelamentos for all using (is_admin());

drop policy if exists "Admin gerencia app_settings" on app_settings;
create policy "Admin gerencia app_settings" on app_settings for all using (is_admin());
