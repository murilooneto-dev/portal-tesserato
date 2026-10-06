-- Aviso de vencimento do Financeiro: um dia antes de um pagamento recorrente
-- vencer, o sistema manda um e-mail com a lista do que vence no dia seguinte.
-- Esta tabela guarda a configuração (uma linha só, id = 1):
--   email_aviso_vencimento        = destinatário(s), separados por vírgula;
--                                   vazio/nulo = aviso desligado
--   aviso_vencimento_ultimo_envio = dia (fuso de São Paulo) do último envio
--                                   automático; impede mandar duas vezes no
--                                   mesmo dia
-- Só admin lê e grava pela tela de Configurações do Financeiro; o envio
-- agendado usa a chave de serviço, que não passa por RLS.
create table if not exists public.financeiro_config (
  id integer primary key default 1 check (id = 1),
  email_aviso_vencimento text,
  aviso_vencimento_ultimo_envio date
);

insert into public.financeiro_config (id) values (1) on conflict (id) do nothing;

alter table public.financeiro_config enable row level security;

drop policy if exists "Admin gerencia financeiro_config" on public.financeiro_config;
create policy "Admin gerencia financeiro_config" on public.financeiro_config
  for all using (is_admin()) with check (is_admin());
