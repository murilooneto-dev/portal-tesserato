-- supabase/rollback/053_054_rollback.sql
--
-- Desfaz as migrations 054 e 053 (SEÇÕES INDEPENDENTES: rode só a que precisar),
-- recriando as policies como estavam em produção em 2026-09-29 (copiadas do
-- pg_policies). Use só se a migration quebrar um fluxo real em produção.
-- Restaura o estado INSEGURO conhecido; depois entenda o que quebrou e
-- corrija a policy em vez de deixar aberto.
--
-- FIDELIDADE: as policies "true" são recriadas TO authenticated (confirmado).
-- As de auth.uid() is not null ficam sem TO (roles public): a coluna roles
-- delas não foi conferida em produção; funcionalmente é equivalente.
-- RECOMENDADO: antes de aplicar em produção, rode
-- supabase/rollback/snapshot_pg_policies.sql e guarde o resultado; se houver
-- divergência com este arquivo, o snapshot manda.
-- O rollback da 052 é separado (ver protocolo de rollout).

-- ===================== desfaz a 054 =====================
begin;
set local lock_timeout = '5s';

drop policy if exists "Admin gerencia client_files" on client_files;
drop policy if exists "Autenticados leem client_files" on client_files;
drop policy if exists "Fiscal gerencia parcelamentos" on parcelamentos;

drop policy if exists "autenticados_acesso_total" on tarefas;
create policy "autenticados_acesso_total" on tarefas for all to authenticated using (true) with check (true);
drop policy if exists "allow_authenticated_all" on tarefas;
create policy "allow_authenticated_all" on tarefas for all to authenticated using (true) with check (true);

drop policy if exists "autenticados_acesso_total" on clientes;
create policy "autenticados_acesso_total" on clientes for all to authenticated using (true) with check (true);

drop policy if exists "autenticados_acesso_total" on client_files;
create policy "autenticados_acesso_total" on client_files for all to authenticated using (true) with check (true);
drop policy if exists "Autenticados gerenciam arquivos" on client_files;
create policy "Autenticados gerenciam arquivos" on client_files for all using (auth.uid() is not null);

drop policy if exists "Operador gerencia parcelamentos" on parcelamentos;
create policy "Operador gerencia parcelamentos" on parcelamentos for all using (auth.uid() is not null);

drop policy if exists "Autenticados leem observacoes" on observacoes_clientes;
create policy "Autenticados leem observacoes" on observacoes_clientes for select using (auth.uid() is not null);

commit;

-- ===================== desfaz a 053 =====================
begin;
set local lock_timeout = '5s';

drop policy if exists "Fiscal cria parcelamento_secoes" on parcelamento_secoes;
drop policy if exists "Config fiscal altera parcelamento_secoes" on parcelamento_secoes;
drop policy if exists "Config fiscal apaga parcelamento_secoes" on parcelamento_secoes;
drop policy if exists "Autenticados gerenciam parcelamento_secoes" on parcelamento_secoes;
create policy "Autenticados gerenciam parcelamento_secoes" on parcelamento_secoes for all using (auth.uid() is not null);

commit;
