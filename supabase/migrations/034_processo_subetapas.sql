-- supabase/migrations/034_processo_subetapas.sql

-- Cada etapa de um tipo de processo (Societário) ganha subetapas com
-- formato de resposta próprio (texto+anexo / checklist / data) — mesma
-- linguagem visual do formulário de tipo de tarefa
-- (components/geral/NovoTipoTarefaModal.tsx), mas um conceito próprio da
-- subetapa.
--
-- processo_tipos.etapas (text[]) NÃO é alterada aqui, de propósito:
-- 027_procedimentos_societario.sql já shippou uma tela de execução
-- (app/societario/procedimentos/page.tsx) que lê esse array direto e usa
-- o NOME de cada etapa como chave do jsonb `campos`. Normalizar etapas
-- numa tabela própria quebraria essa tela já em uso. Em vez disso, a
-- subetapa referencia a etapa pelo nome dela (junto com o tipo de
-- processo) — como não há edição de etapa depois de criada, esse nome é
-- estável. Ver docs/superpowers/specs/2026-09-01-processo-subetapas-design.md.
--
-- Mesmo padrão de RLS de 024_config_regimes_grupos_atividades.sql: leitura
-- livre pra autenticado, escrita só admin via is_admin().

create table processo_subetapas (
  id                uuid primary key default gen_random_uuid(),
  processo_tipo_id  uuid references processo_tipos(id) on delete cascade not null,
  etapa_nome        text not null,
  nome              text not null,
  tipo_resposta     text not null check (tipo_resposta in ('texto', 'checklist', 'data')),
  ordem             integer not null default 0
);

alter table processo_subetapas enable row level security;

create policy "Autenticados leem processo_subetapas" on processo_subetapas for select using (auth.uid() is not null);
create policy "Admin gerencia processo_subetapas" on processo_subetapas for all using (is_admin());
