-- supabase/migrations/019_parcelamento_status_e_datas.sql

begin;

-- Status geral do parcelamento — usado pro aviso na ficha do cliente
-- (spec 2026-08-05). Até aqui não existia um campo único dizendo se o
-- parcelamento como um todo está ativo; só havia texto livre por mês.
alter table parcelamentos add column if not exists status text not null default 'EM ANDAMENTO';
alter table parcelamentos add constraint parcelamentos_status_check
  check (status in ('EM ANDAMENTO', 'LIQUIDADO', 'CANCELADO'));

-- Preserva o texto livre já cadastrado nos 12 meses (ex: "LIQUIDADO",
-- "COMUNICADO 15/03") antes de reduzir essas colunas a "dd/mm" (sem ano —
-- decisão do usuário 2026-08-05, o cadastro nunca teve ano associado ao
-- mês). Os campos `*_obs` não aparecem em nenhuma tela — ficam só no
-- banco, pra consulta manual se precisar resgatar o histórico algum dia.
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

-- Texto livre no formato "dd/mm" (sem ano) — não é um `date` de verdade
-- porque o cadastro nunca associou ano ao mês; ver comentário acima.
alter table parcelamentos add column if not exists jan text;
alter table parcelamentos add column if not exists fev text;
alter table parcelamentos add column if not exists mar text;
alter table parcelamentos add column if not exists abr text;
alter table parcelamentos add column if not exists mai text;
alter table parcelamentos add column if not exists jun text;
alter table parcelamentos add column if not exists jul text;
alter table parcelamentos add column if not exists ago text;
alter table parcelamentos add column if not exists set text;
alter table parcelamentos add column if not exists out text;
alter table parcelamentos add column if not exists nov text;
alter table parcelamentos add column if not exists dez text;

-- Usado por buscarLabelsParcelamentoAtivo (lib/parcelamentos-aviso.ts) pra
-- casar parcelamento ↔ cliente por CNPJ e filtrar só os em andamento.
create index if not exists idx_parcelamentos_cnpj_status on parcelamentos (cnpj, status);

commit;
