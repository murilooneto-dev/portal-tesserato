-- supabase/migrations/019_parcelamento_status_e_datas.sql

-- Status geral do parcelamento — usado pro aviso na ficha do cliente
-- (spec 2026-08-05). Até aqui não existia um campo único dizendo se o
-- parcelamento como um todo está ativo; só havia texto livre por mês.
alter table parcelamentos add column if not exists status text not null default 'EM ANDAMENTO';
alter table parcelamentos add constraint parcelamentos_status_check
  check (status in ('EM ANDAMENTO', 'LIQUIDADO', 'CANCELADO'));

-- Preserva o texto livre já cadastrado nos 12 meses (ex: "LIQUIDADO",
-- "COMUNICADO 15/03") antes de trocar essas colunas pra tipo `date`. Os
-- campos `*_obs` não aparecem em nenhuma tela — ficam só no banco, pra
-- consulta manual se precisar resgatar o histórico algum dia.
alter table parcelamentos rename column jan to jan_obs;
alter table parcelamentos rename column fev to fev_obs;
alter table parcelamentos rename column mar to mar_obs;
alter table parcelamentos rename column abr to abr_obs;
alter table parcelamentos rename column mai to mai_obs;
alter table parcelamentos rename column jun to jun_obs;
alter table parcelamentos rename column jul to jul_obs;
alter table parcelamentos rename column ago to ago_obs;
alter table parcelamentos rename column set to set_obs;
alter table parcelamentos rename column out to out_obs;
alter table parcelamentos rename column nov to nov_obs;
alter table parcelamentos rename column dez to dez_obs;

alter table parcelamentos add column if not exists jan date;
alter table parcelamentos add column if not exists fev date;
alter table parcelamentos add column if not exists mar date;
alter table parcelamentos add column if not exists abr date;
alter table parcelamentos add column if not exists mai date;
alter table parcelamentos add column if not exists jun date;
alter table parcelamentos add column if not exists jul date;
alter table parcelamentos add column if not exists ago date;
alter table parcelamentos add column if not exists set date;
alter table parcelamentos add column if not exists out date;
alter table parcelamentos add column if not exists nov date;
alter table parcelamentos add column if not exists dez date;

-- Usado por buscarLabelsParcelamentoAtivo (lib/parcelamentos-aviso.ts) pra
-- casar parcelamento ↔ cliente por CNPJ e filtrar só os em andamento.
create index if not exists idx_parcelamentos_cnpj_status on parcelamentos (cnpj, status);
