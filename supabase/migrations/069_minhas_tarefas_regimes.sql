-- supabase/migrations/069_minhas_tarefas_regimes.sql

-- Regimes que o dono de tipos de tarefa atende (Minhas Tarefas do Fiscal).
-- Uma linha por usuário e setor. Sem linha, ou com a lista vazia, o dono
-- atende todos os clientes, como sempre foi: a migration é aditiva.
-- Com regimes marcados, nos clientes de outros regimes o tipo se comporta como
-- tipo sem dono (ver lib/tarefa-tipo-visibilidade.ts:donoAtendeRegime).
-- Regime é guardado pelo nome, igual a clientes_fiscal.regime (sem FK).
begin;
set local lock_timeout = '5s';

create table if not exists public.minhas_tarefas_regimes (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  setor      text not null,
  regimes    text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, setor)
);

alter table public.minhas_tarefas_regimes enable row level security;

-- Leitura por qualquer autenticado: toda tela do Fiscal precisa saber os
-- regimes do dono de cada tipo para decidir o que mostrar a cada usuário.
drop policy if exists "Autenticados leem minhas_tarefas_regimes" on public.minhas_tarefas_regimes;
create policy "Autenticados leem minhas_tarefas_regimes" on public.minhas_tarefas_regimes
  for select using (auth.uid() is not null);

drop policy if exists "Usuario grava os proprios regimes" on public.minhas_tarefas_regimes;
create policy "Usuario grava os proprios regimes" on public.minhas_tarefas_regimes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Admin gerencia minhas_tarefas_regimes" on public.minhas_tarefas_regimes;
create policy "Admin gerencia minhas_tarefas_regimes" on public.minhas_tarefas_regimes
  for all using (is_admin()) with check (is_admin());

commit;
