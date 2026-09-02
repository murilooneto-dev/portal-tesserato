-- supabase/migrations/037_tarefa_grupos.sql

-- Agrupamento de tarefas na ficha do cliente: o usuário reúne várias
-- tarefas sob um nome (ex.: várias tarefas do mesmo processo), pra reduzir
-- a poluição visual da checklist. Escopo é por cliente (não é um catálogo
-- reutilizável entre clientes, ao contrário de tarefa_tipos) — cada cliente
-- tem seus próprios grupos.
--
-- `tarefas` guarda os nomes (tarefa_tipos.nome) das tarefas que pertencem
-- ao grupo, mesmo padrão de tarefas_personalizadas: comparação por texto,
-- sem FK formal (ver 006_clientes_fiscal_e_tarefas_setor.sql).

create table tarefa_grupos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes(id) on delete cascade,
  setor       user_setor not null,
  nome        text not null,
  tarefas     text[] not null default '{}',
  created_at  timestamptz not null default now(),
  unique (cliente_id, setor, nome)
);

alter table tarefa_grupos enable row level security;

-- Mesmo padrão de tarefa_tipos (007_schema_contabil.sql): leitura liberada
-- pra qualquer autenticado, escrita restrita à policy de admin — a escrita
-- de verdade acontece via getAuthenticatedAdmin() (service role) depois de
-- checar podeEditarCliente*/podeEditarClienteContabil/podeEditarClientePessoal
-- em lib/tarefa-grupos-actions.ts, mesmo padrão usado por
-- toggleTarefaContabil (app/contabil/clientes/actions.ts) pra escrever em
-- tabelas com RLS restrita a partir de uma ação de um usuário não-admin.
create policy "Autenticados leem tarefa_grupos" on tarefa_grupos for select using (auth.uid() is not null);
create policy "Admin gerencia tarefa_grupos" on tarefa_grupos for all using (is_admin());
