-- supabase/migrations/067_relatorios_fiscal_agendados.sql

-- Relatórios automáticos do Fiscal por e-mail (Parâmetros > Comunicado e
-- e-mails): o dia e o horário das duas rotinas já eram gravados em
-- app_settings, mas nada os lia. O envio agendado
-- (app/api/cron/fiscal-relatorios) passa a ler e precisa lembrar o que já
-- mandou, para não repetir:
--   rotinaN_ultimo_envio = chave AAAAMMDDHHMM (fuso de São Paulo) do dia e
--                          horário marcados do último envio daquela rotina
--
-- "Gmail remetente" e "Senha de app do Gmail" nunca foram usados (o envio sai
-- pela conta das variáveis EMAIL_* da Vercel) e saíram da tela. A senha ficava
-- guardada em texto puro: os dois valores são apagados. As colunas ficam, para
-- o código antigo continuar salvando sem erro até o deploy.
begin;
set local lock_timeout = '5s';

alter table public.app_settings
  add column if not exists rotina1_ultimo_envio text,
  add column if not exists rotina2_ultimo_envio text;

update public.app_settings set gmail_remetente = '', gmail_senha = '' where id = 1;

commit;
