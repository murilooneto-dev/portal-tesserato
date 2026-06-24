-- Extensão para UUID
create extension if not exists "uuid-ossp";

-- Enum de roles
create type user_role as enum ('admin', 'operador');

-- Enum de setores
create type user_setor as enum ('fiscal', 'contabil', 'pessoal', 'societario', 'financeiro');

-- Enum de bots
create type bot_tipo as enum ('iss', 'siga', 'mei');

-- Enum de status de evento
create type bot_status as enum ('processado', 'erro');

-- Tabela de perfis (extensão do auth.users)
create table profiles (
  id         uuid references auth.users on delete cascade primary key,
  nome       text not null,
  role       user_role not null default 'operador',
  setor      user_setor not null default 'fiscal',
  cor        text not null default '#6366f1',
  created_at timestamptz not null default now()
);

-- Tabela de clientes
create table clientes (
  id          uuid primary key default uuid_generate_v4(),
  cod         text,
  nome        text not null,
  cnpj        text,
  regime      text,
  atividade   text,
  responsavel text,
  grupo       text default 'normal',
  obs         text,
  prioridade  integer default 0,
  mit         date,
  created_at  timestamptz not null default now()
);

-- Tabela de tarefas mensais
create table tarefas (
  id           uuid primary key default uuid_generate_v4(),
  cliente_id   uuid references clientes on delete cascade not null,
  usuario_id   uuid references profiles on delete set null,
  mes          smallint not null check (mes between 1 and 12),
  ano          smallint not null,
  tipo         text not null,
  concluida    boolean not null default false,
  concluida_em timestamptz,
  created_at   timestamptz not null default now(),
  unique (cliente_id, mes, ano, tipo)
);

-- Tabela de links rápidos
create table links_rapidos (
  id       uuid primary key default uuid_generate_v4(),
  titulo   text not null,
  url      text not null,
  logo_url text,
  ordem    integer not null default 0,
  ativo    boolean not null default true
);

-- Tabela de configuração dos bots
create table bots_config (
  id                  uuid primary key default uuid_generate_v4(),
  usuario_id          uuid references profiles on delete cascade not null,
  bot                 bot_tipo not null,
  pasta_downloads     text not null default '',
  email_remetente     text not null default '',
  email_destinatario  text not null default '',
  unique (usuario_id, bot)
);

-- Tabela de eventos dos bots
create table bot_eventos (
  id            uuid primary key default uuid_generate_v4(),
  bot           bot_tipo not null,
  arquivo       text not null,
  status        bot_status not null,
  mensagem      text,
  processado_em timestamptz not null default now()
);

-- Trigger: criar perfil automaticamente ao criar usuário no auth
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, nome, role, setor, cor)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'operador'),
    coalesce((new.raw_user_meta_data->>'setor')::user_setor, 'fiscal'),
    coalesce(new.raw_user_meta_data->>'cor', '#6366f1')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- RLS (Row Level Security)
alter table profiles      enable row level security;
alter table clientes      enable row level security;
alter table tarefas       enable row level security;
alter table links_rapidos enable row level security;
alter table bots_config   enable row level security;
alter table bot_eventos   enable row level security;

-- Políticas: profiles
create policy "Usuário lê próprio perfil"
  on profiles for select using (auth.uid() = id);

create policy "Admin lê todos os perfis"
  on profiles for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Admin atualiza perfis"
  on profiles for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Políticas: clientes
create policy "Autenticados leem clientes"
  on clientes for select using (auth.uid() is not null);

create policy "Admin gerencia clientes"
  on clientes for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Políticas: tarefas
create policy "Autenticados leem tarefas"
  on tarefas for select using (auth.uid() is not null);

create policy "Usuário gerencia próprias tarefas"
  on tarefas for all using (
    usuario_id = auth.uid() or
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Políticas: links_rapidos
create policy "Autenticados leem links"
  on links_rapidos for select using (auth.uid() is not null);

create policy "Admin gerencia links"
  on links_rapidos for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Políticas: bots_config
create policy "Usuário gerencia própria config de bot"
  on bots_config for all using (
    usuario_id = auth.uid() or
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Políticas: bot_eventos
create policy "Autenticados leem eventos"
  on bot_eventos for select using (auth.uid() is not null);

-- Dados iniciais: links rápidos
insert into links_rapidos (titulo, url, logo_url, ordem) values
  ('CAV Receita Federal', 'https://cav.receita.fazenda.gov.br', null, 1),
  ('eContador Alterdata',  'https://econline.alterdata.com.br',  null, 2),
  ('Nutror',               'https://www.nutror.com',             null, 3),
  ('GClick',               'https://www.gclick.com.br',          null, 4),
  ('IOB Online',           'https://iob.com.br',                 null, 5),
  ('NFStock Alterdata',    'https://nfstock.alterdata.com.br',   null, 6),
  ('SIGA SEFAZ CE',        'https://siga.sefaz.ce.gov.br',       null, 7),
  ('Tax Prático',          'https://www.taxpratico.com.br',      null, 8),
  ('Webmail',              'https://webmail.tesseratocontabilidade.com.br', null, 9),
  ('Zap Contábil',         'https://zapcontabil.com.br',         null, 10);
