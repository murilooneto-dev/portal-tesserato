-- Setor Financeiro: catálogos (tipos de entrada/saída, centro de custo) e
-- lançamentos de movimentos (recebimentos/pagamentos). Movimentos não têm
-- vínculo com cliente — são registros gerais da empresa.

create table financeiro_tipos (
  id         uuid primary key default gen_random_uuid(),
  natureza   text not null check (natureza in ('entrada', 'saida')),
  nome       text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  unique (natureza, nome)
);

create table financeiro_centros_custo (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

create table financeiro_movimentos (
  id              uuid primary key default gen_random_uuid(),
  natureza        text not null check (natureza in ('entrada', 'saida')),
  tipo_id         uuid not null references financeiro_tipos(id),
  centro_custo_id uuid references financeiro_centros_custo(id),
  valor           numeric(12,2) not null check (valor > 0),
  data            date not null,
  observacao      text,
  criado_por      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index idx_financeiro_movimentos_data on financeiro_movimentos (natureza, data desc);
create index idx_financeiro_movimentos_tipo on financeiro_movimentos (tipo_id);
create index idx_financeiro_movimentos_centro_custo on financeiro_movimentos (centro_custo_id);

alter table financeiro_tipos enable row level security;
alter table financeiro_centros_custo enable row level security;
alter table financeiro_movimentos enable row level security;

-- Catálogos: leitura pra qualquer autenticado, escrita só admin (mesmo padrão de tarefa_tipos, migration 007)
create policy "Autenticados leem financeiro_tipos" on financeiro_tipos for select using (auth.uid() is not null);
create policy "Admin gerencia financeiro_tipos" on financeiro_tipos for all using (is_admin());

create policy "Autenticados leem financeiro_centros_custo" on financeiro_centros_custo for select using (auth.uid() is not null);
create policy "Admin gerencia financeiro_centros_custo" on financeiro_centros_custo for all using (is_admin());

-- Movimentos: quem tem 'financeiro' em profiles.setores (ou admin) lê/gerencia — mesmo padrão de tarefas_avulsas (migration 010)
create policy "Setor financeiro le movimentos" on financeiro_movimentos for select using (
  is_admin() or exists (select 1 from profiles p where p.id = auth.uid() and 'financeiro' = any(p.setores))
);
create policy "Setor financeiro gerencia movimentos" on financeiro_movimentos for all using (
  is_admin() or exists (select 1 from profiles p where p.id = auth.uid() and 'financeiro' = any(p.setores))
);
