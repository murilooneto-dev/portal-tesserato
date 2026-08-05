-- supabase/migrations/020_clientes_ativo.sql

-- Estado "desabilitado" por cliente, por setor: cada setor tem sua própria
-- tabela filha 1:1 com `clientes` (clientes_fiscal/clientes_contabil/
-- clientes_pessoal), então o campo fica em cada uma — desabilitar no Fiscal
-- não afeta o mesmo cliente no Contábil/Pessoal. Nenhum dado é apagado;
-- `ativo` só controla se o cliente aparece nas listas/contagens ativas
-- dali pra frente.
alter table clientes_fiscal   add column if not exists ativo boolean not null default true;
alter table clientes_contabil add column if not exists ativo boolean not null default true;
alter table clientes_pessoal  add column if not exists ativo boolean not null default true;
