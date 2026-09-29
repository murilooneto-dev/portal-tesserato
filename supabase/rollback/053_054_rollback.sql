-- supabase/rollback/053_054_rollback.sql
--
-- Desfaz as migrations 053 e 054, recriando as policies EXATAMENTE como
-- estavam em produção em 2026-09-29 (copiadas do pg_policies). Use só se a
-- 053/054 quebrar um fluxo real em produção. Restaura o estado INSEGURO
-- conhecido; o correto depois é entender o que quebrou e corrigir a policy.
-- O rollback da 052 é separado (ver protocolo de rollout).

-- ---- desfaz 054 ----
drop policy if exists "Admin gerencia client_files" on client_files;
drop policy if exists "Autenticados leem client_files" on client_files;
drop policy if exists "Fiscal gerencia parcelamentos" on parcelamentos;

create policy "autenticados_acesso_total" on tarefas for all to authenticated using (true) with check (true);
create policy "allow_authenticated_all" on tarefas for all to authenticated using (true) with check (true);
create policy "autenticados_acesso_total" on clientes for all to authenticated using (true) with check (true);
create policy "autenticados_acesso_total" on client_files for all to authenticated using (true) with check (true);
create policy "Autenticados gerenciam arquivos" on client_files for all using (auth.uid() is not null);
create policy "Operador gerencia parcelamentos" on parcelamentos for all using (auth.uid() is not null);
create policy "Autenticados leem observacoes" on observacoes_clientes for select using (auth.uid() is not null);

-- ---- desfaz 053 ----
drop policy if exists "Fiscal cria parcelamento_secoes" on parcelamento_secoes;
drop policy if exists "Config fiscal altera parcelamento_secoes" on parcelamento_secoes;
drop policy if exists "Config fiscal apaga parcelamento_secoes" on parcelamento_secoes;
create policy "Autenticados gerenciam parcelamento_secoes" on parcelamento_secoes for all using (auth.uid() is not null);
