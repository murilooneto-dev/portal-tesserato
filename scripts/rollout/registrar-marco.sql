-- Tabela de controle do protocolo de rollout/rollback — usada para travar
-- fases que dependem de uma confirmação manual (ex: "deploy novo já está
-- estável em produção") em vez de depender só de disciplina/checklist.
create table if not exists _rollout_controle (
  etapa text primary key,
  concluido_em timestamptz not null default now()
);

create or replace function registrar_marco(p_etapa text)
returns void
language sql
as $$
  insert into _rollout_controle (etapa) values (p_etapa)
  on conflict (etapa) do nothing;
$$;

-- Uso em uma migration de fase que deve abortar sem o marco:
--
--   do $$ begin
--     if not exists (
--       select 1 from _rollout_controle where etapa = 'deploy_novo_validado'
--     ) then
--       raise exception 'Marco "deploy_novo_validado" não encontrado — rode '
--         'select registrar_marco(''deploy_novo_validado''); manualmente após '
--         'confirmar o deploy novo estável em produção, antes desta fase.';
--     end if;
--   end $$;
