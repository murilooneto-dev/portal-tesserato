-- supabase/migrations/074_clientes_pessoal_codigo.sql

-- Código do cliente em outro sistema, só no setor Pessoal (texto livre, opcional).
-- Aditiva: coluna nula, nada muda para quem já existe.
begin;
set local lock_timeout = '5s';

alter table public.clientes_pessoal
  add column if not exists codigo text;

commit;
