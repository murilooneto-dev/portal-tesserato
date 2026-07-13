-- supabase/migrations/005_clientes_setores.sql

alter table clientes add column if not exists setores user_setor[] not null default '{fiscal}';
