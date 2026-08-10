-- supabase/migrations/023_fix_legacy_tarefas_unique_constraint.sql

begin;

-- Migration 006 tentou derrubar a constraint unique original de `tarefas`
-- (criada implicitamente por `unique (cliente_id, mes, ano, tipo)` em
-- 001_initial.sql) antes de criar a nova constraint com `setor`. Só que o
-- nome usado no DROP tinha um erro de digitação (faltava "_id"), e como o
-- DROP usava "if exists", o erro de nome não gerou falha — só
-- silenciosamente não fez nada, e a constraint antiga (sem `setor`) ficou
-- viva desde então.
--
-- Isso ficou invisível até a tarefa automática de parcelamento
-- (2026-08-07): é a primeira feature que precisa da MESMA `tipo` pro mesmo
-- cliente/mes/ano em DOIS setores diferentes ao mesmo tempo.
--
-- Em vez de repetir o erro original (nome fixo + "if exists" mascarando um
-- typo), esta migration acha a constraint pelo FORMATO real dela — unique
-- em exatamente (cliente_id, mes, ano, tipo), nem mais nem menos colunas —
-- então funciona mesmo que o nome real na produção seja diferente do nome
-- observado em dev.
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'tarefas'::regclass
    and contype = 'u'
    and conkey = (
      select array_agg(attnum order by attnum)
      from pg_attribute
      where attrelid = 'tarefas'::regclass
        and attname in ('cliente_id', 'mes', 'ano', 'tipo')
    );

  if constraint_name is not null then
    execute format('alter table tarefas drop constraint %I', constraint_name);
  end if;
end $$;

commit;
