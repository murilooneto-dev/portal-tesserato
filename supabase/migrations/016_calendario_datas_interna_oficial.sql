-- supabase/migrations/016_calendario_datas_interna_oficial.sql

-- ============================================================
-- Calendário passa a suportar duas datas por evento: interna
-- (prazo de controle do escritório) e oficial (prazo legal),
-- podendo faltar uma das duas. Ver
-- docs/superpowers/specs/2026-07-31-calendario-datas-interna-oficial-design.md
-- ============================================================

begin;

alter table calendario_eventos
  rename column dia_mes to interna_dia_mes;
alter table calendario_eventos
  rename column data to interna_data;
alter table calendario_eventos
  add column oficial_dia_mes int check (oficial_dia_mes between 1 and 31),
  add column oficial_data date;

alter table calendario_eventos drop constraint if exists tipo_data_consistente;
alter table calendario_eventos add constraint tipo_data_consistente check (
  (tipo_data = 'recorrente' and interna_data is null and oficial_data is null
    and (interna_dia_mes is not null or oficial_dia_mes is not null)) or
  (tipo_data = 'unica' and interna_dia_mes is null and oficial_dia_mes is null
    and (interna_data is not null or oficial_data is not null))
);

create unique index idx_calendario_eventos_titulo_unico
  on calendario_eventos (setor, lower(titulo));

-- Reclassifica os 9 seeds fiscais: SIGET e SPEED GOV já eram descritos como
-- "Prazo interno do escritório" — viram data interna. Os outros 7 são prazos
-- legais — viram data oficial. (Depois da renomeação acima, o valor antigo
-- de dia_mes já está em interna_dia_mes; aqui só movemos pra oficial_dia_mes
-- quem deveria ser oficial, e limpamos interna_dia_mes desses.)
update calendario_eventos set oficial_dia_mes = interna_dia_mes, interna_dia_mes = null
  where setor = 'fiscal' and titulo not in ('SIGET', 'SPEED GOV');

commit;
