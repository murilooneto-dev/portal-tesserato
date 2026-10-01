-- Adiciona o tipo de evento 'tarefas' ao evento_log — dispara quando a
-- estrutura de tarefas de um cliente muda (tarefa configurada/personalizada
-- adicionada ou removida, grupo de tarefas criado/editado/excluído).
-- Precisa ser aplicada ANTES do deploy do código: sem ela o insert do log
-- falha silenciosamente (o save do cliente segue funcionando).

alter table evento_log drop constraint evento_log_tipo_evento_check;

alter table evento_log add constraint evento_log_tipo_evento_check
  check (tipo_evento in (
    'criacao', 'edicao', 'exclusao', 'desabilitacao', 'reabilitacao', 'troca_responsavel', 'tarefas'
  ));
