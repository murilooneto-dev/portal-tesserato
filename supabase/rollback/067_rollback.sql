-- supabase/rollback/067_rollback.sql
-- Desfaz a migration 067: tira o controle do envio agendado dos relatórios do
-- Fiscal. O Gmail remetente e a senha de app apagados pela 067 NÃO voltam
-- (não eram usados); se forem necessários, vêm do backup.
begin;
set local lock_timeout = '5s';

alter table public.app_settings
  drop column if exists rotina1_ultimo_envio,
  drop column if exists rotina2_ultimo_envio;

commit;
