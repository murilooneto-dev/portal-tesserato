-- supabase/migrations/006_clientes_fiscal_e_tarefas_setor.sql

-- ============================================================
-- Move os campos operacionais do Fiscal de `clientes` para uma
-- tabela filha `clientes_fiscal` (1:1), e adiciona `tarefas.setor`.
-- Ver docs/superpowers/specs/2026-07-14-motor-tarefas-por-setor-contabil-design.md
-- ============================================================

-- Precisa vir antes do DROP COLUMN abaixo: a policy antiga depende de
-- clientes.responsavel, que está prestes a ser removida.
drop policy if exists "Responsavel atualiza seu cliente" on clientes;

create table clientes_fiscal (
  cliente_id              uuid primary key references clientes(id) on delete cascade,
  cod                     text,
  regime                  text,
  atividade               text,
  responsavel             text,
  grupo                   text default 'normal',
  obs                     text,
  prioridade              integer default 0,
  envia_iss               boolean default false,
  confere_siga            boolean default false,
  login_iss               text,
  senha_iss               text,
  email_envio_iss         text,
  declaracao_anual        boolean default false,
  tarefas_personalizadas  text[] not null default '{}'
);

insert into clientes_fiscal (
  cliente_id, cod, regime, atividade, responsavel, grupo, obs, prioridade,
  envia_iss, confere_siga, login_iss, senha_iss, email_envio_iss,
  declaracao_anual, tarefas_personalizadas
)
select
  id, cod, regime, atividade, responsavel, grupo, obs, prioridade,
  envia_iss, confere_siga, login_iss, senha_iss, email_envio_iss,
  declaracao_anual, tarefas_personalizadas
from clientes;

alter table clientes
  drop column cod,
  drop column regime,
  drop column atividade,
  drop column responsavel,
  drop column grupo,
  drop column obs,
  drop column prioridade,
  drop column envia_iss,
  drop column confere_siga,
  drop column login_iss,
  drop column senha_iss,
  drop column email_envio_iss,
  drop column declaracao_anual,
  drop column tarefas_personalizadas;

create index idx_clientes_fiscal_responsavel on clientes_fiscal (lower(responsavel));
create index idx_clientes_fiscal_grupo on clientes_fiscal (grupo);

-- tarefas.setor
alter table tarefas add column setor user_setor not null default 'fiscal';
alter table tarefas alter column setor drop default;

alter table tarefas drop constraint if exists tarefas_cliente_mes_ano_tipo_key;
alter table tarefas add constraint tarefas_cliente_mes_ano_tipo_setor_key
  unique (cliente_id, mes, ano, tipo, setor);

-- ---------- RLS: clientes_fiscal ----------
alter table clientes_fiscal enable row level security;

create policy "Setor fiscal le dados fiscais" on clientes_fiscal for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and 'fiscal' = any(p.setores)
  )
);

create policy "Admin gerencia dados fiscais" on clientes_fiscal for all using (is_admin());

create policy "Responsavel atualiza seus dados fiscais" on clientes_fiscal for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and lower(p.nome) = lower(clientes_fiscal.responsavel))
);

-- ---------- RLS: clientes (repõe a policy que dependia de responsavel) ----------
create policy "Responsavel atualiza seu cliente" on clientes for update using (
  exists (
    select 1 from clientes_fiscal cf
    join profiles p on p.id = auth.uid()
    where cf.cliente_id = clientes.id and lower(p.nome) = lower(cf.responsavel)
  )
);

-- ---------- RLS: tarefas (isola leitura por setor) ----------
drop policy if exists "Autenticados leem tarefas" on tarefas;
create policy "Setor le suas tarefas" on tarefas for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and tarefas.setor = any(p.setores)
  )
);
