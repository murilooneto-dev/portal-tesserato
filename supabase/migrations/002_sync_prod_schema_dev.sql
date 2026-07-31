-- ============================================================
-- Sincroniza o schema de dev com o schema real de produção,
-- levantado via information_schema/pg_catalog em 2026-07-13
-- (produção nunca teve essas tabelas/colunas versionadas em SQL).
--
-- Políticas de RLS abaixo seguem o mesmo padrão das tabelas já
-- versionadas em 001_initial.sql (autenticado lê, admin gerencia);
-- as políticas reais de produção para estas tabelas específicas
-- não foram conferidas — ajustar se algo divergir no teste.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Patch em tabelas já criadas por 001_initial.sql ----------

alter table clientes add column if not exists municipio text;
alter table clientes add column if not exists uf text;
alter table clientes add column if not exists envia_iss boolean default false;
alter table clientes add column if not exists login_iss text;
alter table clientes add column if not exists senha_iss text;
alter table clientes add column if not exists email_envio_iss text;
alter table clientes add column if not exists confere_siga boolean default false;
alter table clientes add column if not exists declaracao_anual boolean default false;
alter table clientes add column if not exists tarefas_custom text[] default '{}';
alter table clientes add column if not exists tarefas_personalizadas text[] not null default '{}';
alter table clientes add column if not exists contato_chat text;

update clientes
set grupo = case
  when lower(regime) like '%simples%' then 'simples'
  when lower(regime) like '%mei%'     then 'mei'
  else 'normal'
end
where grupo is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_cnpj_unique') then
    alter table clientes add constraint clientes_cnpj_unique unique (cnpj);
  end if;
end $$;

alter table profiles add column if not exists pages text[];
alter table profiles add column if not exists abas_acesso text[] default '{}';

alter table tarefas add column if not exists recebido boolean not null default false;
alter table tarefas add column if not exists importado boolean not null default false;
alter table tarefas add column if not exists conferido boolean not null default false;

create index if not exists idx_clientes_responsavel on clientes (lower(responsavel));
create index if not exists idx_clientes_grupo on clientes (grupo);
create index if not exists idx_tarefas_cliente_mes_ano on tarefas (cliente_id, mes, ano);

-- ---------- Tabelas novas (existem em produção, nunca versionadas) ----------

create table if not exists agenda (
  id                uuid primary key default uuid_generate_v4(),
  usuario_id        uuid references profiles on delete cascade not null,
  titulo            text not null,
  descricao         text,
  data_compromisso  date not null,
  hora_compromisso  text,
  status            text not null default 'pendente',
  lembrete_3_dias   boolean not null default false,
  created_at        timestamptz not null default now()
);

create table if not exists client_files (
  id              uuid primary key default uuid_generate_v4(),
  cliente_id      uuid references clientes on delete cascade not null,
  name            text not null,
  size            integer not null,
  content_base64  text not null,
  uploaded_at     timestamptz not null default now()
);

create table if not exists deletion_log (
  id            uuid primary key default uuid_generate_v4(),
  usuario_id    uuid references profiles on delete set null,
  usuario_nome  text not null,
  tipo          text not null,
  nome          text not null,
  detalhes      text,
  created_at    timestamptz not null default now()
);

create table if not exists task_unlock_log (
  id            uuid primary key default uuid_generate_v4(),
  usuario_id    uuid references profiles on delete set null,
  usuario_nome  text not null,
  cliente_id    uuid references clientes on delete set null,
  cliente_nome  text not null,
  tarefa        text not null,
  competencia   text not null,
  valor_antigo  text,
  valor_novo    text,
  motivo        text not null,
  created_at    timestamptz not null default now()
);

create table if not exists atividade_templates (
  atividade text primary key,
  tarefas   text[] not null default '{}'
);

create table if not exists grupo_templates (
  grupo   text primary key,
  tarefas text[] not null default '{}'
);

create table if not exists observacoes_clientes (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes on delete cascade not null,
  mes        integer not null,
  ano        integer not null,
  texto      text not null default '',
  updated_at timestamptz not null default now(),
  unique (cliente_id, mes, ano)
);

create table if not exists parcelamentos (
  id           uuid primary key default uuid_generate_v4(),
  secao        text not null,
  empresa      text not null,
  cnpj         text,
  regime       text,
  responsavel  text,
  local_tipo   text,
  tarefa       text,
  jan text, fev text, mar text, abr text, mai text, jun text,
  jul text, ago text, set text, out text, nov text, dez text,
  senhas       text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_parcelamentos_responsavel on parcelamentos (lower(responsavel));

create table if not exists app_settings (
  id                      integer primary key default 1,
  dashboard_announcement  text default '',
  email_gmail_user        text default '',
  email_gmail_pass        text default '',
  email_destino           text default '',
  email_ativo             boolean default false,
  updated_at              timestamptz not null default now(),
  gmail_remetente         text default '',
  gmail_senha             text default '',
  email_destinatario      text default '',
  usar_senha_app          text default 'false',
  rotina1_ativo text default 'false', rotina1_dia text default '', rotina1_hora text default '',
  rotina2_ativo text default 'false', rotina2_dia text default '', rotina2_hora text default '',
  log1_ativo text default 'false', log1_dia text default '', log1_hora text default '',
  log2_ativo text default 'false', log2_dia text default '', log2_hora text default '',
  log3_ativo text default 'false', log3_dia text default '', log3_hora text default '',
  log4_ativo text default 'false', log4_dia text default '', log4_hora text default ''
);

insert into app_settings (id) values (1) on conflict (id) do nothing;

-- RLS: mesmo padrão das tabelas já existentes (autenticado lê, admin gerencia)
alter table agenda                enable row level security;
alter table client_files          enable row level security;
alter table deletion_log          enable row level security;
alter table task_unlock_log       enable row level security;
alter table atividade_templates   enable row level security;
alter table grupo_templates       enable row level security;
alter table observacoes_clientes  enable row level security;
alter table parcelamentos         enable row level security;
alter table app_settings          enable row level security;

create policy "Autenticados leem agenda" on agenda for select using (auth.uid() is not null);
create policy "Usuario gerencia propria agenda" on agenda for all using (
  usuario_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "Autenticados leem client_files" on client_files for select using (auth.uid() is not null);
create policy "Admin gerencia client_files" on client_files for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "Autenticados leem deletion_log" on deletion_log for select using (auth.uid() is not null);
create policy "Admin gerencia deletion_log" on deletion_log for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "Autenticados leem task_unlock_log" on task_unlock_log for select using (auth.uid() is not null);
create policy "Admin gerencia task_unlock_log" on task_unlock_log for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "Autenticados leem atividade_templates" on atividade_templates for select using (auth.uid() is not null);
create policy "Admin gerencia atividade_templates" on atividade_templates for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "Autenticados leem grupo_templates" on grupo_templates for select using (auth.uid() is not null);
create policy "Admin gerencia grupo_templates" on grupo_templates for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "Autenticados leem observacoes_clientes" on observacoes_clientes for select using (auth.uid() is not null);
create policy "Autenticados gerenciam observacoes_clientes" on observacoes_clientes for all using (auth.uid() is not null);

create policy "Autenticados leem parcelamentos" on parcelamentos for select using (auth.uid() is not null);
create policy "Admin gerencia parcelamentos" on parcelamentos for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "Autenticados leem app_settings" on app_settings for select using (auth.uid() is not null);
create policy "Admin gerencia app_settings" on app_settings for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
