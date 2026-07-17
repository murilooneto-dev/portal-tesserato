-- supabase/migrations/011_tipo_resposta_tarefa.sql

-- ============================================================
-- Tipo de resposta de tarefa: cada tipo do catálogo (tarefa_tipos)
-- ganha `tipo_resposta` ('data', comportamento atual e default, ou
-- 'texto' — resposta em texto livre e/ou anexo de arquivo). Tarefas
-- com etapas continuam sempre DATA por convenção de uso (mutuamente
-- exclusivo com TEXTO, decisão de aplicação — não há constraint de
-- banco impedindo a combinação, só a UI nunca renderiza os dois).
-- Ver docs/superpowers/specs/2026-07-17-observacao-e-tipo-resposta-tarefa-design.md
-- ============================================================

alter table tarefa_tipos add column tipo_resposta text not null default 'data'
  check (tipo_resposta in ('data', 'texto'));

alter table tarefas add column resposta_texto text;

create table tarefa_arquivos (
  id             uuid primary key default gen_random_uuid(),
  tarefa_id      uuid references tarefas(id) on delete cascade not null,
  name           text not null,
  size           integer not null,
  content_base64 text not null,
  uploaded_at    timestamptz not null default now()
);

create index idx_tarefa_arquivos_tarefa_id on tarefa_arquivos (tarefa_id);

alter table tarefa_arquivos enable row level security;

create policy "Setor le arquivos de suas tarefas" on tarefa_arquivos for select using (
  is_admin() or exists (
    select 1 from tarefas t
    join profiles p on p.id = auth.uid()
    where t.id = tarefa_arquivos.tarefa_id and t.setor = any(p.setores)
  )
);

create policy "Setor gerencia arquivos de suas tarefas" on tarefa_arquivos for all using (
  is_admin() or exists (
    select 1 from tarefas t
    join profiles p on p.id = auth.uid()
    where t.id = tarefa_arquivos.tarefa_id and t.setor = any(p.setores)
  )
);
