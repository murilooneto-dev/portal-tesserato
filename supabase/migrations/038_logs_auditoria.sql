-- Log de auditoria de eventos grandes em clientes (criação, exclusão,
-- desabilitação, reabilitação, troca de responsável) + histórico
-- versionado de responsável por período.

create table if not exists evento_log (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  usuario_id uuid references profiles on delete set null,
  usuario_nome text not null,
  setor user_setor,
  cliente_id uuid references clientes on delete set null,
  cliente_nome text not null,
  tipo_evento text not null check (tipo_evento in (
    'criacao', 'exclusao', 'desabilitacao', 'reabilitacao', 'troca_responsavel'
  )),
  detalhes jsonb
);

alter table evento_log enable row level security;

create policy "Autenticados leem evento_log" on evento_log
  for select using (auth.uid() is not null);

create policy "Admin gerencia evento_log" on evento_log
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create index if not exists evento_log_cliente_idx on evento_log (cliente_id, created_at desc);

create table if not exists cliente_responsavel_historico (
  id uuid primary key default uuid_generate_v4(),
  cliente_id uuid not null references clientes on delete cascade,
  setor user_setor not null,
  responsavel text not null,
  data_inicio timestamptz not null default now(),
  data_fim timestamptz,
  usuario_id uuid references profiles on delete set null,
  usuario_nome text,
  created_at timestamptz not null default now()
);

alter table cliente_responsavel_historico enable row level security;

create policy "Autenticados leem cliente_responsavel_historico" on cliente_responsavel_historico
  for select using (auth.uid() is not null);

create policy "Admin gerencia cliente_responsavel_historico" on cliente_responsavel_historico
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create index if not exists cliente_resp_hist_aberto_idx
  on cliente_responsavel_historico (cliente_id, setor, data_fim);

-- Backfill: todo cliente já existente com responsável preenchido nasce com
-- um período aberto, começando na data de criação do cliente. Assim o
-- histórico fica consistente desde o primeiro uso, sem buraco.
insert into cliente_responsavel_historico (cliente_id, setor, responsavel, data_inicio, usuario_nome)
select cf.cliente_id, 'fiscal', cf.responsavel, c.created_at, 'Migração inicial'
from clientes_fiscal cf
join clientes c on c.id = cf.cliente_id
where cf.responsavel is not null and cf.responsavel <> ''
  and not exists (
    select 1 from cliente_responsavel_historico h
    where h.cliente_id = cf.cliente_id and h.setor = 'fiscal'
  );

insert into cliente_responsavel_historico (cliente_id, setor, responsavel, data_inicio, usuario_nome)
select cc.cliente_id, 'contabil', cc.responsavel, c.created_at, 'Migração inicial'
from clientes_contabil cc
join clientes c on c.id = cc.cliente_id
where cc.responsavel is not null and cc.responsavel <> ''
  and not exists (
    select 1 from cliente_responsavel_historico h
    where h.cliente_id = cc.cliente_id and h.setor = 'contabil'
  );

insert into cliente_responsavel_historico (cliente_id, setor, responsavel, data_inicio, usuario_nome)
select cp.cliente_id, 'pessoal', cp.responsavel, c.created_at, 'Migração inicial'
from clientes_pessoal cp
join clientes c on c.id = cp.cliente_id
where cp.responsavel is not null and cp.responsavel <> ''
  and not exists (
    select 1 from cliente_responsavel_historico h
    where h.cliente_id = cp.cliente_id and h.setor = 'pessoal'
  );
