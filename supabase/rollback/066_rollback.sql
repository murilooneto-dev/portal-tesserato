-- supabase/rollback/066_rollback.sql
-- Desfaz a migration 066: apaga a tabela de grupos de tarefas por setor
-- (os grupos criados em Configurações > Financeiro se perdem).
begin;
set local lock_timeout = '5s';

drop table if exists tarefa_grupos_setor;

commit;
