-- Permite excluir pontualmente uma tarefa gerada automaticamente por
-- vínculo (Grupo ou Atividade+Regime) de UM cliente específico, sem
-- desfazer o vínculo geral (que continua valendo pros outros clientes).
-- Reversível — ver lib/tarefas-esperadas.ts:tarefasAutomaticasVisiveis.
alter table clientes_fiscal   add column tarefas_excluidas text[] not null default '{}';
alter table clientes_contabil add column tarefas_excluidas text[] not null default '{}';
alter table clientes_pessoal  add column tarefas_excluidas text[] not null default '{}';
