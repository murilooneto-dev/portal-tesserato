-- supabase/migrations/026_societario_processos_documentacoes.sql

-- Catálogos de configuração do Societário: tipos de processo (nome +
-- lista de etapas, mesmo padrão de tarefa_tipos.etapas) e modelos de
-- documento (arquivo salvo como base64 na própria linha, sem Supabase
-- Storage — mesmo padrão de client_files/evento_arquivos/tarefa_arquivos).
-- Exclusivos do Societário, sem coluna setor (ao contrário de
-- tarefa_tipos/grupos/regimes/atividades, que são compartilhados entre
-- setores). Ver docs/superpowers/specs/2026-08-27-societario-config-
-- processos-documentacoes-design.md.
-- Mesmo padrão de RLS de 024_config_regimes_grupos_atividades.sql: leitura
-- livre pra autenticado, escrita só admin via is_admin().

create table processo_tipos (
  id      uuid primary key default gen_random_uuid(),
  nome    text not null unique,
  etapas  text[]
);

-- "nome" é o rótulo digitado pelo admin (ex.: "Contrato social padrão"),
-- exibido na listagem. "name" é o nome original do arquivo enviado (ex.:
-- "contrato_v3.pdf") — precisa desse nome exato porque a rota de download
-- compartilhada (app/api/arquivos/[tabela]/[id]/route.ts) seleciona
-- "name, content_base64" igual pras outras tabelas de anexo (client_files/
-- evento_arquivos/tarefa_arquivos) e usa a extensão de "name" pra deduzir o
-- Content-Type — usar o rótulo do admin ali quebraria a detecção de tipo e
-- o nome do arquivo baixado.
create table documentacao_modelos (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  name            text not null,
  size            integer not null,
  content_base64  text not null,
  uploaded_at     timestamptz not null default now()
);

alter table processo_tipos       enable row level security;
alter table documentacao_modelos enable row level security;

create policy "Autenticados leem processo_tipos" on processo_tipos for select using (auth.uid() is not null);
create policy "Admin gerencia processo_tipos" on processo_tipos for all using (is_admin());

create policy "Autenticados leem documentacao_modelos" on documentacao_modelos for select using (auth.uid() is not null);
create policy "Admin gerencia documentacao_modelos" on documentacao_modelos for all using (is_admin());
