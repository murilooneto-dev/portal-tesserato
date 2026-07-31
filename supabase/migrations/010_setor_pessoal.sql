-- supabase/migrations/010_setor_pessoal.sql

-- ============================================================
-- Schema do setor Pessoal: clientes_pessoal (espelho de
-- clientes_contabil), coluna genérica tarefa_tipos.meses_visiveis
-- (filtra em quais meses um tipo de tarefa é visível — usada pelo
-- 13º Salário, sazonal), catálogo Pessoal, e tarefas_avulsas
-- (mecanismo genérico "+ Evento", não setor-específico).
-- Ver docs/superpowers/specs/2026-07-16-setor-pessoal-e-tarefa-avulsa-design.md
-- ============================================================

create table clientes_pessoal (
  cliente_id              uuid primary key references clientes(id) on delete cascade,
  atividade               text,
  responsavel             text,
  prioridade              integer default 0,
  obs                     text,
  tarefas_personalizadas  text[] not null default '{}'
);

create index idx_clientes_pessoal_responsavel on clientes_pessoal (lower(responsavel));

alter table clientes_pessoal enable row level security;

create policy "Setor pessoal le dados pessoal" on clientes_pessoal for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and 'pessoal' = any(p.setores)
  )
);

create policy "Admin gerencia dados pessoal" on clientes_pessoal for all using (is_admin());

create policy "Responsavel atualiza seus dados pessoal" on clientes_pessoal for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and lower(p.nome) = lower(clientes_pessoal.responsavel))
);

-- ---------- tarefa_tipos.meses_visiveis (genérico) ----------

alter table tarefa_tipos add column meses_visiveis smallint[];

-- ---------- Catálogo Pessoal ----------

insert into tarefa_tipos (setor, nome, etapas, meses_visiveis) values
  ('pessoal', 'Folha de Pagamento', array['Gerar','Relatório','Guias','Envio'], null),
  ('pessoal', '13º Salário', array['Gerar','Relatório','Guias','Envio'], array[11,12]),
  ('pessoal', 'Consulta Ecac - Situação Fiscal', null, null),
  ('pessoal', 'Consulta FGTS - DET', null, null),
  ('pessoal', 'Consulta Sindicato - Convenções', null, null);

-- Backfill: clientes que já têm o setor Pessoal marcado (via clientes.setores)
-- ganham a linha em clientes_pessoal com as 5 tarefas padrão pré-populadas.
insert into clientes_pessoal (cliente_id, tarefas_personalizadas)
select c.id, (select array_agg(nome order by nome) from tarefa_tipos where setor = 'pessoal')
from clientes c
where 'pessoal' = any(c.setores)
  and not exists (select 1 from clientes_pessoal cp where cp.cliente_id = c.id);

-- ---------- tarefas_avulsas (genérico — mecanismo "+ Evento") ----------

create table tarefas_avulsas (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid references clientes(id) on delete cascade not null,
  setor        user_setor not null,
  titulo       text not null,
  descricao    text,
  data         date not null,
  criado_por   uuid references profiles(id) on delete set null,
  concluida    boolean not null default false,
  concluida_em timestamptz,
  created_at   timestamptz not null default now()
);

create index idx_tarefas_avulsas_cliente on tarefas_avulsas (cliente_id, setor);

alter table tarefas_avulsas enable row level security;

create policy "Setor le tarefas avulsas" on tarefas_avulsas for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and tarefas_avulsas.setor = any(p.setores)
  )
);

create policy "Setor gerencia tarefas avulsas" on tarefas_avulsas for all using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and tarefas_avulsas.setor = any(p.setores)
  )
);
