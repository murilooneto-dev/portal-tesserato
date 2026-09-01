-- Marca uma tarefa como concluída sem exigir data/texto/etapas — pra
-- clientes que num mês específico não tiveram movimento naquela tarefa.
-- Compartilhada pelos 3 setores via a coluna setor já existente em tarefas.
alter table tarefas add column sem_movimento boolean not null default false;
