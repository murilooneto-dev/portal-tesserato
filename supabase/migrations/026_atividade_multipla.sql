-- Cliente pode exercer mais de uma atividade (ex.: serviço e comércio) — o
-- <select> de valor único virava workaround de texto livre combinando
-- opções (ver scripts/normalizar-atividades.ts, histórico, fora de escopo
-- aqui). atividade vira array de nomes, comparado por nome contra o
-- catálogo `atividades` (por setor) — mesmo padrão sem FK já usado pra
-- grupo/regime. Ver docs/superpowers/specs/2026-08-27-multiplas-atividades-
-- cliente-design.md.
--
-- Escrita como DO block idempotente: detecta se a coluna ainda é `text`
-- (primeira aplicação, precisa converter) ou já é `text[]` (reaplicação
-- após uma versão anterior desta migration já ter rodado — nesse caso só
-- limpa strings vazias/espaço que possam ter sobrado dentro do array,
-- sem tentar re-converter o tipo).
do $$
declare
  tipo_atual text;
begin
  select data_type into tipo_atual
    from information_schema.columns
    where table_name = 'clientes_fiscal' and column_name = 'atividade';

  if tipo_atual = 'text' then
    alter table clientes_fiscal
      alter column atividade type text[]
      using case when atividade is null or btrim(atividade) = '' then '{}'::text[] else array[btrim(atividade)] end;
  else
    update clientes_fiscal
      set atividade = array(select btrim(a) from unnest(atividade) as a where btrim(a) <> '')
      where atividade is not null;
  end if;
end $$;
alter table clientes_fiscal alter column atividade set default '{}'::text[];
update clientes_fiscal set atividade = '{}'::text[] where atividade is null;
alter table clientes_fiscal alter column atividade set not null;

do $$
declare
  tipo_atual text;
begin
  select data_type into tipo_atual
    from information_schema.columns
    where table_name = 'clientes_contabil' and column_name = 'atividade';

  if tipo_atual = 'text' then
    alter table clientes_contabil
      alter column atividade type text[]
      using case when atividade is null or btrim(atividade) = '' then '{}'::text[] else array[btrim(atividade)] end;
  else
    update clientes_contabil
      set atividade = array(select btrim(a) from unnest(atividade) as a where btrim(a) <> '')
      where atividade is not null;
  end if;
end $$;
alter table clientes_contabil alter column atividade set default '{}'::text[];
update clientes_contabil set atividade = '{}'::text[] where atividade is null;
alter table clientes_contabil alter column atividade set not null;

do $$
declare
  tipo_atual text;
begin
  select data_type into tipo_atual
    from information_schema.columns
    where table_name = 'clientes_pessoal' and column_name = 'atividade';

  if tipo_atual = 'text' then
    alter table clientes_pessoal
      alter column atividade type text[]
      using case when atividade is null or btrim(atividade) = '' then '{}'::text[] else array[btrim(atividade)] end;
  else
    update clientes_pessoal
      set atividade = array(select btrim(a) from unnest(atividade) as a where btrim(a) <> '')
      where atividade is not null;
  end if;
end $$;
alter table clientes_pessoal alter column atividade set default '{}'::text[];
update clientes_pessoal set atividade = '{}'::text[] where atividade is null;
alter table clientes_pessoal alter column atividade set not null;
