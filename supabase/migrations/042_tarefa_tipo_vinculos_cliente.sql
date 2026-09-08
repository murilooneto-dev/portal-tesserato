-- supabase/migrations/042_tarefa_tipo_vinculos_cliente.sql

-- Vínculo direto tipo de tarefa <-> cliente, exclusivo do Societário (que
-- não tem regime/atividade pra derivar tarefas automaticamente). Reaproveita
-- tarefa_tipo_vinculos (já usada por regime/atividade) em vez de criar uma
-- tabela nova: entidade_id passa a poder referenciar clientes.id quando
-- entidade_tipo='cliente', mesmo padrão sem FK formal já usado pra
-- regime/atividade (ver nota original em 025_tarefa_tipo_vinculos.sql).
alter table tarefa_tipo_vinculos drop constraint tarefa_tipo_vinculos_entidade_tipo_check;
alter table tarefa_tipo_vinculos add constraint tarefa_tipo_vinculos_entidade_tipo_check
  check (entidade_tipo in ('regime', 'grupo', 'atividade', 'cliente'));

-- created_at do vínculo: usado pra decidir a partir de qual período (mês/ano)
-- uma tarefa societária passa a ser esperada pro cliente — vincular hoje não
-- deve gerar pendência retroativa pra períodos já passados no ano. Nullable
-- de fato (default now() só se aplica a linhas novas); linhas legadas de
-- regime/atividade não usam essa coluna.
alter table tarefa_tipo_vinculos add column created_at timestamptz not null default now();

create index idx_tarefa_tipo_vinculos_cliente on tarefa_tipo_vinculos (entidade_id)
  where entidade_tipo = 'cliente';
