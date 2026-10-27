-- supabase/migrations/073_clientes_tipo_pessoa.sql

-- Cliente pode ser Pessoa Jurídica (padrão, todos os existentes) ou Pessoa Física.
-- Na PF o CPF fica na mesma coluna clientes.cnpj (documento do cliente), para
-- que buscas e vínculos por documento (parcelamento etc.) sigam funcionando
-- sem mudança. E-mail é novo, usado no cadastro de PF (aceito também em PJ).
-- Aditiva: default 'PJ' e e-mail nulo, nada muda para quem já existe.
begin;
set local lock_timeout = '5s';

alter table public.clientes
  add column if not exists tipo_pessoa text not null default 'PJ',
  add column if not exists email text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_tipo_pessoa_check') then
    alter table public.clientes
      add constraint clientes_tipo_pessoa_check check (tipo_pessoa in ('PJ', 'PF'));
  end if;
end $$;

commit;
