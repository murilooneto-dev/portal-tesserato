-- supabase/tests/057_rls_tarefas_performance_smoke.sql
--
-- Teste de fumaça da migration 057 (rodar no dev e, depois, em produção;
-- não altera nada, termina em rollback). Para CADA perfil, compara o que ele
-- enxerga em tarefas sob RLS com a regra esperada (admin = tudo; demais = só
-- os setores dele) e confere que anon não vê nada. Sucesso = "057 OK".
begin;

create temp table _esperado on commit drop as
select p.id,
       case when p.role = 'admin' then (select count(*) from tarefas)
            else (select count(*) from tarefas t where t.setor = any (p.setores)) end as qtd
from profiles p;
grant select on _esperado to authenticated, anon;

create temp table _visto (id uuid, qtd bigint) on commit drop;
grant insert, select on _visto to authenticated;

do $$
declare
  r record;
begin
  perform 1 from pg_proc where proname = 'meus_setores';
  assert found, 'falta a função meus_setores()';
  perform 1 from pg_indexes where tablename = 'tarefas' and indexname = 'idx_tarefas_setor_ano_mes';
  assert found, 'falta o índice idx_tarefas_setor_ano_mes';
  for r in select policyname, qual from pg_policies where tablename = 'tarefas' loop
    assert r.qual not like '%EXISTS%', format('policy %s ainda usa EXISTS por linha', r.policyname);
  end loop;
end $$;

set local role authenticated;
do $$
declare
  r record;
begin
  for r in select id from _esperado loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.id, 'role', 'authenticated')::text, true);
    insert into _visto select r.id, count(*) from tarefas;
  end loop;
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  assert (select count(*) from tarefas) = 0, 'anon enxerga tarefas';
end $$;

reset role;
do $$
declare
  r record;
begin
  for r in select e.id, e.qtd as esperado, v.qtd as visto
           from _esperado e left join _visto v using (id)
           where v.qtd is distinct from e.qtd loop
    raise exception 'perfil % vê % tarefas, esperado %', r.id, r.visto, r.esperado;
  end loop;
end $$;

select '057 OK' as resultado;
rollback;
