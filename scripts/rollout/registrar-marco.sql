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

-- Trava real (não só um exemplo comentado): aborta a transação se o marco
-- não existir. Usar como primeiro statement de qualquer migration de fase
-- que dependa de uma confirmação manual prévia.
create or replace function exigir_marco(p_etapa text)
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from public._rollout_controle where etapa = p_etapa) then
    raise exception 'Marco "%" não encontrado — rode select registrar_marco(''%''); manualmente antes desta fase.', p_etapa, p_etapa;
  end if;
end;
$$;

-- Uso em uma migration de fase que deve abortar sem o marco:
--
--   select exigir_marco('deploy_novo_validado');

-- Este mecanismo só deve ser acionável por conexão direta (service_role ou
-- postgres), nunca pela API pública do PostgREST — senão qualquer requisição
-- com a chave anon (que roda no bundle do cliente) poderia registrar o
-- marco remotamente e destravar a fase de limpeza sem confirmação real.
alter table _rollout_controle enable row level security;
revoke execute on function registrar_marco(text) from public, anon, authenticated;
revoke execute on function exigir_marco(text) from public, anon, authenticated;
-- Nenhuma policy de RLS é criada de propósito: sem policy, RLS habilitada
-- bloqueia todo acesso via PostgREST (roles anon/authenticated), enquanto
-- service_role e conexões diretas via postgres continuam bypassando RLS
-- normalmente — que é o único caminho de acesso que este mecanismo deve ter.
