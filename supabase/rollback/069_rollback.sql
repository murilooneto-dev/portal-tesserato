-- supabase/rollback/069_rollback.sql
-- Desfaz a migration 069: apaga a tabela dos regimes atendidos em Minhas
-- Tarefas. As marcações feitas pelos usuários são PERDIDAS (só voltam do
-- backup). Sem a tabela o portal se comporta como antes da 069: o dono do tipo
-- atende todos os clientes; só o salvar do campo "Regimes que atendo" dá erro.
begin;
set local lock_timeout = '5s';

drop table if exists public.minhas_tarefas_regimes;

commit;
