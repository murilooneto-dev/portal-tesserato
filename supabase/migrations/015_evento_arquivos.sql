-- supabase/migrations/015_evento_arquivos.sql

-- Anexos de Evento (tarefas_avulsas) — mesmo padrão de tarefa_arquivos:
-- arquivo guardado como base64 na própria linha, sem Supabase Storage.
-- Ver docs/superpowers/specs/2026-07-24-evento-anexos-design.md
create table evento_arquivos (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid references tarefas_avulsas(id) on delete cascade not null,
  name           text not null,
  size           integer not null,
  content_base64 text not null,
  uploaded_at    timestamptz not null default now()
);

create index idx_evento_arquivos_evento_id on evento_arquivos (evento_id);

alter table evento_arquivos enable row level security;

create policy "Setor le arquivos de seus eventos" on evento_arquivos for select using (
  is_admin() or exists (
    select 1 from tarefas_avulsas ev
    join profiles p on p.id = auth.uid()
    where ev.id = evento_arquivos.evento_id and ev.setor = any(p.setores)
  )
);

create policy "Setor gerencia arquivos de seus eventos" on evento_arquivos for all using (
  is_admin() or exists (
    select 1 from tarefas_avulsas ev
    join profiles p on p.id = auth.uid()
    where ev.id = evento_arquivos.evento_id and ev.setor = any(p.setores)
  )
);
