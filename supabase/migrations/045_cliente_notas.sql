-- supabase/migrations/045_cliente_notas.sql
--
-- Substitui o campo OBS único (texto livre) do Contábil e do Pessoal por
-- uma lista de notas datadas ("tópicos"), cada uma com autor e data.
-- As colunas antigas clientes_contabil.obs / clientes_pessoal.obs
-- permanecem no banco (não são lidas/escritas pelo app depois desta
-- migration); seu conteúdo é copiado abaixo como a primeira nota de
-- cada cliente, pra não perder nada já escrito.

create table cliente_notas (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references clientes on delete cascade,
  setor        user_setor not null,
  texto        text not null,
  usuario_id   uuid references profiles on delete set null,
  usuario_nome text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

create index idx_cliente_notas_cliente on cliente_notas (cliente_id, setor, created_at desc);

alter table cliente_notas enable row level security;

create policy "Setor contabil le notas" on cliente_notas for select using (
  setor = 'contabil' and (is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and 'contabil' = any(p.setores)
  ))
);
create policy "Setor pessoal le notas" on cliente_notas for select using (
  setor = 'pessoal' and (is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and 'pessoal' = any(p.setores)
  ))
);
create policy "Admin gerencia notas" on cliente_notas for all using (is_admin());
create policy "Responsavel gerencia notas contabil" on cliente_notas for all using (
  setor = 'contabil' and exists (
    select 1 from clientes_contabil cc join profiles p on p.id = auth.uid()
    where cc.cliente_id = cliente_notas.cliente_id and lower(p.nome) = lower(cc.responsavel)
  )
);
create policy "Responsavel gerencia notas pessoal" on cliente_notas for all using (
  setor = 'pessoal' and exists (
    select 1 from clientes_pessoal cp join profiles p on p.id = auth.uid()
    where cp.cliente_id = cliente_notas.cliente_id and lower(p.nome) = lower(cp.responsavel)
  )
);

-- Backfill: preserva o texto que já existia no campo único como primeira nota
insert into cliente_notas (cliente_id, setor, texto, usuario_id, usuario_nome, created_at)
select cliente_id, 'contabil', obs, null, 'Observação anterior', now()
from clientes_contabil where obs is not null and obs <> '';

insert into cliente_notas (cliente_id, setor, texto, usuario_id, usuario_nome, created_at)
select cliente_id, 'pessoal', obs, null, 'Observação anterior', now()
from clientes_pessoal where obs is not null and obs <> '';
