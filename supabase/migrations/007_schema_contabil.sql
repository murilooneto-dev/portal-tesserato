-- supabase/migrations/007_schema_contabil.sql

-- ============================================================
-- Schema do setor Contábil: clientes_contabil (1:1 com clientes,
-- mesmo padrão de clientes_fiscal), tarefa_tipos (catálogo
-- administrável de tipos de tarefa por setor, semeado com as 7
-- tarefas padrão do Contábil) e tarefa_etapas (sub-passos nomeados
-- com data, genérico — usado por "Movimentação" por enquanto).
-- Ver docs/superpowers/specs/2026-07-14-motor-tarefas-por-setor-contabil-design.md
-- ============================================================

create table clientes_contabil (
  cliente_id              uuid primary key references clientes(id) on delete cascade,
  atividade               text,
  responsavel             text,
  prioridade              integer default 0,
  obs                     text,
  tarefas_personalizadas  text[] not null default '{}'
);

create index idx_clientes_contabil_responsavel on clientes_contabil (lower(responsavel));

alter table clientes_contabil enable row level security;

create policy "Setor contabil le dados contabeis" on clientes_contabil for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and 'contabil' = any(p.setores)
  )
);

create policy "Admin gerencia dados contabeis" on clientes_contabil for all using (is_admin());

create policy "Responsavel atualiza seus dados contabeis" on clientes_contabil for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and lower(p.nome) = lower(clientes_contabil.responsavel))
);

-- ---------- tarefa_tipos ----------

create table tarefa_tipos (
  id      uuid primary key default gen_random_uuid(),
  setor   user_setor not null,
  nome    text not null,
  etapas  text[],
  ativo   boolean not null default true,
  unique (setor, nome)
);

alter table tarefa_tipos enable row level security;

create policy "Autenticados leem tarefa_tipos" on tarefa_tipos for select using (auth.uid() is not null);
create policy "Admin gerencia tarefa_tipos" on tarefa_tipos for all using (is_admin());

insert into tarefa_tipos (setor, nome, etapas) values
  ('contabil', 'Solicitação Distribuição de Lucros', null),
  ('contabil', 'Envio Distribuição de Lucros', null),
  ('contabil', 'Movimentação', array['Solicitada','Conferida','Lançada','Conciliada']),
  ('contabil', 'Importação Entradas', null),
  ('contabil', 'Importação Saídas', null),
  ('contabil', 'Importação Tributos', null),
  ('contabil', 'Importação Folha de Pagamento', null);

-- Backfill: clientes que já têm o setor Contábil marcado (via clientes.setores)
-- ganham a linha em clientes_contabil com as 7 tarefas padrão pré-populadas —
-- mesmo comportamento que a UI da Parte 3 vai aplicar na criação de cliente novo.
insert into clientes_contabil (cliente_id, tarefas_personalizadas)
select c.id, (select array_agg(nome order by nome) from tarefa_tipos where setor = 'contabil')
from clientes c
where 'contabil' = any(c.setores)
  and not exists (select 1 from clientes_contabil cc where cc.cliente_id = c.id);

-- ---------- tarefa_etapas ----------

create table tarefa_etapas (
  id           uuid primary key default gen_random_uuid(),
  tarefa_id    uuid references tarefas(id) on delete cascade not null,
  nome         text not null,
  concluida    boolean not null default false,
  concluida_em date,
  ordem        integer not null default 0
);

create index idx_tarefa_etapas_tarefa_id on tarefa_etapas (tarefa_id);

alter table tarefa_etapas enable row level security;

create policy "Setor le etapas de suas tarefas" on tarefa_etapas for select using (
  is_admin() or exists (
    select 1 from tarefas t
    join profiles p on p.id = auth.uid()
    where t.id = tarefa_etapas.tarefa_id and t.setor = any(p.setores)
  )
);

create policy "Setor gerencia etapas de suas tarefas" on tarefa_etapas for all using (
  is_admin() or exists (
    select 1 from tarefas t
    join profiles p on p.id = auth.uid()
    where t.id = tarefa_etapas.tarefa_id and t.setor = any(p.setores)
  )
);
