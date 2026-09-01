-- supabase/migrations/034_processo_etapas_subetapas.sql

-- Cada etapa de um tipo de processo (Societário) ganha subetapas com
-- formato de resposta próprio (texto+anexo / checklist / data) — mesma
-- linguagem visual do formulário de tipo de tarefa
-- (components/geral/NovoTipoTarefaModal.tsx), mas um conceito próprio da
-- subetapa. Isso exige normalizar "etapas" de text[] solto pra entidades
-- com ID (senão não dá pra pendurar subetapas nelas). Ver
-- docs/superpowers/specs/2026-09-01-processo-subetapas-design.md.
-- Mesmo padrão de RLS de 024_config_regimes_grupos_atividades.sql: leitura
-- livre pra autenticado, escrita só admin via is_admin().

create table processo_etapas (
  id                uuid primary key default gen_random_uuid(),
  processo_tipo_id  uuid references processo_tipos(id) on delete cascade not null,
  nome              text not null,
  ordem             integer not null default 0
);

create table processo_subetapas (
  id             uuid primary key default gen_random_uuid(),
  etapa_id       uuid references processo_etapas(id) on delete cascade not null,
  nome           text not null,
  tipo_resposta  text not null check (tipo_resposta in ('texto', 'checklist', 'data')),
  ordem          integer not null default 0
);

-- Tabela vazia em dev no momento desta migration (nenhum tipo de processo
-- real cadastrado ainda) — drop direto, sem backfill.
alter table processo_tipos drop column etapas;

alter table processo_etapas    enable row level security;
alter table processo_subetapas enable row level security;

create policy "Autenticados leem processo_etapas" on processo_etapas for select using (auth.uid() is not null);
create policy "Admin gerencia processo_etapas" on processo_etapas for all using (is_admin());

create policy "Autenticados leem processo_subetapas" on processo_subetapas for select using (auth.uid() is not null);
create policy "Admin gerencia processo_subetapas" on processo_subetapas for all using (is_admin());
