-- supabase/migrations/021_parcelamento_secoes_catalogo.sql

-- Cria o catálogo de seções de parcelamento, que até aqui era uma lista
-- fixa hard-coded (SECOES) em app/fiscal/parcelamentos/page.tsx. Semeia as
-- 5 seções que já existiam, na mesma ordem, pra não mudar nada pra quem
-- já usa o sistema — daí em diante o usuário pode criar, renomear e
-- remover seções pelo próprio formulário de parcelamento (spec
-- 2026-08-07).
create table if not exists parcelamento_secoes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  created_at timestamptz not null default now()
);

insert into parcelamento_secoes (nome) values
  ('RECEITA FEDERAL - ECAC'),
  ('PGFN - ECAC'),
  ('SEFAZ - PARCELAMENTO MULTA AUTONOMA'),
  ('SEFAZ - PARCELAMENTOS'),
  ('FGTS DIGITAL')
on conflict (nome) do nothing;

alter table parcelamento_secoes enable row level security;

create policy "Autenticados leem parcelamento_secoes" on parcelamento_secoes
  for select using (auth.uid() is not null);

create policy "Autenticados gerenciam parcelamento_secoes" on parcelamento_secoes
  for all using (auth.uid() is not null);
