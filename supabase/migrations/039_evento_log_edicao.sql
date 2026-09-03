-- Adiciona o tipo de evento 'edicao' ao evento_log — dispara quando dados
-- do cadastro do cliente mudam numa edição (fora troca de responsável, que
-- já tem seu próprio tipo 'troca_responsavel').

alter table evento_log drop constraint evento_log_tipo_evento_check;

alter table evento_log add constraint evento_log_tipo_evento_check
  check (tipo_evento in (
    'criacao', 'edicao', 'exclusao', 'desabilitacao', 'reabilitacao', 'troca_responsavel'
  ));
