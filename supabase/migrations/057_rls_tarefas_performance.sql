-- 057: performance das policies de tarefas (sem mudar quem vê o quê).
--
-- Problema (produção, 2026-10-01): depois da 054 tirar as policies `true` de
-- tarefas, sobraram só "Setor gerencia tarefas" e "Setor le suas tarefas", que
-- avaliam POR LINHA is_admin() + um EXISTS em profiles (que por sua vez roda a
-- RLS de profiles, com outro is_admin() por perfil). Como `setor = 'contabil'`
-- é comparação de enum (enum_eq não é leakproof), o Postgres aplica a RLS
-- ANTES do filtro de setor: a listagem de Clientes do Contábil, que lê o ano
-- inteiro paginado de 1000 em 1000, pagava isso em todas as tarefas do ano de
-- todos os setores e estourava o statement_timeout de 8s do papel
-- authenticated para usuários não-admin (admin escapa no 1º is_admin()).
--
-- Correção: mesma regra, mas com o usuário resolvido UMA vez por consulta
-- (`(select ...)` vira InitPlan) e índice para o filtro setor/ano/mês.

begin;
set local lock_timeout = '5s';

-- Setores do usuário logado (security definer: não passa pela RLS de profiles).
create or replace function public.meus_setores()
returns user_setor[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select setores from profiles where id = auth.uid()), '{}'::user_setor[]);
$$;


drop policy if exists "Setor gerencia tarefas" on tarefas;
create policy "Setor gerencia tarefas" on tarefas for all
  using ((select is_admin()) or tarefas.setor = any ((select public.meus_setores())::user_setor[]))
  with check ((select is_admin()) or tarefas.setor = any ((select public.meus_setores())::user_setor[]));

drop policy if exists "Setor le suas tarefas" on tarefas;
create policy "Setor le suas tarefas" on tarefas for select
  using ((select is_admin()) or tarefas.setor = any ((select public.meus_setores())::user_setor[]));

create index if not exists idx_tarefas_setor_ano_mes on tarefas (setor, ano, mes);

commit;
