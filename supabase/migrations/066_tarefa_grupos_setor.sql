-- supabase/migrations/066_tarefa_grupos_setor.sql

-- Grupos de tarefas por SETOR (hoje só o Financeiro): o administrador cria o
-- grupo uma vez em Configurações e ele vale para todos os clientes do setor.
-- Na ficha do cliente, as tarefas do grupo aparecem numa linha única que
-- abre e fecha (nome do grupo + "2 de 5").
--
-- É uma tabela separada de tarefa_grupos (037) de propósito: aquela é por
-- cliente (cliente_id not null) e tem gatilhos de lixeira/auditoria e
-- consultas por cliente que não podem ser afetados por um grupo global.
--
-- `tarefas` guarda os nomes (tarefa_tipos.nome) das tarefas do grupo, mesmo
-- padrão de tarefa_grupos: comparação por texto, sem FK formal. Que uma
-- tarefa pertença a um só grupo é regra da action, não do banco.

create table tarefa_grupos_setor (
  id          uuid primary key default gen_random_uuid(),
  setor       user_setor not null,
  nome        text not null,
  tarefas     text[] not null default '{}',
  created_at  timestamptz not null default now(),
  unique (setor, nome)
);

alter table tarefa_grupos_setor enable row level security;

-- Mesmo padrão de tarefa_grupos (037): leitura liberada pra qualquer
-- autenticado (a ficha do cliente precisa ler); escrita só pela policy de
-- admin — a escrita de verdade vem da action, que checa o acesso a
-- Configurações do setor e grava com o client de serviço.
create policy "Autenticados leem tarefa_grupos_setor" on tarefa_grupos_setor for select using (auth.uid() is not null);
create policy "Admin gerencia tarefa_grupos_setor" on tarefa_grupos_setor for all using (is_admin()) with check (is_admin());
